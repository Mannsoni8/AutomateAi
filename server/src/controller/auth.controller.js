import { app } from "../config/firebase.js";
import { getAuth } from "firebase-admin/auth";
import userModel from "../model/user.model.js";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

const COOKIE_NAME = "token";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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

    const user = await userModel.findOneAndUpdate(
      {
        firebaseUid: decoded.uid,
      },
      {
        $set: {
          name: decoded.name || decoded.displayName || "User",
          email: decoded.email,
          profilePicture: decoded.picture || "",
        },
        $setOnInsert: {
          firebaseUid: decoded.uid,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

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
    });
  } catch (error) {
    console.error("Login controller error:", error.message);
    return res.status(500).json({ message: "Internal server error during login" });
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
