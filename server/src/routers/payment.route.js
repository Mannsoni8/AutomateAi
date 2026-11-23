import { Router } from "express";
import { protect } from "../middleware/protect.middleware.js";
import {
  createOrderController,
  verifyPaymentController,
} from "../controller/payment.controller.js";

const paymentRouter = Router();

paymentRouter.post("/create", protect, createOrderController);
paymentRouter.post("/verify", protect, verifyPaymentController);

export default paymentRouter;
