import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertCloudinaryToJpeg,
  sanitizeMetaError,
  isExplicitConfirmation,
} from "../src/utils/instagramUtils.js";

describe("Instagram Image Transformation Tests", () => {
  it("converts Cloudinary PNG URL to JPEG with f_jpg,q_auto and .jpg extension", () => {
    const inputUrl =
      "https://res.cloudinary.com/mycloud/image/upload/v123456789/automate-ai/instagram/test_image.png";
    const result = convertCloudinaryToJpeg(inputUrl);

    assert.ok(
      result.includes("/image/upload/f_jpg,q_auto/"),
      "Should contain f_jpg,q_auto transformation",
    );
    assert.ok(result.endsWith(".jpg"), "Should end with .jpg extension");
  });

  it("converts Cloudinary WebP URL to JPEG", () => {
    const inputUrl =
      "https://res.cloudinary.com/mycloud/image/upload/v123456789/automate-ai/instagram/photo.webp";
    const result = convertCloudinaryToJpeg(inputUrl);

    assert.ok(
      result.includes("/image/upload/f_jpg,q_auto/"),
      "Should insert f_jpg,q_auto",
    );
    assert.ok(result.endsWith(".jpg"), "Should replace .webp with .jpg");
  });

  it("does not duplicate f_jpg if already present", () => {
    const inputUrl =
      "https://res.cloudinary.com/mycloud/image/upload/f_jpg,q_auto/v123456789/photo.jpg";
    const result = convertCloudinaryToJpeg(inputUrl);

    assert.equal(
      result.match(/f_jpg/g)?.length,
      1,
      "Should only have one f_jpg",
    );
  });

  it("leaves non-Cloudinary HTTPS URLs untouched", () => {
    const nonCloudinaryUrl = "https://example.com/images/my_photo.jpg";
    const result = convertCloudinaryToJpeg(nonCloudinaryUrl);

    assert.equal(result, nonCloudinaryUrl);
  });
});

describe("Meta API Error Sanitization Tests", () => {
  it("sanitizes access tokens and produces structured error object", () => {
    const mockError = {
      message: "Request failed with status code 400",
      response: {
        status: 400,
        data: {
          error: {
            message:
              "Invalid OAuth access token - Cannot parse access token: access_token=EAABsbCS1928374abcdef",
            type: "OAuthException",
            code: 190,
            error_subcode: 463,
            fbtrace_id: "A1B2C3D4E5",
          },
        },
      },
    };

    const sanitized = sanitizeMetaError(mockError);

    assert.equal(sanitized.code, "META_API_ERROR_190");
    assert.equal(sanitized.metaCode, 190);
    assert.equal(sanitized.metaSubcode, 463);
    assert.ok(!sanitized.message.includes("EAABsbCS1928374abcdef"), "Access token must be redacted");
    assert.ok(sanitized.message.includes("[REDACTED]"), "Should have [REDACTED]");
    assert.equal(sanitized.fbtraceId, "A1B2C3D4E5");
  });

  it("handles network/unknown errors gracefully", () => {
    const networkError = new Error("connect ECONNREFUSED 127.0.0.1:443");
    const sanitized = sanitizeMetaError(networkError);

    assert.equal(sanitized.code, "META_API_ERROR_UNKNOWN_ERROR");
    assert.ok(sanitized.message.includes("ECONNREFUSED"));
  });
});

describe("Instagram Mocked Publication Lifecycle Tests", () => {
  it("simulates full container creation -> polling -> publication lifecycle", async () => {
    // Mock Meta Graph API responses
    const mockDb = {
      mediaContainers: new Map(),
      publishedMedia: new Map(),
    };

    // 1. Mock Container Creation
    const mockCreateContainer = async ({ imageUrl, caption }) => {
      assert.ok(imageUrl.startsWith("https://"), "Image URL must be HTTPS");
      const containerId = "container_" + Date.now();
      mockDb.mediaContainers.set(containerId, {
        status_code: "IN_PROGRESS",
        imageUrl,
        caption,
        attempts: 0,
      });
      return { data: { id: containerId } };
    };

    // 2. Mock Status Polling
    const mockPollStatus = async (containerId) => {
      const container = mockDb.mediaContainers.get(containerId);
      assert.ok(container, "Container must exist");
      container.attempts++;
      if (container.attempts >= 2) {
        container.status_code = "FINISHED";
      }
      return { data: { status_code: container.status_code } };
    };

    // 3. Mock Media Publish
    const mockPublish = async (containerId) => {
      const container = mockDb.mediaContainers.get(containerId);
      assert.equal(container.status_code, "FINISHED", "Can only publish FINISHED container");
      const mediaId = "179" + Math.floor(100000000 + Math.random() * 900000000);
      mockDb.publishedMedia.set(mediaId, {
        containerId,
        publishedAt: new Date().toISOString(),
      });
      return { data: { id: mediaId } };
    };

    // Run simulated workflow
    const containerRes = await mockCreateContainer({
      imageUrl: "https://res.cloudinary.com/test/image/upload/f_jpg,q_auto/sample.jpg",
      caption: "Testing Instagram automation! #AutomateAI",
    });

    assert.ok(containerRes.data.id, "Container ID must be created");
    const creationId = containerRes.data.id;

    let isReady = false;
    for (let i = 0; i < 5; i++) {
      const statusRes = await mockPollStatus(creationId);
      if (statusRes.data.status_code === "FINISHED") {
        isReady = true;
        break;
      }
    }

    assert.ok(isReady, "Media processing must finish");

    const publishRes = await mockPublish(creationId);
    assert.ok(publishRes.data.id.startsWith("179"), "Must return verified Instagram media ID");
  });

  it("handles container processing error without attempting publication", async () => {
    let publishAttempted = false;

    const mockCreateContainer = async () => ({
      data: { id: "container_err_123" },
    });

    const mockPollStatus = async () => ({
      data: {
        status_code: "ERROR",
        status: "Media download failed. Image was unreachable or corrupted.",
      },
    });

    const mockPublish = async () => {
      publishAttempted = true;
      return { data: { id: "media_123" } };
    };

    const container = await mockCreateContainer();
    const status = await mockPollStatus(container.data.id);

    assert.equal(status.data.status_code, "ERROR");
    if (status.data.status_code !== "FINISHED") {
      // Abort publication
      const errorResult = {
        isError: true,
        error: `Instagram media processing failed: ${status.data.status_code} - ${status.data.status}`,
      };
      assert.equal(errorResult.isError, true);
    } else {
      await mockPublish();
    }

    assert.equal(publishAttempted, false, "Publication must not be attempted on container error");
  });
});

describe("Instagram User Confirmation Guard Tests", () => {
  it("correctly identifies initial posting requests as requiring confirmation", () => {
    assert.equal(
      isExplicitConfirmation("Post this image on Instagram with a creative caption"),
      false,
      "Initial request must NOT bypass confirmation",
    );
    assert.equal(
      isExplicitConfirmation("Please upload this picture to Instagram"),
      false,
      "Upload request must NOT bypass confirmation",
    );
  });

  it("correctly identifies affirmative user confirmations", () => {
    assert.equal(isExplicitConfirmation("Yes"), true);
    assert.equal(isExplicitConfirmation("yes, publish it"), true);
    assert.equal(isExplicitConfirmation("Confirm"), true);
    assert.equal(isExplicitConfirmation("Go ahead"), true);
    assert.equal(isExplicitConfirmation("Approved"), true);
    assert.equal(isExplicitConfirmation("Proceed"), true);
  });
});
