import mongoose from "mongoose";
import { config } from "./env.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log("Data base is connected");
  } catch (error) {
    console.log("Error in connecting database");
  }
};
