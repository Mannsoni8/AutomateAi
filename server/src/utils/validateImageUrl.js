const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd/i,
  /\.local$/i,
  /\.internal$/i,
];

export const isPrivateHost = (hostname = "") => {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
};

export const assertSafePublicHttpsUrl = (rawUrl) => {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new Error("A valid HTTPS image URL is required");
  }
  const url = new URL(rawUrl.trim());
  if (url.protocol !== "https:") {
    throw new Error("Image must use HTTPS");
  }
  if (!url.hostname || isPrivateHost(url.hostname)) {
    throw new Error("Private or internal image URLs are not allowed");
  }
  return url.toString();
};

export const isSafeCloudinaryImageUrl = (rawUrl) => {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  try {
    const url = new URL(rawUrl.trim());
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      url.pathname.includes("/image/upload/")
    );
  } catch {
    return false;
  }
};
