import { app } from "../config/firebase.js";
import { getAuth } from "firebase-admin/auth";
import userModel from "../model/user.model.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config/env.js";

const scryptAsync = promisify(crypto.scrypt);
const COOKIE_NAME = "token";

const isProduction =
  process.env.NODE_ENV === "production" || process.env.RENDER === "true";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
});

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const keyBuffer = Buffer.from(keyHex, "hex");
  const derivedBuffer = await scryptAsync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
};

const sanitizeUser = (user) => {
  if (!user) return user;
  const obj = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete obj.passwordHash;
  return obj;
};

const issueSession = (res, user) => {
  if (!config.JWT_SECRET) {
    throw new Error("Server configuration error: JWT_SECRET is not configured");
  }
  const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.cookie(COOKIE_NAME, token, {
    ...getCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const signupController = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.toLowerCase().trim();

    if (!trimmedName || trimmedName.length < 2) {
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters long" });
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    const existingUser = await userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists. Please sign in.",
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await userModel.create({
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      authProvider: "local",
    });

    if (!config.JWT_SECRET) {
      console.error("FATAL: JWT_SECRET environment variable is missing!");
      return res
        .status(500)
        .json({ message: "Server configuration error: JWT_SECRET is not configured" });
    }

    const token = issueSession(res, user);

    return res.status(201).json({
      message: "Account created successfully",
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    console.error("Signup controller error:", error);
    return res.status(500).json({
      message: error.message || "Internal server error during signup",
    });
  }
};

export const signinController = async (req, res) => {
  try {
    // Support Firebase token if passed to /signin as well
    if (req.body?.token) {
      return loginController(req, res);
    }

    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (!EMAIL_REGEX.test(normalizedEmail) || !password) {
      return res
        .status(400)
        .json({ message: "Valid email and password are required" });
    }

    const user = await userModel
      .findOne({ email: normalizedEmail })
      .select("+passwordHash");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        message:
          "This account uses Google Sign-In. Please continue with Google.",
      });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!config.JWT_SECRET) {
      console.error("FATAL: JWT_SECRET environment variable is missing!");
      return res
        .status(500)
        .json({ message: "Server configuration error: JWT_SECRET is not configured" });
    }

    const token = issueSession(res, user);

    return res.status(200).json({
      message: "User login successfully",
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    console.error("Signin controller error:", error);
    return res.status(500).json({
      message: error.message || "Internal server error during sign in",
    });
  }
};

export const loginController = async (req, res) => {
  try {
    const { token: firebaseToken } = req.body;
    if (!firebaseToken) {
      return res.status(400).json({ message: "Firebase token is required" });
    }

    let decoded;
    try {
      decoded = await getAuth(app).verifyIdToken(firebaseToken);
    } catch (firebaseError) {
      console.error("Firebase token verification failed:", firebaseError.message);
      return res.status(401).json({ message: "Invalid or expired Firebase token" });
    }

    const normalizedEmail = (decoded.email || "").toLowerCase().trim();

    // Find existing user by firebaseUid OR by email to prevent duplicate key errors
    let user = await userModel.findOne({
      $or: [
        { firebaseUid: decoded.uid },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    });

    if (user) {
      // Update existing record, syncing firebaseUid and latest profile info
      user.firebaseUid = decoded.uid;
      user.name = decoded.name || decoded.displayName || user.name || "User";
      if (normalizedEmail) user.email = normalizedEmail;
      if (decoded.picture) user.profilePicture = decoded.picture;
      await user.save();
    } else {
      // Create new user record
      user = await userModel.create({
        firebaseUid: decoded.uid,
        name: decoded.name || decoded.displayName || "User",
        email: normalizedEmail,
        profilePicture: decoded.picture || "",
        authProvider: "google",
      });
    }

    if (!user) {
      console.error("User could not be created or updated");
      return res.status(500).json({ message: "Failed to create or retrieve user profile" });
    }

    if (!config.JWT_SECRET) {
      console.error("FATAL: JWT_SECRET environment variable is missing!");
      return res.status(500).json({ message: "Server configuration error: JWT_SECRET is not configured" });
    }

    const token = issueSession(res, user);

    return res.status(200).json({
      message: "User login successfully",
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    console.error("Login controller error:", error);
    return res.status(500).json({
      message: error.message || "Internal server error during login",
    });
  }
};

export const logoutController = async (req, res) => {
  try {
    res.clearCookie(COOKIE_NAME, getCookieOptions());

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout controller error:", error.message);
    return res.status(500).json({ message: "Internal server error during logout" });
  }
};

export const meController = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error("Me controller error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
