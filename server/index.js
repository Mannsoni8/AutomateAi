import express from "express";
import { config } from "./src/config/env.js";
import { connectDB } from "./src/config/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./src/routers/auth.route.js";
import agentRouter from "./src/routers/agent.routes.js";
import chatRouter from "./src/routers/chat.route.js";
import integrationRouter from "./src/routers/integration.route.js";
import paymentRouter from "./src/routers/payment.route.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: config.FRONTED_URL,
    credentials: true,
  }),
);

app.use("/api/auth", authRouter);
app.use("/api/agents", agentRouter);
app.use("/api/chat", chatRouter);
app.use("/api/integrations", integrationRouter);
app.use("/api/payment", paymentRouter);

// Handle 404 for missing routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ message: "Internal server error" });
});

const port = config.PORT || 8000;

await connectDB();

app.listen(port, () => {
  console.log("Server is running");
});
