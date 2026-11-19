import mongoose from "mongoose";

const integrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["google", "instagram"],
    },
    services: [
      {
        type: String,
        enum: ["google", "gmail", "google_calender", "instagram"],
      },
    ],
    providerAccountId: {
      type: String,
      required: true,
    },
    account: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      username: {
        type: String,
        trim: true,
      },
      displayname: {
        type: String,
        trim: true,
      },
      display: {
        type: String,
        trim: true,
      },
    },
    tokens: {
      accessToken: {
        type: String,
        select: false,
      },
      refreshToken: {
        type: String,
        select: false,
      },
      expiresAt: {
        type: Date,
      },
    },
    scopes: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enums: ["connected", "expired", "revoked", "error"],
      default: "connected",
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    metaData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },

  {
    timestamps: true,
  },
);

const integrationModel = mongoose.model("Integration", integrationSchema);

export default integrationModel;