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
import {
  convertCloudinaryToJpeg,
  validateInstagramImage,
  sanitizeMetaError,
} from "../utils/instagramUtils.js";
import axios from "axios";
import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.8-flash-lite",
  "gemini-3.8-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

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
      "Send an email through the authenticated user's connected Gmail account.",
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
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "Instagram is not connected or its access token is unavailable. Please connect your Instagram account first.",
                code: "INSTAGRAM_NOT_CONNECTED",
              }),
            },
          ],
        };
      }

      const access_token = await decrypt(integration.tokens.accessToken);

      const rawVersion = config.INSTAGRAM_GRAPH_VERSION || "v24.0";
      const cleanVersion = rawVersion.replace(/^\/+/, "");
      const graphUrl = `https://graph.facebook.com/${cleanVersion}`;

      // Convert Cloudinary image to JPEG format
      const finalImageUrl = convertCloudinaryToJpeg(imageUrl);

      // Validate image accessibility and Content-Type
      const imageValidation = await validateInstagramImage(finalImageUrl);
      if (!imageValidation.valid) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: imageValidation.error,
                code: imageValidation.code,
                imageUrl: finalImageUrl,
              }),
            },
          ],
        };
      }

      // Step 1: Create Media Container
      let createResponse;
      try {
        createResponse = await axios.post(
          `${graphUrl}/${integration.providerAccountId}/media`,
          null,
          {
            params: {
              image_url: finalImageUrl,
              caption: caption || "",
              access_token,
            },
            timeout: 20000,
          },
        );
      } catch (err) {
        const sanitized = sanitizeMetaError(err);
        console.error("Meta media container creation failed:", sanitized);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Meta container creation failed: ${sanitized.message}`,
                code: sanitized.code,
              }),
            },
          ],
        };
      }

      const creationId = createResponse.data?.id;
      if (!creationId) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Failed to create media container ID from Meta.",
                code: "CONTAINER_CREATION_FAILED",
              }),
            },
          ],
        };
      }

      // Step 2: Poll Container Processing Status
      let isReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          const statusResponse = await axios.get(`${graphUrl}/${creationId}`, {
            params: { fields: "status_code,status", access_token },
            timeout: 10000,
          });

          const statusCode = statusResponse.data?.status_code;

          if (statusCode === "FINISHED") {
            isReady = true;
            break;
          }

          if (statusCode === "ERROR" || statusCode === "EXPIRED") {
            const detail =
              statusResponse.data?.status ||
              "Container processing failed on Meta.";
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Instagram media processing failed: ${statusCode} - ${detail}`,
                    code: `CONTAINER_${statusCode}`,
                  }),
                },
              ],
            };
          }
        } catch (pollErr) {
          console.warn(
            `Polling container ${creationId} attempt ${attempt + 1} error:`,
            pollErr.message,
          );
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!isReady) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "Instagram media processing timed out. Image was not ready within 30 seconds.",
                code: "MEDIA_PROCESSING_TIMEOUT",
              }),
            },
          ],
        };
      }

      // Step 3: Publish Container
      let publishResponse;
      try {
        publishResponse = await axios.post(
          `${graphUrl}/${integration.providerAccountId}/media_publish`,
          null,
          {
            params: { creation_id: creationId, access_token },
            timeout: 20000,
          },
        );
      } catch (err) {
        const sanitized = sanitizeMetaError(err);
        console.error("Meta media publish failed:", sanitized);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Meta media publish failed: ${sanitized.message}`,
                code: sanitized.code,
              }),
            },
          ],
        };
      }

      const mediaId = publishResponse.data?.id;
      if (!mediaId) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error:
                  "Instagram did not return a verified media ID after publication.",
                code: "PUBLISH_VERIFICATION_FAILED",
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              mediaId,
              caption: caption || "",
              imageUrl: finalImageUrl,
              publishedAt: new Date().toISOString(),
              message: "Instagram post published successfully",
            }),
          },
        ],
      };
    } catch (error) {
      console.error("publish_instagram_post unexpected error:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Instagram publishing failed: ${error.message || error}`,
              code: "UNEXPECTED_ERROR",
            }),
          },
        ],
      };
    }
  },
);

server.registerTool(
  "analyze_image",
  {
    description: `
Analyze an image using this tool.

Use this tool whenever the user uploads or provides an image
and asks a question about it, or simply wants to know what
the image contains.

Examples:
- What is in this image?
- Describe this image.
- Explain this screenshot.
- Read the text in this image.
- Explain this code screenshot.

IMPORTANT:
- Analyze the image and answer the user's question.
- If the user only uploads an image without a question,
  describe the image and its important visible details.
- Never suggest publishing the image to Instagram unless
  the user explicitly asks to publish or post it.
- This tool only analyzes images. It never publishes them.
`,

    inputSchema: z.object({
      imageUrl: z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"), {
          message: "Image URL must be a valid HTTPS URL",
        }),
      prompt: z
        .string()
        .trim()
        .max(2200)
        .default("Describe this image clearly and accurately."),
    }),
  },
  async ({ imageUrl, prompt }) => {
    try {
      const imageResponse = await fetch(imageUrl, {
        signal: AbortSignal.timeout(15000),
      });

      if (!imageResponse.ok) {
        throw new Error(`Image fetch failed: ${imageResponse.status}`);
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
      const contentLength = imageResponse.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        throw new Error("Image exceeds 10 MB");
      }

      const chunks = [];
      let totalBytes = 0;

      if (!imageResponse.body) {
        throw new Error("Empty image response");
      }

      for await (const chunk of imageResponse.body) {
        totalBytes += chunk.length;

        if (totalBytes > maxBytes) {
          await imageResponse.body.cancel().catch(() => {});
          throw new Error("Image exceeds 10 MB");
        }

        chunks.push(Buffer.from(chunk));
      }

      const base64image = Buffer.concat(chunks).toString("base64");

      const analysisPrompt =
        prompt && typeof prompt === "string" && prompt.trim()
          ? prompt.trim()
          : "Describe this image clearly and accurately.";

      const message = new HumanMessage({
        content: [
          {
            type: "text",
            text: analysisPrompt,
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
            apiKey:
              config.GOOGLE_API_KEY ||
              process.env.GOOGLE_API_KEY ||
              process.env.GEMINI_API_KEY,
          });

          const response = await analyzer.invoke([message]);

          let analysisText = "";
          if (typeof response.content === "string") {
            analysisText = response.content.trim();
          } else if (Array.isArray(response.content)) {
            analysisText = response.content
              .map((item) => (typeof item === "string" ? item : item?.text || ""))
              .filter(Boolean)
              .join("\n")
              .trim();
          }

          if (!analysisText) {
            throw new Error("Gemini returned an empty image analysis");
          }

          console.log(`Image analysis completed using ${model}`);

          return {
            content: [
              {
                type: "text",
                text: analysisText,
              },
            ],
          };
        } catch (error) {
          lastError = error;

          const status = Number(
            error.status ?? error.statusCode ?? error.response?.status,
          );

          const temporary =
            [404, 429, 500, 502, 503, 504].includes(status) ||
            /high demand|overloaded|temporarily unavailable|resource exhausted|rate limit|no longer available|not found|deprecated/i.test(
              error.message || "",
            );

          if (!temporary) {
            throw error;
          }

          console.warn(
            `Gemini ${model} temporarily unavailable. Trying fallback.`,
          );
        }
      }

      throw lastError || new Error("All Gemini models failed");
    } catch (error) {
      console.error("analyze_image unexpected error:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Image analysis failed: ${error.message || error}`,
              code: "IMAGE_ANALYSIS_ERROR",
            }),
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
