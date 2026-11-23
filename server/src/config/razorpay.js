import Razorpay from "razorpay";
import { config } from "./env.js";

export const razorpayInstance =
  config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: config.RAZORPAY_KEY_ID,
        key_secret: config.RAZORPAY_KEY_SECRET,
      })
    : null;

export default razorpayInstance;
