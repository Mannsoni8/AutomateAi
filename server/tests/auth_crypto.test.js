import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env.js";
import { encrypt, decrypt } from "../src/config/encrypt-decrypt.js";

describe("Crypto & Encryption Tests", () => {
  before(() => {
    // Ensure test environment has a valid 64-hex-char encryption key
    if (!config.ENCRYPTION_KEY || !/^[a-fA-F0-9]{64}$/.test(config.ENCRYPTION_KEY)) {
      config.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    }
  });

  it("successfully encrypts and decrypts a plain text string", async () => {
    const plainText = "OAuth_Access_Token_Secret_123456!@#$%^&*()";
    const encrypted = await encrypt(plainText);

    assert.ok(typeof encrypted === "string", "Encrypted result must be a string");
    assert.equal(encrypted.split(":").length, 3, "Encrypted format must be iv:tag:data");

    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, plainText, "Decrypted text must match original plain text");
  });

  it("handles complex JSON payloads and unicode characters", async () => {
    const originalData = JSON.stringify({
      user: "Alex Rivera",
      token: "ya29.a0AfH6SMB...",
      emoji: "🚀🤖🔒",
      refresh: "1//04...",
    });

    const encrypted = await encrypt(originalData);
    const decrypted = await decrypt(encrypted);

    assert.equal(decrypted, originalData);
    assert.deepEqual(JSON.parse(decrypted), JSON.parse(originalData));
  });

  it("produces distinct ciphertexts for identical inputs due to random IVs", async () => {
    const secret = "identical_input_secret";
    const enc1 = await encrypt(secret);
    const enc2 = await encrypt(secret);

    assert.notEqual(enc1, enc2, "Ciphertexts must differ due to unique IV generation");

    const dec1 = await decrypt(enc1);
    const dec2 = await decrypt(enc2);
    assert.equal(dec1, secret);
    assert.equal(dec2, secret);
  });

  it("throws an error when decrypting tampered data", async () => {
    const secret = "sensitive_access_token";
    const encrypted = await encrypt(secret);
    const [iv, tag, data] = encrypted.split(":");

    // Tamper with data payload
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === "00" ? "ff" : "00");
    const tamperedCiphertext = `${iv}:${tag}:${tamperedData}`;

    await assert.rejects(
      async () => {
        await decrypt(tamperedCiphertext);
      },
      /Unsupported state or unable to authenticate data|bad decrypt/i,
      "Tampered data must fail authentication in GCM mode",
    );
  });

  it("throws an error when decrypting an invalid format", async () => {
    await assert.rejects(async () => {
      await decrypt("invalid_format_without_colons");
    }, /Invalid encrypted value/);

    await assert.rejects(async () => {
      await decrypt("part1:part2");
    }, /Invalid encrypted value/);
  });
});

describe("JWT Auth Token Tests", () => {
  const secretKey = "test_jwt_super_secret_key_12345";
  const userId = "64f1a2b3c4d5e6f7a8b9c0d1";

  it("signs and verifies a user token correctly", () => {
    const token = jwt.sign({ userId }, secretKey, { expiresIn: "1h" });

    assert.ok(typeof token === "string");
    const decoded = jwt.verify(token, secretKey);

    assert.equal(decoded.userId, userId);
  });

  it("rejects verification with an incorrect secret", () => {
    const token = jwt.sign({ userId }, secretKey, { expiresIn: "1h" });

    assert.throws(() => {
      jwt.verify(token, "wrong_secret_key");
    }, /invalid signature/i);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ userId }, secretKey, { expiresIn: "-1s" });

    assert.throws(() => {
      jwt.verify(token, secretKey);
    }, /jwt expired/i);
  });
});
