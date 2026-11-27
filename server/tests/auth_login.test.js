import { describe, it } from "node:test";
import assert from "node:assert/strict";
import userModel from "../src/model/user.model.js";
import {
  loginController,
  signinController,
  signupController,
} from "../src/controller/auth.controller.js";
import { getAuth } from "firebase-admin/auth";

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    cookie(name, val, options) {
      this.cookies[name] = { val, options };
      return this;
    },
  };
  return res;
};

describe("Authentication & Account Linking Tests", () => {
  it("links user account when email already exists but firebaseUid is updated (prevents E11000 dup key)", async () => {
    const memoryStore = new Map();

    // Pre-populate with an existing user who has an old UID and 250 credits
    const existingUser = {
      _id: "usr_existing_1",
      firebaseUid: "old_firebase_uid_123",
      email: "mannsoni4352@gmail.com",
      name: "Mann Soni",
      profilePicture: "https://example.com/old.png",
      credits: 250,
      save: async function () {
        memoryStore.set(this._id, this);
        return this;
      },
    };
    memoryStore.set(existingUser._id, existingUser);

    const originalFindOne = userModel.findOne;
    const originalCreate = userModel.create;

    try {
      userModel.findOne = async (query) => {
        const users = Array.from(memoryStore.values());
        if (query.$or) {
          for (const condition of query.$or) {
            const match = users.find((u) => {
              if (condition.firebaseUid && u.firebaseUid === condition.firebaseUid) return true;
              if (condition.email && u.email === condition.email) return true;
              return false;
            });
            if (match) return match;
          }
        }
        return null;
      };

      userModel.create = async (doc) => {
        const id = "usr_" + Date.now();
        const created = {
          _id: id,
          ...doc,
          credits: 100,
          save: async function () {
            memoryStore.set(this._id, this);
            return this;
          },
        };
        memoryStore.set(id, created);
        return created;
      };

      // Mock Firebase Admin getAuth verification
      const originalAuth = getAuth();
      const originalVerify = originalAuth.verifyIdToken;
      originalAuth.verifyIdToken = async (token) => {
        if (token === "valid_new_google_token") {
          return {
            uid: "new_firebase_uid_456", // New Firebase UID
            email: "mannsoni4352@gmail.com", // Same email!
            name: "Mann Soni Updated",
            picture: "https://example.com/new.png",
          };
        }
        throw new Error("Invalid token");
      };

      try {
        const req = { body: { token: "valid_new_google_token" } };
        const res = createMockRes();

        await loginController(req, res);

        assert.equal(res.statusCode, 200, "Must return 200 on login");
        assert.equal(res.body.user.email, "mannsoni4352@gmail.com");
        assert.equal(res.body.user.firebaseUid, "new_firebase_uid_456", "Must update to new firebaseUid");
        assert.equal(res.body.user.credits, 250, "Must preserve existing credits and profile data");
        assert.ok(res.body.token, "Must return JWT token in body");
        assert.ok(res.cookies.token, "Must set token cookie");
      } finally {
        originalAuth.verifyIdToken = originalVerify;
      }
    } finally {
      userModel.findOne = originalFindOne;
      userModel.create = originalCreate;
    }
  });

  it("creates a brand new user when neither email nor UID exists", async () => {
    const memoryStore = new Map();

    const originalFindOne = userModel.findOne;
    const originalCreate = userModel.create;

    try {
      userModel.findOne = async () => null;
      userModel.create = async (doc) => {
        const id = "usr_new_999";
        return {
          _id: id,
          ...doc,
          credits: 100,
          save: async function () {
            memoryStore.set(this._id, this);
            return this;
          },
        };
      };

      const originalAuth = getAuth();
      const originalVerify = originalAuth.verifyIdToken;
      originalAuth.verifyIdToken = async () => ({
        uid: "brand_new_uid_789",
        email: "brandnew@example.com",
        name: "New Explorer",
        picture: "https://example.com/pic.jpg",
      });

      try {
        const req = { body: { token: "token_for_new_user" } };
        const res = createMockRes();

        await loginController(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.user.email, "brandnew@example.com");
        assert.equal(res.body.user.credits, 100);
        assert.ok(res.body.token);
      } finally {
        originalAuth.verifyIdToken = originalVerify;
      }
    } finally {
      userModel.findOne = originalFindOne;
      userModel.create = originalCreate;
    }
  });

  it("rejects login when Firebase token is missing", async () => {
    const req = { body: {} };
    const res = createMockRes();

    await loginController(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Firebase token is required");
  });

  it("registers and signs in a local email/password user via signupController & signinController", async () => {
    const memoryStore = new Map();
    const originalFindOne = userModel.findOne;
    const originalCreate = userModel.create;

    try {
      userModel.findOne = (query) => {
        const match = Array.from(memoryStore.values()).find(
          (u) => u.email === query.email,
        );
        const result = match || null;
        return {
          select: async () => result,
          then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        };
      };

      userModel.create = async (doc) => {
        const created = {
          _id: "usr_local_1",
          credits: 100,
          ...doc,
        };
        memoryStore.set(created.email, created);
        return created;
      };

      // 1. Sign up
      const signupReq = {
        body: {
          name: "Test User",
          email: "testuser@example.com",
          password: "password123",
        },
      };
      const signupRes = createMockRes();
      await signupController(signupReq, signupRes);

      assert.equal(signupRes.statusCode, 201);
      assert.equal(signupRes.body.user.email, "testuser@example.com");
      assert.equal(signupRes.body.user.passwordHash, undefined, "passwordHash must not be leaked");
      assert.ok(signupRes.body.token);

      // 2. Duplicate signup returns 409
      const dupRes = createMockRes();
      await signupController(signupReq, dupRes);
      assert.equal(dupRes.statusCode, 409);

      // 3. Sign in with valid password
      const signinReq = {
        body: {
          email: "testuser@example.com",
          password: "password123",
        },
      };
      const signinRes = createMockRes();
      await signinController(signinReq, signinRes);

      assert.equal(signinRes.statusCode, 200);
      assert.equal(signinRes.body.user.email, "testuser@example.com");
      assert.equal(signinRes.body.user.passwordHash, undefined);
      assert.ok(signinRes.body.token);

      // 4. Sign in with wrong password
      const badReq = {
        body: {
          email: "testuser@example.com",
          password: "wrongpassword",
        },
      };
      const badRes = createMockRes();
      await signinController(badReq, badRes);
      assert.equal(badRes.statusCode, 401);
    } finally {
      userModel.findOne = originalFindOne;
      userModel.create = originalCreate;
    }
  });
});
