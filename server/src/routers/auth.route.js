import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  signinController,
  signupController,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/protect.middleware.js";

const authRouter = Router();

authRouter.post("/signup", signupController);
authRouter.post("/signin", signinController);
authRouter.post("/login", loginController);
authRouter.post("/logout", logoutController);
authRouter.get("/logout", logoutController);
authRouter.get("/me", protect, meController);

export default authRouter;