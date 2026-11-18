import { Router } from "express";
import { protect } from "../middleware/protect.middleware.js";
import {
  connectGoogleController,
  connectInstagramController,
  disconnectIntegrationController,
  getIntegrationsController,
  googleCallbackController,
  instagramCallbackController,
} from "../controller/integration.controller.js";

const integrationRouter = Router();

integrationRouter.get("/google/connect", protect, connectGoogleController);
integrationRouter.get("/google/callback", googleCallbackController);

integrationRouter.get(
  "/instagram/connect",
  protect,
  connectInstagramController,
);
integrationRouter.get("/instagram/callback", instagramCallbackController);

integrationRouter.get(
  "/instagram/disconnect",
  protect,
  disconnectIntegrationController,
);
integrationRouter.get(
  "/google/disconnect",
  protect,
  disconnectIntegrationController,
);

integrationRouter.get("/all", protect, getIntegrationsController);

export default integrationRouter;
