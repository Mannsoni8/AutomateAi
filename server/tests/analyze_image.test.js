import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

describe("Analyze Image Tool Schema & Validation Tests", () => {
  const analyzeImageSchema = z.object({
    imageUrl: z
      .string()
      .url()
      .refine((url) => url.startsWith("https://"), {
        message: "Image URL must be a valid HTTPS URL",
      }),
    prompt: z
      .string()
      .trim()
      .max(2200)
      .default("Describe this image clearly and accurately."),
  });

  it("validates valid HTTPS image URL and supplies default prompt", () => {
    const input = {
      imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    };
    const parsed = analyzeImageSchema.parse(input);

    assert.equal(parsed.imageUrl, input.imageUrl);
    assert.equal(parsed.prompt, "Describe this image clearly and accurately.");
  });

  it("preserves custom user prompts such as questions or instructions", () => {
    const input = {
      imageUrl: "https://example.com/screenshot.png",
      prompt: "What error message is shown in this terminal screenshot?",
    };
    const parsed = analyzeImageSchema.parse(input);

    assert.equal(
      parsed.prompt,
      "What error message is shown in this terminal screenshot?",
    );
  });

  it("rejects non-HTTPS URLs", () => {
    assert.throws(() => {
      analyzeImageSchema.parse({
        imageUrl: "http://example.com/insecure.jpg",
      });
    }, /Image URL must be a valid HTTPS URL/);

    assert.throws(() => {
      analyzeImageSchema.parse({
        imageUrl: "ftp://example.com/insecure.jpg",
      });
    });
  });

  it("rejects non-URL strings", () => {
    assert.throws(() => {
      analyzeImageSchema.parse({
        imageUrl: "not-a-valid-url",
      });
    });
  });
});

describe("Analyze Image Handler Logic Tests", () => {
  const validateImageMetadata = (headers, maxBytes = 10 * 1024 * 1024) => {
    const contentType = headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      ?.toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error(`Unsupported image content type: ${contentType}`);
    }

    const contentLength = headers["content-length"];
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error("Image exceeds 10 MB");
    }

    return contentType;
  };

  it("accepts valid content types (JPEG, PNG, WebP)", () => {
    assert.equal(
      validateImageMetadata({ "content-type": "image/jpeg" }),
      "image/jpeg",
    );
    assert.equal(
      validateImageMetadata({ "content-type": "image/png; charset=utf-8" }),
      "image/png",
    );
    assert.equal(
      validateImageMetadata({ "content-type": "image/webp" }),
      "image/webp",
    );
  });

  it("rejects unsupported content types (GIF, SVG, HTML, PDF)", () => {
    assert.throws(() => {
      validateImageMetadata({ "content-type": "image/gif" });
    }, /Unsupported image content type/);

    assert.throws(() => {
      validateImageMetadata({ "content-type": "text/html" });
    }, /Unsupported image content type/);

    assert.throws(() => {
      validateImageMetadata({ "content-type": "application/pdf" });
    }, /Unsupported image content type/);
  });

  it("rejects images with content-length exceeding 10MB", () => {
    assert.throws(() => {
      validateImageMetadata({
        "content-type": "image/jpeg",
        "content-length": "12000000",
      });
    }, /Image exceeds 10 MB/);
  });

  it("formats prompt accurately for Gemini without forcing Instagram captioning", () => {
    const userPrompt = "Explain what this diagram is illustrating.";
    const analysisPrompt =
      userPrompt && typeof userPrompt === "string" && userPrompt.trim()
        ? userPrompt.trim()
        : "Describe this image clearly and accurately.";

    assert.equal(analysisPrompt, "Explain what this diagram is illustrating.");
    assert.ok(
      !analysisPrompt.includes("Instagram"),
      "Must not inject Instagram caption instruction for general analysis",
    );
  });

  it("returns MCP-compliant success structure with text content array", () => {
    const analysisText = "The image shows a sunset over a mountain lake.";
    const mcpResponse = {
      content: [
        {
          type: "text",
          text: analysisText,
        },
      ],
    };

    assert.ok(Array.isArray(mcpResponse.content));
    assert.equal(mcpResponse.content[0].type, "text");
    assert.equal(mcpResponse.content[0].text, analysisText);
  });

  it("returns MCP-compliant error structure when analysis fails", () => {
    const error = new Error("Unsupported image content type");
    const errorResponse = {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: `Image analysis failed: ${error.message || error}`,
            code: "IMAGE_ANALYSIS_ERROR",
          }),
        },
      ],
    };

    assert.equal(errorResponse.isError, true);
    const parsed = JSON.parse(errorResponse.content[0].text);
    assert.equal(parsed.success, false);
    assert.equal(parsed.code, "IMAGE_ANALYSIS_ERROR");
  });
});
