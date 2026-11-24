import axios from "axios";

const rawBaseURL = import.meta.env.VITE_SERVER_URL || "";
const baseURL = rawBaseURL.replace(/\/+$/, "");

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
