import axios from "axios";

export const convertCloudinaryToJpeg = (url) => {
  if (!url || typeof url !== "string") return url;
  let cleanUrl = url.trim();
  if (
    cleanUrl.includes("res.cloudinary.com") &&
    cleanUrl.includes("/image/upload/")
  ) {
    if (!cleanUrl.includes("/f_jpg") && !cleanUrl.includes(",f_jpg")) {
      cleanUrl = cleanUrl.replace(
        "/image/upload/",
        "/image/upload/f_jpg,q_auto/",
      );
    }
    cleanUrl = cleanUrl.replace(
      /\.(png|webp|gif|avif|bmp|tiff|svg)(\?.*)?$/i,
      ".jpg$2",
    );
    if (!/\.jpe?g(\?.*)?$/i.test(cleanUrl)) {
      cleanUrl = cleanUrl.replace(/(\?.*)?$/, ".jpg$1");
    }
  }
  return cleanUrl;
};

export const validateInstagramImage = async (imageUrl) => {
  try {
    const headRes = await axios.head(imageUrl, {
      timeout: 10000,
      maxRedirects: 5,
    });
    const contentType = headRes.headers["content-type"] || "";
    const contentLength = parseInt(
      headRes.headers["content-length"] || "0",
      10,
    );

    if (contentLength > 8 * 1024 * 1024) {
      return {
        valid: false,
        error: `Image size exceeds Instagram's 8MB limit (${(contentLength / (1024 * 1024)).toFixed(2)}MB).`,
        code: "IMAGE_TOO_LARGE",
      };
    }

    if (
      contentType &&
      !contentType.includes("image/jpeg") &&
      !contentType.includes("image/jpg")
    ) {
      return {
        valid: false,
        error: `Invalid image Content-Type "${contentType}". Instagram Graph API only supports image/jpeg.`,
        code: "INVALID_CONTENT_TYPE",
      };
    }

    return { valid: true, contentType, contentLength };
  } catch (error) {
    if (error.response?.status === 405) {
      try {
        const getRes = await axios.get(imageUrl, {
          headers: { Range: "bytes=0-1024" },
          timeout: 10000,
          maxRedirects: 5,
        });
        const contentType = getRes.headers["content-type"] || "";
        if (
          contentType &&
          !contentType.includes("image/jpeg") &&
          !contentType.includes("image/jpg")
        ) {
          return {
            valid: false,
            error: `Invalid image Content-Type "${contentType}". Instagram Graph API only supports image/jpeg.`,
            code: "INVALID_CONTENT_TYPE",
          };
        }
        return { valid: true, contentType };
      } catch (e) {
        return {
          valid: false,
          error: `Could not verify image URL: ${e.message}`,
          code: "IMAGE_URL_UNREACHABLE",
        };
      }
    }
    return {
      valid: false,
      error: `Could not verify image URL: ${error.message}`,
      code: "IMAGE_URL_UNREACHABLE",
    };
  }
};

export const sanitizeMetaError = (error) => {
  const metaError = error.response?.data?.error || {};
  const code = metaError.code || error.response?.status || "UNKNOWN_ERROR";
  const subcode = metaError.error_subcode
    ? ` (subcode: ${metaError.error_subcode})`
    : "";
  const rawMessage =
    metaError.message || error.message || "Unknown Meta API error occurred";
  const sanitizedMessage = String(rawMessage).replace(
    /access_token=[a-zA-Z0-9_\-]+/g,
    "access_token=[REDACTED]",
  );

  return {
    code: `META_API_ERROR_${code}`,
    metaCode: code,
    metaSubcode: metaError.error_subcode || null,
    type: metaError.type || "OAuthException",
    message: `${sanitizedMessage}${subcode}`,
    fbtraceId: metaError.fbtrace_id || null,
  };
};

export const isExplicitConfirmation = (text) => {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim().toLowerCase().replace(/^[^a-z0-9]+/i, "");
  return (
    /^(yes|confirm|confirmed|proceed|go ahead|approve|approved|publish|publish it|post it|do it|ok|okay|sure|yep|yeah)(\b|[,.!?;:\s])/i.test(
      clean,
    ) ||
    /^(yes|confirm|confirmed|proceed|go ahead|approve|approved|publish|publish it|post it|do it|ok|okay|sure|yep|yeah)$/i.test(
      clean,
    )
  );
};

