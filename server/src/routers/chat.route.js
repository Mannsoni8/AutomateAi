import { Router } from "express";
import { protect } from "../middleware/protect.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";
import {
  agentChatController,
  chatController,
  resumeChatController,
} from "../controller/chat.controller.js";

const chatRouter = Router();

const chatLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many chat requests. Please slow down.",
});

chatRouter.post("/", protect, chatLimiter, chatController);
chatRouter.post("/agent", protect, chatLimiter, agentChatController);
chatRouter.post("/resume", protect, chatLimiter, resumeChatController);

export default chatRouter;
