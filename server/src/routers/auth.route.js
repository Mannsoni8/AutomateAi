import { Router } from "express";
import {
  loginController,
  logoutController,
  meController,
  signinController,
  signupController,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/protect.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const authRouter = Router();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts. Please try again later.",
});

authRouter.post("/signup", authLimiter, signupController);
authRouter.post("/signin", authLimiter, signinController);
authRouter.post("/login", authLimiter, loginController);
authRouter.post("/logout", logoutController);
authRouter.get("/logout", logoutController);
authRouter.get("/me", protect, meController);

export default authRouter;