import { ChatGroq } from "@langchain/groq";
import { SystemMessage } from "@langchain/core/messages";
import {
  END,
  //   MemorySaver,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import { config } from "../config/env.js";
import { invokeWithRateLimitRetry } from "./retry.js";
import { sanitizeMessages } from "./sanitizeMessages.js";

const llm = new ChatGroq({
  model: config.GROQ_MODEL || "openai/gpt-oss-120b",
  temperature: 0.3,
  maxTokens: undefined,
  maxRetries: 2,
});

const client = new MongoClient(config.MONGO_URI);
const checkpointer = new MongoDBSaver({ client, dbName: "langgraph" });

const defaultSystemMessage = new SystemMessage(
  "You are Automate AI, a helpful, polite, and intelligent AI personal assistant. Answer the user's questions clearly, accurately, and concisely. Provide helpful responses using your knowledge without attempting to invoke tools or generate tool call syntax."
);

const chatNode = async (state) => {
  const cleanMessages = sanitizeMessages(state.messages || []);
  const recentMessages = cleanMessages.slice(-6);
  const response = await invokeWithRateLimitRetry(() =>
    llm.invoke([defaultSystemMessage, ...recentMessages]),
  );

  return {
    messages: [response],
  };
};

const workFlow = new StateGraph(MessagesAnnotation)
  .addNode("chatNode", chatNode)
  .addEdge(START, "chatNode")
  .addEdge("chatNode", END)
  .compile({ checkpointer });

export default workFlow;
