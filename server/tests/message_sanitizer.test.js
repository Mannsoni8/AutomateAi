import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeMessages } from "../src/utils/sanitizeMessages.js";

describe("Message Sanitizer Tests", () => {
  it("handles null, undefined, or empty inputs gracefully", () => {
    assert.deepEqual(sanitizeMessages(null), []);
    assert.deepEqual(sanitizeMessages(undefined), []);
    assert.deepEqual(sanitizeMessages("not an array"), []);
    assert.deepEqual(sanitizeMessages([]), []);
  });

  it("strips empty strings and whitespace-only content", () => {
    const messages = [
      { role: "user", content: "Valid message" },
      { role: "assistant", content: "" },
      { role: "user", content: "   " },
      { role: "assistant", content: "\n\t  " },
      null,
      undefined,
    ];

    const result = sanitizeMessages(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].content, "Valid message");
  });

  it("flattens multimodal array content into a single string for Groq compatibility", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Please publish this photo to Instagram" },
          {
            type: "image_url",
            image_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
          },
        ],
      },
    ];

    const result = sanitizeMessages(messages);
    assert.equal(result.length, 1);
    assert.equal(typeof result[0].content, "string");
    assert.ok(
      result[0].content.includes("Please publish this photo to Instagram"),
      "Must preserve textual prompt",
    );
    assert.ok(
      result[0].content.includes(
        "Image URL: https://res.cloudinary.com/demo/image/upload/sample.jpg",
      ),
      "Must include formatted image URL",
    );
  });

  it("handles multimodal array when image_url is nested object with url property", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Check this image" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/photo.png" },
          },
        ],
      },
    ];

    const result = sanitizeMessages(messages);
    assert.equal(result.length, 1);
    assert.ok(result[0].content.includes("Check this image"));
    assert.ok(result[0].content.includes("Image URL: https://example.com/photo.png"));
  });

  it("extracts string when content is an object with text or message property", () => {
    const messages = [
      { role: "user", content: { text: "Hello from text object" } },
      { role: "user", content: { message: "Hello from message object" } },
      { role: "user", content: { other: "no valid text" } },
    ];

    const result = sanitizeMessages(messages);
    assert.equal(result.length, 2);
    assert.equal(result[0].content, "Hello from text object");
    assert.equal(result[1].content, "Hello from message object");
  });

  it("preserves AI tool_calls even when content is an empty string", () => {
    const messages = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_abc123",
            name: "publish_instagram_post",
            args: { caption: "Test post" },
          },
        ],
      },
    ];

    const result = sanitizeMessages(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].tool_calls.length, 1);
    assert.equal(result[0].tool_calls[0].name, "publish_instagram_post");
  });
});
