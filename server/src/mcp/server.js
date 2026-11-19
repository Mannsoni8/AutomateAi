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

const server = new McpServer({
  name: "automate-ai-mcp-server",
  version: "1.0.0",
});

const verifyAuthToken = async (token) => {
  const payload = jwt.verify(token, config.MCP_AUTH_SECRET, {
    algorithms: ["HS256"],
    issuer: "Automate-Backend",
    audience: "automate-mcp",
  });
  return payload.sub
};

const getGoogleOauthClient= (userId,requiredService) => {
  connectDB()
} 

const tavilySearch = new TavilySearch({
  maxResults: 5,
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
            text: result,
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
      to: z.string().email(),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(2000),
    }),
  },
  async ({ authToken, to, subject, body }) => {
    try {
      const userId = verifyAuthToken(authToken)


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

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp server started successfully");
};

main().catch((error) => {
  console.error("mcp server error", error);
  process.exit(1);
});
