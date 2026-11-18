import { api } from "../../api.js";

export const connectGoogle = async () => {
  try {
    const { data } = await api.get("/api/integrations/google/connect");
    return data;
  } catch (error) {
    console.error(
      "Error in integrations API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const connectInstagram = async () => {
  try {
    const { data } = await api.get("/api/integrations/instagram/connect");
    return data;
  } catch (error) {
    console.error(
      "Error in integrations API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const disconnectGoogle = async () => {
  try {
    const { data } = await api.get("/api/integrations/google/disconnect");
    return data;
  } catch (error) {
    console.error(
      "Error in integrations API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const disconnectInstagram = async () => {
  try {
    const { data } = await api.get("/api/integrations/instagram/disconnect");
    return data;
  } catch (error) {
    console.error(
      "Error in integrations API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const getAllIntegrations = async () => {
  try {
    const { data } = await api.get("/api/integrations/all");
    return data;
  } catch (error) {
    console.error(
      "Error in integrations API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};