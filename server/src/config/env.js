import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
  quiet: true,
});

export const config = {
  PORT: process.env.PORT || 8000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  FRONTED_URL: process.env.FRONTED_URL,
  INSTAGRAM_CONFIG_ID: process.env.INSTAGRAM_CONFIG_ID,
  INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI,
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
  INSTAGRAM_GRAPH_VERSION: process.env.INSTAGRAM_GRAPH_VERSION,
  MCP_AUTH_SECRET: process.env.MCP_AUTH_SECRET || process.env.JWT_SECRET,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
};
