import { HumanMessage } from "@langchain/core/messages";
import workFlow from "../utils/chatGraph.js";
import agentModel from "../model/agent.model.js";
import { createAgentGraph } from "../utils/agentGraph.js";

export const chatController = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }
    const threadId = req.user._id.toString();
    const data = await workFlow.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      { configurable: { thread_id: threadId } },
    );
    const lastMessage = data.messages[data.messages.length - 1].content;

    return res.status(200).json(lastMessage);
  } catch (error) {
    return res.status(500).json({ message: `Chat controller error ${error}` });
  }
};

export const agentChatController = async (req, res) => {
  try {
    const { message, agent } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }
    const existingAgent = await agentModel.findOne({ name: agent });

    if (!existingAgent) {
      return res.status(400).json({
        message: "Agent not found",
      });
    }

    const threadId = `${req.user._id.toString()}:${existingAgent._id}`;

    const graph = await createAgentGraph(existingAgent, req.user._id);

    const result = await graph.invoke(
      {
        messages: [new HumanMessage(message)],
      },
      { configurable: { thread_id: threadId }, recursionLimit: 25 },
    );

    const lastMessage = result.messages[result.messages.length - 1].content;

    return res.status(200).json(lastMessage);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Agent Chat controller error ${error}` });
  }
};
