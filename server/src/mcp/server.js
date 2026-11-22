import { McpServer } from "@modelcontextprotocol/server";
import {
  serveStdio,
  StdioServerTransport,
} from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { TavilySearch } from "@langchain/tavily";
import { config } from "../config/env.js";
import jwt from "jsonwebtoken";
import { connectDB } from "../config/db.js";
import integrationModel from "../model/integration.model.js";
import { decrypt } from "../config/encrypt-decrypt.js";
import { googleOauthClient } from "../config/googleOAuth.js";
import { google } from "googleapis";
import axios from "axios";

const server = new McpServer({
  name: "automate-ai-mcp-server",
  version: "1.0.0",
});

const verifyAuthToken = (token) => {
  const payload = jwt.verify(
    token,
    config.MCP_AUTH_SECRET || config.JWT_SECRET,
    {
      algorithms: ["HS256"],
      issuer: "Automate-Backend",
      audience: "automate-mcp",
    },
  );
  return payload.sub;
};

const getHeader = (headers = [], nums) => {
  const header = headers.find((h) => h.name.toLowerCase());
  return header?.value || "";
};

const getGoogleOauthClient = async (userId, requiredService) => {
  await connectDB();
  const integration = await integrationModel
    .findOne({
      userId,
      provider: "google",
      services: requiredService,
      status: "connected",
    })
    .select("+tokens.refreshToken");
  if (!integration || !integration.tokens?.refreshToken) {
    throw new Error(
      `Google ${requiredService} is not connected or its refresh token is unavailable.`,
    );
  }

  const refresh_token = await decrypt(integration.tokens.refreshToken);

  const oAuthClient = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
  oAuthClient.setCredentials({ refresh_token });
  return oAuthClient;
};

const tavilySearch = new TavilySearch({
  maxResults: 3,
  topic: "general",
  tavilyApiKey: config.TAVILY_API_KEY,
});

server.registerTool(
  "web_search",
  {
    description: "Search the web for current information, tutorials, and news.",
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async ({ query }) => {
    try {
      const result = await tavilySearch.invoke({ query });
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: "web search failed",
          },
        ],
      };
    }
  },
);

