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
import { invokeWithRateLimitRetry } from "./retry.js";

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

const limitMessageContext = (message, maxChar = 2000) => {
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

Context & Rules:
- Current timestamp in Asia/Kolkata: ${currentDateTime}
- Timezone: Asia/Kolkata. Default event duration: 30 minutes.
- Resolve relative dates (today, tomorrow, weekdays) using the current timestamp.
- When an action is directly requested, call the appropriate tool.
- Never ask for passwords, API keys, tokens, or user IDs.
- Never fabricate search results or tool confirmations.
- Be concise, accurate, and helpful.
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

    const response = await invokeWithRateLimitRetry(() =>
      llmWithTools.invoke([
        new SystemMessage(systemPrompt),
        ...recentMessages,
      ]),
    );

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
