import { ChatGroq } from "@langchain/groq";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import { config } from "../config/env.js";
import {
  END,
  START,
  MessagesAnnotation,
  StateGraph,
  interrupt,
  Command,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { getMcpTools } from "../mcp/langgrap-mcp.js";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { invokeWithRateLimitRetry } from "./retry.js";
import { sanitizeMessages } from "./sanitizeMessages.js";
import { isExplicitConfirmation } from "./instagramUtils.js";
import { ChatGoogle } from "@langchain/google";

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

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

const generateCaption = async (imageUrl) => {
  try {
    const url = new URL(imageUrl);

    if (url.protocol !== "https:") {
      throw new Error("Image must use HTTPS");
    }

    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!imageResponse.ok) {
      throw new Error(
        `Image fetch failed: ${imageResponse.status}`
      );
    }

    const contentType = imageResponse.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      ?.toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error("Unsupported image content type");
    }

    const maxBytes = 10 * 1024 * 1024;
    const chunks = [];
    let totalBytes = 0;

    if (!imageResponse.body) {
      throw new Error("Empty image response");
    }

    for await (const chunk of imageResponse.body) {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        await imageResponse.body.cancel().catch(() => { });
        throw new Error("Image exceeds 10 MB");
      }

      chunks.push(Buffer.from(chunk));
    }

    const base64image = Buffer.concat(chunks).toString("base64");

    const message = new HumanMessage({
      content: [
        {
          type: "text",
          text: `Analyze this image and generate a catchy Instagram caption with relevant hashtags. Output ONLY the caption and hashtags. No introductions or explanations.`,
        },
        {
          type: "image_url",
          image_url: `data:${contentType};base64,${base64image}`,
        },
      ],
    });

    let lastError;

    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Trying Gemini model: ${model}`);

        const analyzer = new ChatGoogle({
          model,
          temperature: 0,
          maxRetries: 0,
        });

        const response = await analyzer.invoke([message]);

        const caption =
          typeof response.content === "string"
            ? response.content.trim()
            : "";

        if (!caption) {
          throw new Error("Gemini returned an empty caption");
        }

        console.log(`Caption generated using ${model}`);

        return caption.slice(0, 2200);
      } catch (error) {
        lastError = error;

        const status = Number(
          error.status ??
          error.statusCode ??
          error.response?.status
        );

        const temporary =
          [429, 500, 502, 503, 504].includes(status) ||
          /high demand|overloaded|temporarily unavailable|resource exhausted|rate limit/i.test(
            error.message || ""
          );

        if (!temporary) {
          throw error;
        }

        console.warn(
          `Gemini ${model} temporarily unavailable. Trying fallback.`
        );
      }
    }

    throw lastError || new Error("All Gemini models failed");
  } catch (error) {
    console.error("Caption generation error:", error.message);
    throw error;
  }
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

  const webSearchMcpTool = findTool(mcpTools, [
    "web_search",
    "autoMate_web_search",
  ]);

  const sendEmailMcpTool = findTool(mcpTools, [
    "send_email",
    "autoMate_send_email",
  ]);

  const createEventMcpTool = findTool(mcpTools, [
    "create_calendar_event",
    "autoMate_create_calendar_event",
  ]);

  const listEmailsMcpTool = findTool(mcpTools, [
    "list_emails",
    "autoMate_list_emails",
  ]);

  const listCalenderEventsMcpTool = findTool(mcpTools, [
    "list_calendar_events",
    "autoMate_list_calendar_event",
  ]);

  const publishOnInstagramMcpTool = findTool(mcpTools, [
    "publish_instagram_post",
    "autoMate_publish_instagram_post",
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
 
        IMPORTANT: Call this tool immediately when the user asks to send an email. Do not ask for confirmation in your text response before calling this tool; the system UI handles user approval automatically upon invocation.
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

         IMPORTANT: Call this tool immediately when the user requests creating or scheduling an event. Do not ask for confirmation in your text response before calling this tool; the system UI handles user approval automatically upon invocation.
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

  if (publishOnInstagramMcpTool) {
    finalTools.push(
      new DynamicStructuredTool({
        name: "publish_instagram_post",
        description: `
        Publish an image to the authenticated user's connected Instagram account.
        Use only when the user explicitly requests publishing or posting to Instagram.
        Requires a valid public HTTPS imageUrl and an optional caption.
        IMPORTANT: Call this tool immediately when the user requests publishing to Instagram. Do not ask for confirmation in your text response before calling this tool; the system UI handles user approval automatically upon invocation.
        `,
        schema: z.object({
          imageUrl: z
            .string()
            .url()
            .describe("Publicly accessible HTTPS image URL to publish"),
          caption: z
            .string()
            .trim()
            .max(2200)
            .optional()
            .describe("Caption and hashtags for the Instagram post"),
        }),
        func: async ({ imageUrl, caption }) => {
          try {
            let finalCaption = caption;
            if (!finalCaption) {
              try {
                finalCaption = await generateCaption(imageUrl);
              } catch (e) {
                console.warn("Caption generation failed:", e.message || e);
              }
            }

            const authToken = makeAuthToken(userId);
            const result = await publishOnInstagramMcpTool.invoke({
              authToken,
              imageUrl,
              caption: finalCaption || "",
            });
            return result;
          } catch (error) {
            console.error("❌ MCP publish_instagram_post Error: ", error);
            return `Publish instagram post failed: ${error.message || error}`;
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
- Immediate Tool Invocations:
  * When the user requests creating a calendar event, sending an email, or publishing a post to Instagram, you MUST call the appropriate tool (create_calendar_event, send_email, publish_instagram_post) IMMEDIATELY with the extracted parameters.
  * DO NOT ask the user for confirmation in chat text (e.g., do NOT say "Would you like me to create this event?", "Should I proceed?", or "I am ready to create..."). The system automatically intercepts the tool call and displays an interactive approval UI card for the user.
  * Your responsibility is to call the tool directly.
- When a user message includes an "Attached image URL: https://..." line, treat it as the public image attached to that turn.
- If the user asks to publish that image on Instagram, call publish_instagram_post with the exact attached URL as imageUrl immediately.
- Never ask for passwords, API keys, tokens, or user IDs.
- Never fabricate search results or tool confirmations.
- Be concise, accurate, and helpful.
`;

  const approvalTools = new Set([
    "send_email",
    "create_calendar_event",
    "publish_instagram_post",
  ]);

  const chatNode = async (state) => {
    const cleanMessages = sanitizeMessages(state.messages || []);
    const recentMessages = cleanMessages
      .slice(-4)
      .map((message) => limitMessageContext(message));

    const response = await invokeWithRateLimitRetry(() =>
      llmWithTools.invoke([new SystemMessage(systemPrompt), ...recentMessages]),
    );

    return {
      messages: [response],
    };
  };
  const toolNode = new ToolNode(finalTools);

  const actionApprovalNode = async (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];

    // Find approval-protected tool calls
    const protectedToolCalls =
      lastMessage?.tool_calls?.filter((call) =>
        approvalTools.has(call.name),
      ) || [];

    if (protectedToolCalls.length === 0) {
      return state;
    }

    if (protectedToolCalls.length > 1) {
      return {
        messages: protectedToolCalls.map(
          (call) =>
            new ToolMessage({
              tool_call_id: call.id,
              content: JSON.stringify({
                success: false,
                message: "Please request one approval-protected action at a time.",
              }),
            }),
        ),
      };
    }

    const actionCall = protectedToolCalls[0];
    const args = actionCall.args || {};

    if (actionCall.name === "send_email") {
      const { to, subject, body } = args;

      if (
        typeof to !== "string" ||
        typeof subject !== "string" ||
        typeof body !== "string" ||
        !to.trim() ||
        !subject.trim() ||
        !body.trim()
      ) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "Please provide a valid recipient email, subject, and body.",
              }),
            }),
          ],
        };
      }

      const decision = interrupt({
        type: "email_approval",
        action: "send_email",
        tool_call_id: actionCall.id,
        email: { to: to.trim(), subject: subject.trim(), body: body.trim() },
        message: `Please review and approve sending this email to ${to.trim()}.`,
      });

      if (!decision || decision.approved !== true) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                rejected: true,
                message: decision?.reason || "Sending email was cancelled by user.",
              }),
            }),
          ],
        };
      }

      return {};
    }

    if (actionCall.name === "create_calendar_event") {
      const { summary, description, startDateTime, endDateTime, timeZone } =
        args;

      if (
        typeof summary !== "string" ||
        !summary.trim() ||
        !startDateTime ||
        !endDateTime
      ) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "Please provide valid event summary, start time, and end time.",
              }),
            }),
          ],
        };
      }

      const decision = interrupt({
        type: "calendar_event_approval",
        action: "create_calendar_event",
        tool_call_id: actionCall.id,
        event: {
          summary: summary.trim(),
          description: description || "",
          startDateTime,
          endDateTime,
          timeZone: timeZone || "Asia/Kolkata",
        },
        message: `Please review and approve creating the calendar event: "${summary.trim()}".`,
      });

      if (!decision || decision.approved !== true) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                rejected: true,
                message: decision?.reason || "Calendar event creation was cancelled by user.",
              }),
            }),
          ],
        };
      }

      return {};
    }

    if (actionCall.name === "publish_instagram_post") {
      const { imageUrl, caption } = args;

      if (typeof imageUrl !== "string" || !imageUrl.trim()) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                message: "Invalid Instagram post details. A valid HTTPS image URL is required.",
              }),
            }),
          ],
        };
      }

      let postCaption = typeof caption === "string" ? caption.trim() : "";
      if (!postCaption && imageUrl) {
        try {
          postCaption = await generateCaption(imageUrl);
          actionCall.args.caption = postCaption;
        } catch (e) {
          console.warn("Caption generation preview failed:", e.message || e);
        }
      }

      const decision = interrupt({
        type: "instagram_post_approval",
        action: "publish_instagram_post",
        tool_call_id: actionCall.id,
        post: {
          imageUrl: imageUrl.trim(),
          caption: postCaption || "",
        },
        message: "Please review and approve publishing this post to Instagram.",
      });

      if (!decision || decision.approved !== true) {
        return {
          messages: [
            new ToolMessage({
              tool_call_id: actionCall.id,
              content: JSON.stringify({
                success: false,
                rejected: true,
                message: decision?.reason || "Instagram post publication was cancelled by user.",
              }),
            }),
          ],
        };
      }

      return {};
    }

    return state;
  };

  const routeAfterChat = (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return END;
    }

    const requiresApproval = lastMessage.tool_calls.some((call) =>
      approvalTools.has(call.name),
    );
    return requiresApproval ? "actionApprovalNode" : "tools";
  };

  const routeAfterApproval = (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (lastMessage instanceof ToolMessage) {
      return "chatNode"
    }

    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return END;
    }

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