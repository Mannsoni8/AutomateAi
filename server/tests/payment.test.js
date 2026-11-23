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

describe("Razorpay Payment Controller Tests", () => {
  describe("createOrderController", () => {
    it("returns 401 when req.user is missing", async () => {
      const req = { user: null, body: { plan: "pro" } };
      const res = createMockRes();

      await createOrderController(req, res);
      assert.equal(res.statusCode, 401);
      assert.match(res.body.message, /Unauthorized/);
    });

    it("returns 400 when plan is missing or invalid", async () => {
      const req = { user: { _id: "usr_1" }, body: { plan: "enterprise_unknown" } };
      const res = createMockRes();

      await createOrderController(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, "Plan not found");
    });

    it("verifies available plans configuration", () => {
      assert.ok(Plans.pro, "Pro plan must exist");
      assert.equal(Plans.pro.amount, 29900);
      assert.equal(Plans.pro.credits, 500);

      assert.ok(Plans.team, "Team plan must exist");
      assert.equal(Plans.team.amount, 79900);
      assert.equal(Plans.team.credits, 2000);
    });
  });

  describe("verifyPaymentController", () => {
    const testSecret = "test_razorpay_secret_key_12345";

    it("returns 400 when verification parameters are missing", async () => {
      const req = {
        user: { _id: "usr_1" },
        body: { razorpay_order_id: "order_123" }, // missing payment_id and signature
      };
      const res = createMockRes();

      await verifyPaymentController(req, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /Payment verification details are required/);
    });

    it("returns 404 when payment record does not exist", async () => {
      const originalFindOne = paymentModel.findOne;
      try {
        paymentModel.findOne = async () => null;

        const req = {
          user: { _id: "usr_1" },
          body: {
            razorpay_order_id: "order_missing",
            razorpay_payment_id: "pay_123",
            razorpay_signature: "sig_abc",
          },
        };
        const res = createMockRes();

        await verifyPaymentController(req, res);
        assert.equal(res.statusCode, 404);
        assert.equal(res.body.message, "Payment record not found.");
      } finally {
        paymentModel.findOne = originalFindOne;
      }
    });

    it("returns 200 when payment was already marked as paid", async () => {
      const originalFindOne = paymentModel.findOne;
      try {
        paymentModel.findOne = async () => ({
          status: "paid",
          credits: 500,
        });

        const req = {
          user: { _id: "usr_1", credits: 600 },
          body: {
            razorpay_order_id: "order_paid",
            razorpay_payment_id: "pay_123",
            razorpay_signature: "sig_abc",
          },
        };
        const res = createMockRes();

        await verifyPaymentController(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.message, "Payment already verified.");
      } finally {
        paymentModel.findOne = originalFindOne;
      }
    });

    it("rejects an invalid payment signature with 400", async () => {
      const originalFindOne = paymentModel.findOne;
      const originalSecret = config.RAZORPAY_KEY_SECRET;
      try {
        config.RAZORPAY_KEY_SECRET = testSecret;
        paymentModel.findOne = async () => ({
          status: "created",
          credits: 500,
        });

        const req = {
          user: { _id: "usr_1" },
          body: {
            razorpay_order_id: "order_12345",
            razorpay_payment_id: "pay_67890",
            razorpay_signature: "invalid_tampered_signature_hex",
          },
        };
        const res = createMockRes();

        await verifyPaymentController(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.message, "Invalid payment signature");
      } finally {
        paymentModel.findOne = originalFindOne;
        config.RAZORPAY_KEY_SECRET = originalSecret;
      }
    });

    it("successfully validates authentic signature, marks paid, and increments credits", async () => {
      const originalFindOne = paymentModel.findOne;
      const originalFindByIdAndUpdate = userModel.findByIdAndUpdate;
      const originalSecret = config.RAZORPAY_KEY_SECRET;

      try {
        config.RAZORPAY_KEY_SECRET = testSecret;

        const orderId = "order_valid_999";
        const paymentId = "pay_valid_888";
        const validSignature = crypto
          .createHmac("sha256", testSecret)
          .update(`${orderId}|${paymentId}`)
          .digest("hex");

        let savedPayment = false;
        const mockPayment = {
          status: "created",
          credits: 500,
          razorpayPaymentId: null,
          async save() {
            savedPayment = true;
          },
        };

        paymentModel.findOne = async (query) => {
          assert.equal(query.razorpayOrderId, orderId);
          return mockPayment;
        };

        let creditIncremented = false;
        userModel.findByIdAndUpdate = async (id, update) => {
          assert.equal(id, "usr_1");
          assert.deepEqual(update, { $inc: { credits: 500 } });
          creditIncremented = true;
          return { _id: id, credits: 600 };
        };

        const req = {
          user: { _id: "usr_1" },
          body: {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: validSignature,
          },
        };
        const res = createMockRes();

        await verifyPaymentController(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.message, "Payment verified successfully.");
        assert.equal(res.body.credits, 600);

        assert.equal(mockPayment.status, "paid");
        assert.equal(mockPayment.razorpayPaymentId, paymentId);
        assert.equal(savedPayment, true, "Payment record must be saved with paid status");
        assert.equal(creditIncremented, true, "User credits must be incremented in DB");
      } finally {
        paymentModel.findOne = originalFindOne;
        userModel.findByIdAndUpdate = originalFindByIdAndUpdate;
        config.RAZORPAY_KEY_SECRET = originalSecret;
      }
    });
  });
});
