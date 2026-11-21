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
import jwt from "jsonwebtoken";

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
    names?.some((name) =>
      tool.name?.toLowerCase().includes(name.toLowerCase()),
    ),
  );
};

const makeAuthToken = (userId) => {
  return jwt.sign({}, config.MCP_AUTH_SECRET || config.JWT_SECRET, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: "2m",
    issuer: "Automate-Backend",
    audience: "automate-mcp",
  });
};

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
    // "automate_web_search",
    "autoMate_web_search",
  ]);

  const sendEmailMcpTool = findTool(mcpTools, [
    "send_email",
    "autoMate_send_email",
  ]);

  const createEventMcpTool = findTool(mcpTools, [
    "create_calendar_event",
    // "create_calender_event",
    // "creat_calender_event",
    "autoMate_create_calendar_event",
  ]);

  const listEmailsMcpTool = findTool(mcpTools, [
    "list_emails",
    "autoMate_list_emails",
  ]);

  const listCalenderEventsMcpTool = findTool(mcpTools, [
    "list_calendar_events",
    // "list_calender_event",
    "autoMate_list_calendar_event",
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

  if (sendEmailMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "send_email",
        description: `
        Send an email using the authenticated user's connected Gmail account.

        Infer a suitable email subject and body from the user's request.

        If the user says "send an email and say hello":
         - Subject: Hello
         - Body: hello

        Ask for the recipient email only if it is missing and cannot be
        inferred from the conversation.

        Never ask for authentication tokens, API keys, passwords, or user IDs.
 
        The application will request explicit approval before sending the email.
         `,
        schema: z.object({
          to: z.string().email().describe("recipient email address"),
          subject: z.string().trim().min(1).max(200).describe("email subject"),
          body: z.string().trim().min(1).max(2000).describe("email body"),
        }),
        func: async ({ to, subject, body }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await sendEmailMcpTool.invoke({
              authToken,
              to,
              subject,
              body,
            });
            return result;
          } catch (error) {
            console.error("❌ MCP send_email Error: ", error);
            return "Send Email failed";
          }
        },
      }),
    );
  }

  if (createEventMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "create_calendar_event",
        description: `
         Create an event in the authenticated user's primary Google Calendar.

         Infer the title and description from the user's request.

         Date and time rules:
           - Interpret today, tomorrow, and weekday references using the current
         date and time supplied in the conversation.
           - Default timezone: Asia/Kolkata.
           - If duration is missing, use 30 minutes.
           - Use ISO 8601 date-time strings with explicit timezone offsets.
           - If an essential meeting time is missing and cannot be inferred,
         ask the user instead of inventing a time.

         The application requires explicit approval before creating an event.
`,
        schema: z.object({
          summary: z.string().trim().min(1).max(200).describe("event title"),
          description: z
            .string()
            .trim()
            .max(5000)
            .optional()
            .describe("event description"),
          startDateTime: z
            .string()
            .describe("Event start in ISO 8601 with timezone offset")
            .datetime({ offset: true }),
          endDateTime: z
            .string()
            .datetime({ offset: true })
            .describe("Event end in ISO 8601 with timezone offset"),
          timeZone: z
            .string()
            .trim()
            .min(1)
            .default("Asia/Kolkata")
            .describe("timezone"),
        }),
        func: async ({
          summary,
          description,
          startDateTime,
          endDateTime,
          timeZone,
        }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await createEventMcpTool.invoke({
              authToken,
              summary,
              description,
              startDateTime,
              endDateTime,
              timeZone,
            });
            return result;
          } catch (error) {
            console.error("❌ MCP create_calendar_event Error: ", error);
            return "Create Calendar Event failed";
          }
        },
      }),
    );
  }

  if (listEmailsMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "list_emails",
        description: `
Search or list emails from the authenticated user's connected Gmail.

Examples:
- Show my latest emails.
- Show unread emails.
- Find emails from a specific sender.
- Find emails about an invoice.

Use Gmail search syntax:
- in:inbox
- is:unread
- from:someone@example.com
- subject:invoice
- newer_than:7d

Rules:
- For latest inbox emails, use "in:inbox".
- For unread emails, use "is:unread".
- Use maxResults 10 by default.
- This is read-only and does not require approval.
- Never invent email results.
`,
        schema: z.object({
          query: z.string().trim().max(500).default("in:inbox"),
          maxResults: z.coerce.number().int().min(1).max(25).default(10),
        }),
        func: async ({ query, maxResults }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await listEmailsMcpTool.invoke({
              authToken,
              query,
              maxResults,
            });
            return result;
          } catch (error) {
            console.error("❌ MCP list_emails Error: ", error);
            return "List Emails failed";
          }
        },
      }),
    );
  }

  if (listCalenderEventsMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "list_calendar_events",
        description: `
Retrieve events from the authenticated user's primary Google Calendar.

Date and time rules:
- Provide timeMin and timeMax as ISO 8601 strings with timezone offset.
- Default to 10 results.
- This is read-only and does not require approval.
`,
        schema: z.object({
          timeMin: z
            .string()
            .datetime({ offset: true })
            .describe("Start of time range in ISO 8601"),
          timeMax: z
            .string()
            .datetime({ offset: true })
            .describe("End of time range in ISO 8601"),
          maxResults: z.coerce.number().int().min(1).max(50).default(10),
        }),
        func: async ({ timeMin, timeMax, maxResults }) => {
          try {
            const authToken = makeAuthToken(userId);
            const result = await listCalenderEventsMcpTool.invoke({
              authToken,
              timeMin,
              timeMax,
              maxResults,
            });
            return result;
          } catch (error) {
            console.error("❌ MCP list_calendar_events Error: ", error);
            return "List Calendar Events failed";
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
    // "send_email",
    // "create_calendar_event",
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
