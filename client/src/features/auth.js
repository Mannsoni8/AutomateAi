import { api } from "../../api.js";

export const login = async (token) => {
  try {
    const { data } = await api.post("/api/auth/login", { token });
    return data;
  } catch (error) {
    console.error("Error in login API:", error.response?.data || error.message);
    throw error;
  }
};

export const logout = async () => {
  try {
    const { data } = await api.post("/api/auth/logout");
    return data;
  } catch (error) {
    console.error("Error in logout API:", error.response?.data || error.message);
    throw error;
  }
};

export const me = async () => {
  try {
    const { data } = await api.get("/api/auth/me");
    return data;
  } catch (error) {
    console.error("Me API Error:", error.response?.data || error.message);
    throw error;
  }
};
