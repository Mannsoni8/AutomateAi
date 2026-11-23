import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deductCredits } from "../src/utils/deductCredits.js";
import userModel from "../src/model/user.model.js";

describe("Credit Deduction Utility Tests", () => {
  it("rejects when userId is missing or undefined", async () => {
    await assert.rejects(
      async () => {
        await deductCredits({ userId: null, credits: 5 });
      },
      /User ID is required/,
    );

    await assert.rejects(
      async () => {
        await deductCredits({ credits: 5 });
      },
      /User ID is required/,
    );
  });

  it("rejects non-positive or non-integer credits values", async () => {
    const invalidCredits = [0, -5, 2.5, "10", null, undefined, NaN];

    for (const credits of invalidCredits) {
      await assert.rejects(
        async () => {
          await deductCredits({ userId: "user_123", credits });
        },
        /Credits must be a positive integer/,
        `Should reject credit value: ${credits}`,
      );
    }
  });

  it("successfully deducts credits when user has sufficient balance", async () => {
    const originalFindOneAndUpdate = userModel.findOneAndUpdate;
    try {
      userModel.findOneAndUpdate = async (query, update) => {
        assert.equal(query._id, "user_valid_123");
        assert.deepEqual(query.credits, { $gte: 10 });
        assert.deepEqual(update, { $inc: { credits: -10 } });
        return {
          _id: query._id,
          credits: 90,
        };
      };

      const result = await deductCredits({
        userId: "user_valid_123",
        credits: 10,
      });

      assert.deepEqual(result, {
        success: true,
        creditsDeducted: 10,
        remainingCredits: 90,
      });
    } finally {
      userModel.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it("throws 'Insufficient Credits' when atomic update condition fails but user exists", async () => {
    const originalFindOneAndUpdate = userModel.findOneAndUpdate;
    const originalExists = userModel.exists;
    try {
      // Condition credits: { $gte: credits } fails, findOneAndUpdate returns null
      userModel.findOneAndUpdate = async () => null;
      userModel.exists = async () => ({ _id: "user_low_balance" });

      await assert.rejects(
        async () => {
          await deductCredits({
            userId: "user_low_balance",
            credits: 20,
          });
        },
        /Insufficient Credits/,
      );
    } finally {
      userModel.findOneAndUpdate = originalFindOneAndUpdate;
      userModel.exists = originalExists;
    }
  });

  it("throws 'User not found' when user does not exist in database", async () => {
    const originalFindOneAndUpdate = userModel.findOneAndUpdate;
    const originalExists = userModel.exists;
    try {
      userModel.findOneAndUpdate = async () => null;
      userModel.exists = async () => null;

      await assert.rejects(
        async () => {
          await deductCredits({
            userId: "non_existent_user",
            credits: 10,
          });
        },
        /User not found/,
      );
    } finally {
      userModel.findOneAndUpdate = originalFindOneAndUpdate;
      userModel.exists = originalExists;
    }
  });
});
