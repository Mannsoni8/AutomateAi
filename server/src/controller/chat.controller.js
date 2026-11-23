import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import workFlow from "../utils/chatGraph.js";
import agentModel from "../model/agent.model.js";
import { createAgentGraph } from "../utils/agentGraph.js";

export const chatController = async (req, res) => {
  try {
    const { message, image_url, threadId: clientThreadId } = req.body;
    const text =
      typeof message === "string"
        ? message.trim()
        : (message?.message || message?.content || "").trim();
    const imageUrl = image_url || message?.image_url || null;

    if (!text && !imageUrl) {
      return res.status(400).json({ message: "Message required" });
    }

    const messageContent = imageUrl
      ? (text
          ? `${text}\n\nAttached image URL: ${imageUrl}`
          : `Attached image URL: ${imageUrl}`)
      : text;

    // Route action requests (such as Instagram publishing, email, calendar) to the tool-enabled agent graph
    const isActionRequest =
      Boolean(imageUrl) ||
      /instagram|post|publish|calendar|email|schedule|mail|search/i.test(text);

    let graphToInvoke = workFlow;
    let threadId = clientThreadId || req.user._id.toString();

    if (isActionRequest) {
      const userAgent = await agentModel.findOne({ userId: req.user._id });
      const agentConfig = userAgent || {
        name: "Automate Assistant",
        instructions:
          "You are Automate AI, a helpful personal assistant with web search, Gmail, Google Calendar, and Instagram publishing capabilities.",
      };
      graphToInvoke = await createAgentGraph(agentConfig, req.user._id);
      threadId =
        clientThreadId ||
        `${req.user._id.toString()}:${agentConfig._id || "default"}`;
    }

    const data = await graphToInvoke.invoke(
      {
        messages: [new HumanMessage(messageContent)],
      },
      { configurable: { thread_id: threadId }, recursionLimit: 25 },
    );

    if (data.__interrupt__ && data.__interrupt__.length > 0) {
      const interruptPayload = data.__interrupt__[0].value;
      return res.status(200).json({
        interrupted: true,
        interrupt: interruptPayload,
        threadId,
      });
    }

    const lastMessage = data.messages[data.messages.length - 1]?.content || "";

    return res.status(200).json(lastMessage);
  } catch (error) {
    const errorStr = String(error?.message || error);
    if (
      error?.status === 429 ||
      errorStr.includes("429") ||
      errorStr.includes("rate_limit_exceeded") ||
      errorStr.includes("RateLimitQuotaExhaustedError")
    ) {
      return res.status(429).json({
        message: "AI rate limit reached. Please wait a few seconds and try again.",
      });
    }
    return res.status(500).json({ message: `Chat controller error ${error.message || error}` });
  }
};

export const agentChatController = async (req, res) => {
  try {
    const { message, agent, image_url, threadId: clientThreadId } = req.body;
    const text =
      typeof message === "string"
        ? message.trim()
        : (message?.message || message?.content || "").trim();
    const imageUrl = image_url || message?.image_url || null;

    if (!text && !imageUrl) {
      return res.status(400).json({ message: "Message required" });
    }
    const existingAgent = await agentModel.findOne({
      name: agent,
      userId: req.user._id,
    });

    if (!existingAgent) {
      return res.status(400).json({
        message: "Agent not found",
      });
    }

    const messageContent = imageUrl
      ? (text
          ? `${text}\n\nAttached image URL: ${imageUrl}`
          : `Attached image URL: ${imageUrl}`)
      : text;

    const threadId =
      clientThreadId || `${req.user._id.toString()}:${existingAgent._id}`;

    const graph = await createAgentGraph(existingAgent, req.user._id);

    const result = await graph.invoke(
      {
        messages: [new HumanMessage(messageContent)],
      },
      { configurable: { thread_id: threadId }, recursionLimit: 25 },
    );

    if (result.__interrupt__ && result.__interrupt__.length > 0) {
      const interruptPayload = result.__interrupt__[0].value;
      return res.status(200).json({
        interrupted: true,
        interrupt: interruptPayload,
        threadId,
        agent: existingAgent.name,
      });
    }

    const lastMessage = result.messages[result.messages.length - 1]?.content || "";

    return res.status(200).json(lastMessage);
  } catch (error) {
    const errorStr = String(error?.message || error);
    if (
      error?.status === 429 ||
      errorStr.includes("429") ||
      errorStr.includes("rate_limit_exceeded") ||
      errorStr.includes("RateLimitQuotaExhaustedError")
    ) {
      return res.status(429).json({
        message: "AI rate limit reached. Please wait a few seconds and try again.",
      });
    }
    return res
      .status(500)
      .json({ message: `Agent Chat controller error ${error.message || error}` });
  }
};

export const resumeChatController = async (req, res) => {
  try {
    const { threadId, decision, agent } = req.body;
    if (!threadId) {
      return res.status(400).json({ message: "threadId is required" });
    }

    let graphToInvoke;
    if (agent) {
      const existingAgent = await agentModel.findOne({
        name: agent,
        userId: req.user._id,
      });
      if (!existingAgent) {
        return res.status(400).json({ message: "Agent not found" });
      }
      graphToInvoke = await createAgentGraph(existingAgent, req.user._id);
    } else {
      const userAgent = await agentModel.findOne({ userId: req.user._id });
      const agentConfig = userAgent || {
        name: "Automate Assistant",
        instructions:
          "You are Automate AI, a helpful personal assistant with web search, Gmail, Google Calendar, and Instagram publishing capabilities.",
      };
      graphToInvoke = await createAgentGraph(agentConfig, req.user._id);
    }

    const resumeDecision =
      typeof decision === "object" && decision !== null
        ? decision
        : { approved: Boolean(decision) };

    const command = new Command({ resume: resumeDecision });
    const result = await graphToInvoke.invoke(command, {
      configurable: { thread_id: threadId },
      recursionLimit: 25,
    });

    if (result.__interrupt__ && result.__interrupt__.length > 0) {
      return res.status(200).json({
        interrupted: true,
        interrupt: result.__interrupt__[0].value,
        threadId,
        agent,
      });
    }

    const lastMessage =
      result.messages[result.messages.length - 1]?.content || "";

    return res.status(200).json(lastMessage);
  } catch (error) {
    const errorStr = String(error?.message || error);
    if (
      error?.status === 429 ||
      errorStr.includes("429") ||
      errorStr.includes("rate_limit_exceeded") ||
      errorStr.includes("RateLimitQuotaExhaustedError")
    ) {
      return res.status(429).json({
        message: "AI rate limit reached. Please wait a few seconds and try again.",
      });
    }
    return res
      .status(500)
      .json({ message: `Resume chat error ${error.message || error}` });
  }
};
