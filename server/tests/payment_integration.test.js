import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  createOrderController,
  verifyPaymentController,
  Plans,
} from "../src/controller/payment.controller.js";
import paymentModel from "../src/model/payment.model.js";
import userModel from "../src/model/user.model.js";
import { config } from "../src/config/env.js";
import razorpayInstance from "../src/config/razorpay.js";

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

describe("End-to-End Payment & Credit Top-Up Integration Tests", () => {
  const testUserId = "usr_integration_payment_999";
  const mockSecret = "rzp_secret_integration_test_abc123";

  it("simulates full payment lifecycle: order creation -> checkout -> signature verification -> credit update", async () => {
    const paymentStore = new Map();
    let userBalance = 100; // Starter free credits

    const originalCreate = paymentModel.create;
    const originalFindOne = paymentModel.findOne;
    const originalFindOneAndUpdate = paymentModel.findOneAndUpdate;
    const originalFindByIdAndUpdate = userModel.findByIdAndUpdate;
    const originalSecret = config.RAZORPAY_KEY_SECRET;
    const originalKeyId = config.RAZORPAY_KEY_ID;

    try {
      config.RAZORPAY_KEY_SECRET = mockSecret;
      config.RAZORPAY_KEY_ID = "rzp_test_mock_id";

      // Mock Razorpay instance if not initialized
      const mockOrderId = "order_rzp_mock_" + Date.now();
      const originalOrdersCreate = razorpayInstance?.orders?.create;

      if (razorpayInstance?.orders) {
        razorpayInstance.orders.create = async ({ amount, currency, notes }) => ({
          id: mockOrderId,
          amount,
          currency,
          notes,
        });
      }

      paymentModel.create = async (doc) => {
        paymentStore.set(doc.razorpayOrderId, {
          ...doc,
          status: "created",
          razorpayPaymentId: null,
          async save() {
            paymentStore.set(doc.razorpayOrderId, this);
          },
        });
        return paymentStore.get(doc.razorpayOrderId);
      };

      paymentModel.findOne = async (query) => {
        return paymentStore.get(query.razorpayOrderId) || null;
      };

      paymentModel.findOneAndUpdate = async (filter, update) => {
        const record = paymentStore.get(filter.razorpayOrderId);
        if (!record || record.status !== filter.status) return null;
        record.status = update.$set.status;
        record.razorpayPaymentId = update.$set.razorpayPaymentId;
        return record;
      };

      userModel.findByIdAndUpdate = async (id, update) => {
        if (update?.$inc?.credits) {
          userBalance += update.$inc.credits;
        }
        return { _id: id, credits: userBalance };
      };

      // 1. User selects "pro" plan (500 credits, ₹299)
      const orderReq = {
        user: { _id: testUserId },
        body: { plan: "pro" },
      };
      const orderRes = createMockRes();

      await createOrderController(orderReq, orderRes);

      assert.equal(orderRes.statusCode, 200);
      assert.ok(orderRes.body.order?.id);
      assert.equal(orderRes.body.plan.credits, 500);
      assert.equal(orderRes.body.plan.name, "Pro");

      const generatedOrderId = orderRes.body.order.id;

      // Verify payment was recorded in database with status "created"
      const recordedPayment = paymentStore.get(generatedOrderId);
      assert.ok(recordedPayment);
      assert.equal(recordedPayment.status, "created");
      assert.equal(recordedPayment.credits, 500);

      // 2. User completes payment on client (Razorpay modal returns signature)
      const paymentId = "pay_rzp_mock_success_555";
      const validSignature = crypto
        .createHmac("sha256", mockSecret)
        .update(`${generatedOrderId}|${paymentId}`)
        .digest("hex");

      const verifyReq = {
        user: { _id: testUserId },
        body: {
          razorpay_order_id: generatedOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: validSignature,
        },
      };
      const verifyRes = createMockRes();

      await verifyPaymentController(verifyReq, verifyRes);

      assert.equal(verifyRes.statusCode, 200);
      assert.equal(verifyRes.body.success, true);
      assert.equal(verifyRes.body.credits, 600, "100 initial + 500 top-up = 600 credits");

      // Verify payment status updated to "paid"
      const verifiedPayment = paymentStore.get(generatedOrderId);
      assert.equal(verifiedPayment.status, "paid");
      assert.equal(verifiedPayment.razorpayPaymentId, paymentId);

      // 3. Idempotent check: Re-submitting the same verification must succeed safely without double credit
      const repeatVerifyRes = createMockRes();
      await verifyPaymentController(verifyReq, repeatVerifyRes);

      assert.equal(repeatVerifyRes.statusCode, 200);
      assert.equal(repeatVerifyRes.body.message, "Payment already verified.");
      assert.equal(userBalance, 600, "Double-spend prevented, balance remains 600");

      if (razorpayInstance?.orders && originalOrdersCreate) {
        razorpayInstance.orders.create = originalOrdersCreate;
      }
    } finally {
      paymentModel.create = originalCreate;
      paymentModel.findOne = originalFindOne;
      paymentModel.findOneAndUpdate = originalFindOneAndUpdate;
      userModel.findByIdAndUpdate = originalFindByIdAndUpdate;
      config.RAZORPAY_KEY_SECRET = originalSecret;
      config.RAZORPAY_KEY_ID = originalKeyId;
    }
  });
});
