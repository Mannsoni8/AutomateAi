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
      enums: ["google", "instragram"],
    },
    services: [
      {
        type: String,
        enums: ["google", "google_calender", "instragram"],
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