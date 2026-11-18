import { api } from "../../api.js";

export const chat = async (message) => {
  try {
    const { data } = await api.post("/api/chat", { message });
    return data;
  } catch (error) {
    console.error("Error in chat API:", error.response?.data || error.message);
    throw error;
  }
};

export const agentChat = async (message, agent) => {
  try {
    const { data } = await api.post("/api/chat/agent", { message, agent });
    return data;
  } catch (error) {
    console.error("Error in chat API:", error.response?.data || error.message);
    throw error;
  }
};
