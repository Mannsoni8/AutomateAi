import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Chat Payload Normalization & Intent Routing Tests", () => {
  // Normalization logic used in chat.controller.js
  const normalizePayload = (reqBody) => {
    let userPrompt = "";
    let attachedImageUrl = null;

    if (typeof reqBody?.message === "object" && reqBody?.message !== null) {
      userPrompt = reqBody.message.message || "";
      attachedImageUrl = reqBody.message.image_url || null;
    } else {
      userPrompt = reqBody?.message || "";
      attachedImageUrl = reqBody?.image_url || null;
    }

    let finalPrompt = userPrompt;
    if (attachedImageUrl && !userPrompt.includes(attachedImageUrl)) {
      finalPrompt = `${userPrompt}\n\nAttached image URL: ${attachedImageUrl}`;
    }

    return { userPrompt, attachedImageUrl, finalPrompt };
  };

  const actionPattern =
    /\b(instagram|email|gmail|send email|calendar|event|schedule|meeting|search|google|web search|publish|post|upload)\b/i;

  it("correctly normalizes plain string message without image", () => {
    const body = { message: "What is artificial intelligence?" };
    const { userPrompt, attachedImageUrl, finalPrompt } = normalizePayload(body);

    assert.equal(userPrompt, "What is artificial intelligence?");
    assert.equal(attachedImageUrl, null);
    assert.equal(finalPrompt, "What is artificial intelligence?");
  });

  it("correctly extracts message and image_url from nested object payload", () => {
    const body = {
      message: {
        message: "Publish this photo to Instagram",
        image_url: "https://res.cloudinary.com/test/image/upload/sample.jpg",
      },
    };
    const { userPrompt, attachedImageUrl, finalPrompt } = normalizePayload(body);

    assert.equal(userPrompt, "Publish this photo to Instagram");
    assert.equal(attachedImageUrl, "https://res.cloudinary.com/test/image/upload/sample.jpg");
    assert.ok(finalPrompt.includes("Publish this photo to Instagram"));
    assert.ok(
      finalPrompt.includes(
        "Attached image URL: https://res.cloudinary.com/test/image/upload/sample.jpg",
      ),
    );
  });

  it("handles image_url provided at top level alongside message string", () => {
    const body = {
      message: "Check this picture",
      image_url: "https://example.com/pic.jpg",
    };
    const { userPrompt, attachedImageUrl, finalPrompt } = normalizePayload(body);

    assert.equal(userPrompt, "Check this picture");
    assert.equal(attachedImageUrl, "https://example.com/pic.jpg");
    assert.equal(finalPrompt, "Check this picture\n\nAttached image URL: https://example.com/pic.jpg");
  });

  it("does not duplicate image_url if already part of prompt", () => {
    const body = {
      message: "Check this https://example.com/pic.jpg",
      image_url: "https://example.com/pic.jpg",
    };
    const { finalPrompt } = normalizePayload(body);

    const matches = finalPrompt.match(/https:\/\/example\.com\/pic\.jpg/g);
    assert.equal(matches?.length, 1);
  });

  it("accurately detects action intent requiring tool-enabled agent graph", () => {
    const actionMessages = [
      "Please publish this on Instagram",
      "Send an email to john@example.com",
      "Check my calendar for tomorrow",
      "Search the web for latest AI news",
      "Create a calendar event for 3 PM",
      "Post this photo with caption",
    ];

    for (const msg of actionMessages) {
      assert.ok(
        actionPattern.test(msg),
        `"${msg}" should be detected as action/tool request`,
      );
    }

    const conversationalMessages = [
      "Hi, how are you doing today?",
      "Can you explain quantum computing?",
      "Write a short poem about nature",
      "Who was Alan Turing?",
    ];

    for (const msg of conversationalMessages) {
      assert.equal(
        actionPattern.test(msg),
        false,
        `"${msg}" should NOT be detected as action/tool request`,
      );
    }
  });
});
