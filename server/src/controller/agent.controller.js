import agentModel from "../model/agent.model.js";

const ALLOWED_AGENT_TOOLS = new Set([
  "web_search",
  "send_email",
  "list_emails",
  "create_calendar_event",
  "list_calendar_events",
  "publish_instagram_post",
  "analyze_image",
]);

export const createAgentController = async (req, res) => {
  try {
    const { name, knowledgeBase, instructions, tools } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof knowledgeBase !== "string" ||
      typeof instructions !== "string" ||
      !name.trim() ||
      !knowledgeBase.trim() ||
      !instructions.trim() ||
      !Array.isArray(tools)
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const trimmedName = name.trim();
    const safeTools = tools.filter(
      (t) => typeof t === "string" && ALLOWED_AGENT_TOOLS.has(t.trim()),
    );

    const existingAgentName = await agentModel.findOne({ name: trimmedName });
    if (existingAgentName) {
      return res
        .status(400)
        .json({ message: "Agent's name should be unique " });
    }

    const userId = req.user?._id;
    const agent = await agentModel.create({
      name: trimmedName,
      knowledgeBase: knowledgeBase.trim().slice(0, 10000),
      instructions: instructions.trim().slice(0, 4000),
      tools: safeTools,
      userId,
    });
    return res.status(201).json(agent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAgentsController = async (req, res) => {
  try {
    const userId = req.user?._id;

    const agents = await agentModel
      .find({ userId })
      .populate("userId", "name email profilePicture");

    return res.status(200).json(agents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAgentByIdController = async (req, res) => {
  try {
    const agentId = req.params.id;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const agent = await agentModel
      .findOne({ _id: agentId, userId })
      .populate("userId", "name email profilePicture");

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    return res.status(200).json(agent);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid agent ID" });
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteAgentController = async (req, res) => {
  try {
    const agentId = req.params.id;
    const userId = req.user?._id;

    const agent = await agentModel.findOneAndDelete({
      _id: agentId,
      userId,
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    return res.status(200).json(agent);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid agent ID" });
    }
    res.status(500).json({ message: error.message });
  }
};
