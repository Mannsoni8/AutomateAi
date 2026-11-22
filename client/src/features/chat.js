import { api } from "../../api.js";

export const chat = async (message) => {
  try {
    const payload =
      typeof message === "string" ? { message } : message;
    const { data } = await api.post("/api/chat", payload);
    return data;
  } catch (error) {
    console.error("Error in chat API:", error.response?.data || error.message);
    throw error;
  }
};

export const agentChat = async (message, agent) => {
  try {
    const payload =
      typeof message === "string"
        ? { message, agent }
        : { ...message, agent };
    const { data } = await api.post("/api/chat/agent", payload);
    return data;
  } catch (error) {
    console.error("Error in chat API:", error.response?.data || error.message);
    throw error;
  }
};
