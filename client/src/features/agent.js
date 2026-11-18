import { api } from "../../api.js";

export const createAgent = async ({
  name,
  knowledgeBase,
  instructions,
  tools,
}) => {
  try {
    const { data } = await api.post("/api/agents/create", {
      name,
      knowledgeBase,
      instructions,
      tools,
    });
    return data;
  } catch (error) {
    console.error(
      "Error in create agent API:",
      error.response?.data || error.message,
    );
    return error;
  }
};

export const getAllAgents = async () => {
  try {
    const { data } = await api.get("/api/agents/all");
    return data;
  } catch (error) {
    console.error(
      "Error in get all agents API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const getAgentById = async (id) => {
  try {
    const { data } = await api.get(`/api/agents/${id}`);
    return data;
  } catch (error) {
    console.error(
      "Error in get agent by ID API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const deleteAgent = async (id) => {
  try {
    const { data } = await api.delete(`/api/agents/${id}`);
    return data;
  } catch (error) {
    console.error(
      "Error in delete agent API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
