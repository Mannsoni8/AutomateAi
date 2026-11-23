import { api } from "../../api.js";

export const createPayment = async (plan) => {
  try {
    const planId = typeof plan === "object" ? plan.id : plan;
    const { data } = await api.post("/api/payment/create", { plan: planId });
    return data;
  } catch (error) {
    console.error(
      "Error in payment API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

export const verifyPayment = async (paymentData) => {
  try {
    const { data } = await api.post("/api/payment/verify", paymentData);
    return data;
  } catch (error) {
    console.error(
      "Error in payment verify API:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
