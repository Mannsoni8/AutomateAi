import { app } from "../config/firebase.js";
import { getAuth } from "firebase-admin/auth";
import userModel from "../model/user.model.js";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

const COOKIE_NAME = "token";

const isProduction =
  process.env.NODE_ENV === "production" || process.env.RENDER === "true";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
});

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

    const token = jwt.sign({ userId: user._id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie(COOKIE_NAME, token, {
      ...getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "User login successfully",
      user,
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