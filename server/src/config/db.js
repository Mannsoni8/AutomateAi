import mongoose from "mongoose";
import dns from "node:dns";
import { config } from "./env.js";

// Use public DNS resolvers to prevent ECONNREFUSED on MongoDB SRV record lookups
try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch (dnsErr) {
  console.warn("Could not set custom DNS servers:", dnsErr.message);
}

export const connectDB = async (retries = 5, delayMs = 3000) => {
  if (!config.MONGO_URI) {
    console.error("❌ FATAL: MONGO_URI is missing in environment variables!");
    return;
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(config.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      console.log("Data base is connected");
      return;
    } catch (error) {
      console.error(
        `❌ MongoDB connection attempt ${attempt}/${retries} failed:`,
        error.message,
      );
      if (attempt < retries) {
        console.log(`Retrying MongoDB connection in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error("❌ All MongoDB connection attempts failed.");
      }
    }
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime connection error:", err.message);
});
