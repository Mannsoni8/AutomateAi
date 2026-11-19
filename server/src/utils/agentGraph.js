import { ChatGroq } from "@langchain/groq";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import { config } from "../config/env.js";
import {
  END,
  START,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { getMcpTools } from "../mcp/langgrap-mcp.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import z from "zod";
import jwt from "jsonwebtoken"

const llm = new ChatGroq({
  model: config.GROQ_MODEL || "openai/gpt-oss-120b",
  temperature: 0,
  maxTokens: undefined,
  maxRetries: 2,
  // other params...
});

const client = new MongoClient(config.MONGO_URI);
const checkpointer = new MongoDBSaver({ client, dbName: "langgraph" });

const findTool = (tools, names) => {
  if (!Array.isArray(tools)) return null;
  return tools.find((tool) =>
    names?.some((name) => tool.name?.toLowerCase().includes(name.toLowerCase())),
  );
};

const makeAuthToken = async (userId) => {
  return jwt.sign({},config.MCP_AUTH_SECRET,{
    algorithm:"HS256",
    subject:String(userId),
    expiresIn:"2m",
    issuer:"Automate-Backend",
    audience:"automate-mcp"
  })
}


const limitMessageContext = (message, maxChar = 4000) => {
  if (!message || typeof message.content !== "string") {
    return message;
  }
  if (message.content.length <= maxChar) {
    return message;
  }

  return {
    ...message,
    content: message.content.slice(0, maxChar) + "\n[content truncated]",
  };
};

export const createAgentGraph = async (agent, userId) => {
  const mcpTools = await getMcpTools();
  console.log(mcpTools);

  const webSearchMcpTool = findTool(mcpTools, [
    "web_search",
    "automate_web_search",
    "autoMate_web_search",
  ]);

  const finalTools = [];
  if (webSearchMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "web_search",
        description: `Search the web for current information, news, tutorials, documentation, and factual questions.`,
        schema: z.object({
          query: z.string().describe("The search query"),
        }),
        func: async ({ query }) => {
          try {
            const result = await webSearchMcpTool.invoke({ query });
            return result;
          } catch (error) {
            console.error("❌ MCP search Error: ", error);
            return "Search failed";
          }
        },
      }),
    );
  }

  const llmWithTools = finalTools.length > 0 ? llm.bindTools(finalTools) : llm;

  const currentDateTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date());

  const systemPrompt = `
${agent.instructions || "You are Automate AI, a helpful personal assistant."}

CURRENT DATE AND TIME:
- Current date and time in Asia/Kolkata: ${currentDateTime}
- Resolve today, tomorrow, and weekday references using this timestamp.
- Do not ask the user to confirm a date that can be resolved.

DEFAULT SETTINGS:
- Timezone: Asia/Kolkata.
- Default calendar event duration: 30 minutes.
- Infer meaningful event titles.
- Ask only for essential missing information.
- Never fabricate tool results.

IMPORTANT ACTION RULE:
- When the user directly requests an action, call the relevant tool.
- The application handles approval through an approval card.
- Do not ask for approval in your chat response.
- Never claim an action succeeded unless the tool confirms success.

EMAIL SENDING RULES:
1. Call send_email when the required details are available.
2. Ask for the recipient only when it is missing and cannot be inferred.
3. Never ask for passwords, tokens, API keys, or user IDs.
4. The application requests approval before sending.
5. Never claim an email was sent without tool confirmation.

CALENDAR RULES:
1. Call create_calendar_event when sufficient details are available.
2. Do not ask "Would you like me to create it?"
3. Resolve relative dates using the current date above.
4. Default duration is 30 minutes.
5. Use ISO 8601 date-time strings with an explicit timezone offset.
6. Set timeZone to "Asia/Kolkata".
7. Ask a follow-up only when an essential detail is missing.
8. Use list_calendar_events to retrieve existing events.
9. Never claim an event was created without tool confirmation.

GMAIL EMAIL READING RULES:
1. Use list_emails when the user asks to see or search emails.
2. Use "in:inbox" for the latest inbox emails.
3. Use "is:unread" for unread emails.
4. Use Gmail search syntax for sender and subject searches.
5. Use read_email to retrieve a specific email's content.
6. If its message ID is unknown, call list_emails first.
7. Summarize actual retrieved email content.
8. Never invent email content.
9. Reading and searching emails are read-only.
10. Use list_emails and read_email, not their raw MCP tool names.

WEB SEARCH RULES:
1. Use the web_search tool when the user asks for current information, latest updates, news, research, or information from the internet.
2. Search the web when the answer requires up-to-date information that may have changed.
3. Do not use web search for simple general knowledge questions that can be answered reliably without it.
4. Understand the user's search intent before generating search queries.
5. Use relevant keywords and specific search queries.
6. Summarize the search results in clear and simple language.
7. Provide source URLs or citations whenever available.
8. Prefer reliable and authoritative sources.
9. Never fabricate search results, URLs, sources, or citations.
10. If search results are insufficient, perform another relevant search.
11. Clearly mention when information could not be verified.
12. Never claim that a web search was performed if the tool was not actually called.

INSTAGRAM PUBLISHING RULES:
1. Call publish_instagram_image ONLY when the latest user message explicitly requests publishing, posting, sharing, or uploading an image to Instagram.
2. Uploading an image to chat is NOT permission to publish it.
3. Asking for image analysis, a description, or an Instagram caption is NOT permission to publish.
4. Never trigger publishing from an image upload alone.
5. Never infer publishing intent from an image URL, filename, image description, or unrelated previous conversation.
6. If the user only uploads an image, analyze it and describe it.
7. If the user asks for a caption, generate the caption without publishing.
8. If publishing intent is explicit but the image URL is missing, ask the user to upload the image first.
9. The application must obtain explicit approval before publishing.
10. Never claim a post was published without tool confirmation.

IMAGE ANALYSIS RULES:
1. If the user uploads an image or asks a question about an image, use analyze_image when the image URL is available.
2. If the user uploads an image without a question, analyze it and provide a useful description.
3. Answer image-related questions using the actual analysis.
4. Never call publish_instagram_image for image analysis or description.
5. Never suggest publishing solely because an image was uploaded.
6. Keep image analysis and Instagram publishing as separate actions.
7. If image analysis fails, explain the failure honestly.
8. Never claim to have viewed an image if analysis failed.

GENERAL RULES:
- Be concise and helpful.
- Infer parameters when sufficient context is available.
- Never substitute a natural-language promise for a tool call.
- Ask questions only when essential information is missing.
`;

  const approvalTools = new Set([
    "send_email",
    "create_calendar_event",
    "publish_instagram_image",
  ]);

  const chatNode = async (state) => {
    const recentMessages = state.messages
      .slice(-4)
      .map((message) => limitMessageContext(message));

    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...recentMessages,
    ]);

    return {
      messages: [response],
    };
  };
  const toolNode = new ToolNode(finalTools);

  const actionApprovalNode = async (state) => {
    return state;
  };

  const routeAfterChat = (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];

    // If no tool calls were generated, the model has completed its reply -> End graph
    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return END;
    }

    const requiresApproval = lastMessage.tool_calls.some((call) =>
      approvalTools.has(call.name),
    );
    return requiresApproval ? "actionApprovalNode" : "tools";
  };

  const routeAfterApproval = () => {
    return "tools";
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("chatNode", chatNode)
    .addNode("tools", toolNode)
    .addNode("actionApprovalNode", actionApprovalNode)
    .addEdge(START, "chatNode")
    .addConditionalEdges("chatNode", routeAfterChat)
    .addEdge("tools", "chatNode")
    .addConditionalEdges("actionApprovalNode", routeAfterApproval);

  const chatAgentGraph = workflow.compile({ checkpointer });

  return chatAgentGraph;
};