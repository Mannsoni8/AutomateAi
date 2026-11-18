import agentModel from "../model/agent.model.js";

export const createAgentController = async (req, res) => {
  try {
    const { name, knowledgeBase, instructions, tools } = req.body;

    if (!name || !knowledgeBase || !instructions || !tools) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existingAgentName = await agentModel.findOne({ name });
    if (existingAgentName) {
      return res
        .status(400)
        .json({ message: "Agent's name should be unique " });
    }

    const userId = req.user?._id; // Assuming you have user authentication middleware that sets req.user
    const agent = await agentModel.create({
      name,
      knowledgeBase,
      instructions,
      tools,
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

    const agent = await agentModel
      .findById(agentId)
      .populate("userId", "name email profilePicture");

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    return res.status(200).json(agent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAgentController = async (req, res) => {
  try {
    const agentId = req.params.id;

    const agent = await agentModel.findByIdAndDelete(agentId);

    return res.status(200).json(agent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
