import { Router } from "express";
import { protect } from "../middleware/protect.middleware.js";
import {
  agentChatController,
  chatController,
} from "../controller/chat.controller.js";

const chatRouter = Router();

chatRouter.post("/", protect, chatController);
chatRouter.post("/agent", protect, agentChatController);

export default chatRouter;