server.registerTool(
  "send_email",
  {
    description:
      "Send an email through the authenticated user's connected Gmail account. Only execute after explicit user approval.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      to: z.string().trim().email(),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(2000),
    }),
  },
  async ({ authToken, to, subject, body }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOauthClient(userId, "gmail");

      const gmail = google.gmail({
        version: "v1",
        auth: oauthClient,
      });

      const cleanTo = to.trim();
      const base64Subject = Buffer.from(subject, "utf8").toString("base64");
      const encodedSubject = `=?utf-8?B?${base64Subject}?=`;

      const emailLines = [
        `To: ${cleanTo}`,
        `Subject: ${encodedSubject}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(body, "utf8").toString("base64"),
      ];

      const rawEmail = emailLines.join("\r\n");
      const encodedMessage = Buffer.from(rawEmail, "utf8").toString(
        "base64url",
      );

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedMessage },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Email sent successfully",
              messageId: response?.data?.id,
              recipient: to,
              subject,
            }),
          },
        ],
      };
    } catch (error) {
      console.error("send_email error:", error);
      return {
        content: [
          {
            type: "text",
            text: `send email failed: ${error.message || error}`,
          },
        ],
      };
    }
  },
);

const getHeaders = (headers, name) => {
  if (!Array.isArray(headers)) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value || "";
};

server.registerTool(
  "list_emails",
  {
    description:
      "List or search emails from the authenticated user's gmail account",
    inputSchema: z.object({
      authToken: z.string().min(1),
      query: z.string().trim().max(500).default("in:inbox"),
      maxResults: z.coerce.number().int().min(1).max(25).default(10),
    }),
  },
  async ({ authToken, query, maxResults }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOauthClient(userId, "gmail");

      const gmail = google.gmail({
        version: "v1",
        auth: oauthClient,
      });

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      const messageRef = listResponse.data.messages || [];

      const emails = await Promise.all(
        messageRef.map(async (ref) => {
          const response = await gmail.users.messages.get({
            id: ref.id,
            userId: "me",
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });
          const message = response?.data;
          const headers = message?.payload?.headers || [];
          return {
            id: message.id,
            threadId: message.threadId,
            from: getHeaders(headers, "From"),
            to: getHeaders(headers, "To"),
            subject: getHeaders(headers, "Subject"),
            date: getHeaders(headers, "Date"),
            snippet: message.snippet || "",
            unread: (message.labelIds || []).includes("UNREAD"),
          };
        }),
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              query,
              count: emails.length,
              nextPageToken: listResponse.data.nextPageToken || null,
              emails,
            }),
          },
        ],
      };
    } catch (error) {
      console.error("list_emails error:", error);
      return {
        content: [
          {
            type: "text",
            text: `list email failed: ${error.message || error}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  "create_calendar_event",
  {
    description:
      "Create an event in the authenticated user's primary Google Calendar. Resolve relative date using current date. Default timezone: Asia/Kolkata.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      summary: z.string().trim().min(1).max(200),
      description: z.string().trim().max(5000).optional(),
      startDateTime: z.string().datetime({ offset: true }),
      endDateTime: z.string().datetime({ offset: true }),
      timeZone: z.string().trim().min(1).default("Asia/Kolkata"),
    }),
  },
  async ({
    authToken,
    summary,
    description,
    startDateTime,
    endDateTime,
    timeZone,
  }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOauthClient(userId, "google_calender");
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);

      if (end <= start) {
        return {
          content: [
            {
              type: "text",
              text: "The event end time must be later than its start time",
            },
          ],
        };
      }
      if (start <= new Date()) {
        return {
          content: [
            {
              type: "text",
              text: "The event start time must be in the future",
            },
          ],
        };
      }

      const calendar = google.calendar({
        version: "v3",
        auth: oauthClient,
      });

      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary,
          ...(description ? { description } : {}),
          start: { dateTime: start.toISOString(), timeZone },
          end: { dateTime: end.toISOString(), timeZone },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Calendar event created successfully",
              event: {
                id: response.data.id,
                summary: response.data.summary,
                start: response.data.start,
                end: response.data.end,
                htmlLink: response.data.htmlLink,
              },
            }),
          },
        ],
      };
    } catch (error) {
      console.error("create_calendar_event error:", error);
      return {
        content: [
          {
            type: "text",
            text: `create event failed: ${error.message || error}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  "list_calendar_events",
  {
    description:
      "Retrieve events from the authenticated user's primary Google Calendar.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      timeMin: z.string().datetime({ offset: true }),
      timeMax: z.string().datetime({ offset: true }),
      maxResults: z.coerce.number().int().min(1).max(50).default(10),
    }),
  },
  async ({ authToken, timeMin, timeMax, maxResults }) => {
    try {
      const userId = verifyAuthToken(authToken);
      const oauthClient = await getGoogleOauthClient(userId, "google_calender");
      const start = new Date(timeMin);
      const end = new Date(timeMax);

      if (end <= start) {
        return {
          content: [
            {
              type: "text",
              text: "The event end time must be later than its start time",
            },
          ],
        };
      }

      const calendar = google.calendar({
        version: "v3",
        auth: oauthClient,
      });

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (response.data.items || []).map((event) => ({
        id: event.id,
        summary: event.summary || "no event title",
        description: event.description,
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        htmlLink: event.htmlLink,
        status: event.status,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: events.length,
              events,
            }),
          },
        ],
      };
    } catch (error) {
      console.error("list_calendar_events error:", error);
      return {
        content: [
          {
            type: "text",
            text: `list event failed: ${error.message || error}`,
          },
        ],
      };
    }
  },
);

server.registerTool(
  "publish_instagram_post",
  {
    description:
      "Publish an image to the authenticated user's connected Instagram account.",
    inputSchema: z.object({
      authToken: z.string().min(1),
      imageUrl: z
        .string()
        .url()
        .refine((url) => url.startsWith("https://")),
      caption: z.string().trim().max(2200).optional(),
    }),
  },
  async ({ authToken, imageUrl, caption }) => {
    try {
      const userId = verifyAuthToken(authToken);

      await connectDB();
      const integration = await integrationModel
        .findOne({
          userId,
          provider: "instagram",
          services: "instagram",
          status: "connected",
        })
        .select(
          "+tokens.accessToken providerAccountId account.username tokens.expiresAt",
        );
      if (!integration?.providerAccountId || !integration.tokens?.accessToken) {
        throw new Error(
          `Instagram is not connected or its access token is unavailable.`,
        );
      }

      const access_token = await decrypt(integration.tokens.accessToken);

      const graphVersion = config.INSTAGRAM_GRAPH_VERSION;

      const graphUrl = `https://instagram.com${graphVersion}`;

      const response = await axios.post(
        `${graphUrl}/${integration.providerAccountId}/media`,
        null,
        {
          params: { image_url: imageUrl, caption, access_token },
        },
      );

      const creationId = response.data?.id;

      const isReady = false;

      for (let attempt = 0; attempt < 10; attempt++) {
        const statusResponse = await axios.post(
          `${graphUrl}/${creationId}/media`,
          null,
          {
            params: { fields: "status_code", access_token },
          },
        );

        if (statusResponse.data?.status_code === "FINISHED") {
          isReady = true;
          break;
        }

        await Promise((r) => {
          setTimeout(r, 3000);
        });
      }

      if (!isReady) {
        return {
          content: [
            {
              type: "text",
              text: "Instagram media processing timeout.",
            },
          ],
        };
      }

      const publishResponse = await axios.post(
        `${graphUrl}/${integration.providerAccountId}/media_publish`,
        null,
        {
          params: { creation_id: creationId, access_token },
        },
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              mediaId: publishResponse.data?.id,
              caption,
            }),
          },
        ],
      };
    } catch (error) {
      console.error("publish_instagram_post error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Instagram publishing faild: ${error.message || error}`,
          },
        ],
      };
    }
  },
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp server started successfully");
};

main().catch((error) => {
  console.error("mcp server error", error);
  process.exit(1);
});
