import { config } from "../config/env.js";
import razorpayInstance from "../config/razorpay.js";
import paymentModel from "../model/payment.model.js";
import crypto from "crypto";
import userModel from "../model/user.model.js";

export const Plans = {
  pro: {
    name: "Pro",
    amount: 29900,
    credits: 500,
  },
  team: {
    name: "Team",
    amount: 79900,
    credits: 2000,
  },
};

export const createOrderController = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized: User ID is required",
      });
    }

    const plan = typeof req.body?.plan === "object" ? req.body.plan.id : req.body?.plan;
    const selectedPlan = Plans[plan];

    if (!selectedPlan) {
      return res.status(400).json({
        message: "Plan not found",
      });
    }

    if (!razorpayInstance) {
      return res.status(503).json({
        message:
          "Razorpay is not configured on the server. Please ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.",
      });
    }

    const order = await razorpayInstance.orders.create({
      amount: selectedPlan.amount,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`.slice(0, 40),
      notes: { userId: String(userId), plan },
    });

    await paymentModel.create({
      userId,
      plan,
      credits: selectedPlan.credits,
      amount: selectedPlan.amount,
      razorpayOrderId: order.id,
      currency: "INR",
      status: "created",
    });

    return res.status(200).json({
      message: "Order created successfully",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      plan: {
        name: selectedPlan.name,
        credits: selectedPlan.credits,
      },
      key_id: config.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create payment order error:", error);
    return res.status(500).json({
      message: `Create payment error: ${error.message || error}`,
    });
  }
};

export const verifyPaymentController = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized: User ID is required",
      });
    }

    const payload = req.body?.body || req.body || {};
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "Payment verification details are required",
      });
    }

    const payment = await paymentModel.findOne({
      userId,
      razorpayOrderId: razorpay_order_id,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment record not found.",
      });
    }

    if (payment.status === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment already verified.",
        credits: req.user?.credits,
      });
    }

    const keySecret = config.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({
        message: "Server Razorpay secret is not configured.",
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const receivedBuffer = Buffer.from(razorpay_signature, "utf8");
    const expectedBuffer = Buffer.from(generatedSignature, "utf8");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(400).json({
        message: "Invalid payment signature",
      });
    }

    payment.status = "paid";
    payment.razorpayPaymentId = razorpay_payment_id;
    await payment.save();

    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      {
        $inc: {
          credits: payment.credits,
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully.",
      credits: updatedUser.credits,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({
      message: `Unable to verify payment: ${error.message || error}`,
    });
  }
};
