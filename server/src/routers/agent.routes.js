import { Router } from "express";
import {
  createAgentController,
  getAgentsController,
  getAgentByIdController,
  deleteAgentController,
} from "../controller/agent.controller.js";
import { protect } from "../middleware/protect.middleware.js";

const agentRouter = Router();

agentRouter.post("/create", protect, createAgentController);
agentRouter.get("/all", protect, getAgentsController);
agentRouter.get("/:id", protect, getAgentByIdController);
agentRouter.delete("/:id", protect, deleteAgentController);

export default agentRouter;
