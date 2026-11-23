import { googleOauthClient, scopes } from "../config/googleOAuth.js";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { google } from "googleapis";
import integrationModel from "../model/integration.model.js";
import { encrypt } from "../config/encrypt-decrypt.js";
import axios from "axios";

export const connectGoogleController = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign(
      {
        userId: String(userId),
        purpose: "google-oauth",
      },
      config.JWT_SECRET,
      {
        expiresIn: "10m",
      },
    );
    const url = googleOauthClient.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      state,
      prompt: "consent",
    });

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Connect google error ${error}`,
    });
  }
};

export const googleCallbackController = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).json({
        message: "Google Authorization failed",
      });
    }

    const decoded = jwt.verify(state, config.JWT_SECRET);

    if (decoded.purpose !== "google-oauth" || !decoded.userId) {
      return res.status(400).json({
        message: "Invalid oauth state",
      });
    }

    const { tokens } = await googleOauthClient.getToken(code);

    if (!tokens?.access_token) {
      return res.status(400).json({
        success: false,
        message: "Google access token not received",
      });
    }

    googleOauthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: googleOauthClient,
    });

    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.id || !profile.email) {
      return res.status(400).json({
        message: "Unable to identify google account",
      });
    }

    const filter = {
      userId: decoded.userId,
      provider: "google",
      providerAccountId: profile.id,
    };

    let connection = await integrationModel
      .findOne(filter)
      .select("+tokens.accessToken +tokens.refreshToken");

    if (!connection) {
      connection = new integrationModel({
        ...filter,
        services: [],
        tokens: {},
      });
    }

    connection.services = [
      ...new Set([...(connection.services || []), "gmail", "google_calender"]),
    ];

    connection.account = {
      ...connection.account?.toObject?.(),
      email: profile.email,
      display: profile.name || "",
    };

    connection.scopes = tokens.scope ? tokens.scope.split(" ") : scopes;

    // Encrypt and store access token
    if (tokens.access_token) {
      connection.tokens.accessToken = await encrypt(tokens.access_token);
    }

    // Encrypt and store refresh token
    if (tokens.refresh_token) {
      connection.tokens.refreshToken = await encrypt(tokens.refresh_token);
    }

    // Store expiry date
    if (tokens.expiry_date) {
      connection.tokens.expiresAt = new Date(tokens.expiry_date);
    }

    // Update connection status
    connection.status = "connected";
    connection.connectedAt = new Date();

    // Save to MongoDB
    await connection.save();

    return res.redirect(`${config.FRONTED_URL}/integration?google=connected`);
  } catch (error) {
    console.error("GOOGLE CALLBACK ERROR:", error);
    console.error("ERROR MESSAGE:", error.message);
    console.error("GOOGLE API ERROR:", error.response?.data);
    console.error("ERROR STACK:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Google connection failed",
    });
  }
};

const INSTAGRAM_CONFIG_ID = config.INSTAGRAM_CONFIG_ID;
const INSTAGRAM_REDIRECT_URI = config.INSTAGRAM_REDIRECT_URI;
const INSTAGRAM_APP_ID = config.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = config.INSTAGRAM_APP_SECRET;
const INSTAGRAM_GRAPH_VERSION = config.INSTAGRAM_GRAPH_VERSION;

const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
];

export const connectInstagramController = async (req, res) => {
  try {
    const userId = req.user._id;
    const state = jwt.sign(
      {
        userId: String(userId),
        purpose: "instagram-oauth",
      },
      config.JWT_SECRET,
      {
        expiresIn: "10m",
      },
    );

    const params = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      scope: INSTAGRAM_SCOPES.join(","),
      display: "popup",
      override_default_response_type: "true",
      response_type: "code",
      state,
      prompt: "login",
    });

    if (INSTAGRAM_CONFIG_ID) {
      params.set("config_id", INSTAGRAM_CONFIG_ID);
    }

    const url = `https://www.facebook.com/dialog/oauth?${params.toString()}`;

    return res.status(200).json({
      success: true,
      url,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Connect instagram error ${error}`,
    });
  }
};

export const instagramCallbackController = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return res.status(400).json({
        message: "Instagram Authorization failed",
      });
    }

    const decoded = jwt.verify(state, config.JWT_SECRET);

    if (decoded.purpose !== "instagram-oauth" || !decoded.userId) {
      return res.status(400).json({
        message: "Invalid oauth state",
      });
    }

    const rawVersion = INSTAGRAM_GRAPH_VERSION || "v24.0";
    const cleanVersion = rawVersion.replace(/^\/+/, "");
    const fbGraphUrl = `https://graph.facebook.com/${cleanVersion}`;

    const tokenResponse = await axios.get(
      `${fbGraphUrl}/oauth/access_token`,
      {
        params: {
          client_id: INSTAGRAM_APP_ID,
          redirect_uri: INSTAGRAM_REDIRECT_URI,
          client_secret: INSTAGRAM_APP_SECRET,
          code,
        },
        timeout: 15000,
      },
    );
    const userAccessToken = tokenResponse.data?.access_token;

    if (!userAccessToken) {
      return res.redirect(
        `${config.FRONTED_URL}/integration?instagram=failed`,
      );
    }

    let instagramAccounts = [];

    // Strategy 1: Check assigned_instagram_accounts
    try {
      const assignedAccounts = await axios.get(
        `${fbGraphUrl}/me/assigned_instagram_accounts`,
        {
          params: {
            fields: "id,username",
            access_token: userAccessToken,
          },
          timeout: 15000,
        },
      );
      if (Array.isArray(assignedAccounts.data?.data)) {
        instagramAccounts = assignedAccounts.data.data;
      }
    } catch (assignErr) {
      console.warn("me/assigned_instagram_accounts lookup warning:", assignErr.message);
    }

    // Strategy 2: Check linked instagram_business_account on Facebook Pages
    if (instagramAccounts.length === 0) {
      try {
        const pagesRes = await axios.get(`${fbGraphUrl}/me/accounts`, {
          params: {
            fields: "id,name,instagram_business_account{id,username,name}",
            access_token: userAccessToken,
          },
          timeout: 15000,
        });
        const pages = pagesRes.data?.data || [];
        for (const page of pages) {
          if (page.instagram_business_account?.id) {
            instagramAccounts.push(page.instagram_business_account);
          }
        }
      } catch (pageErr) {
        console.warn("me/accounts lookup warning:", pageErr.message);
      }
    }

    if (!Array.isArray(instagramAccounts) || instagramAccounts.length === 0) {
      console.warn("No linked Professional (Business or Creator) Instagram accounts found.");
      return res.redirect(
        `${config.FRONTED_URL}/integration?instagram=no_business_account`,
      );
    }

    const dynamicAccount = instagramAccounts[0];

    if (!dynamicAccount?.id || !dynamicAccount?.username) {
      return res.redirect(
        `${config.FRONTED_URL}/integration?instagram=failed`,
      );
    }

    // Verify account profile and permissions
    let profileData = {};
    try {
      const profile = await axios.get(
        `${fbGraphUrl}/${dynamicAccount.id}`,
        {
          params: {
            fields: "id,username,name",
            access_token: userAccessToken,
          },
          timeout: 15000,
        },
      );
      profileData = profile.data || {};
    } catch (profileErr) {
      console.warn("Profile fetch warning:", profileErr.message);
      profileData = dynamicAccount;
    }

    const filter = {
      userId: decoded.userId,
      provider: "instagram",
      providerAccountId: profileData.id || dynamicAccount.id,
    };

    let connection = await integrationModel
      .findOne(filter)
      .select("+tokens.accessToken");

    if (!connection) {
      connection = new integrationModel({
        ...filter,
        services: [],
        tokens: {},
      });
    }

    connection.services = [
      ...new Set([...(connection.services || [])]),
      "instagram",
    ];

    connection.account = {
      ...connection.account?.toObject?.(),
      id: profileData.id || dynamicAccount.id,
      username: profileData.username || dynamicAccount.username,
      displayname: profileData.name || profileData.username || dynamicAccount.username,
      display: profileData.name || profileData.username || dynamicAccount.username,
      email: profileData.email || null,
    };

    connection.scopes = INSTAGRAM_SCOPES;

    if (userAccessToken) {
      connection.tokens.accessToken = await encrypt(userAccessToken);
    }

    connection.tokens.expiresAt = null;

    connection.status = "connected";
    connection.connectedAt = new Date();
    await connection.save();

    return res.redirect(`${config.FRONTED_URL}/integration?instagram=connected`);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Connect instagram error ${error}`,
    });
  }
};

export const getIntegrationsController = async (req, res) => {
  try {
    const userId = req.user._id,
      integrations = await integrationModel
        .find({ userId, status: "connected" })
        .select("-tokens");

    const googleIntegrations = integrations.find(
      (items) => items.provider === "google",
    );
    const instagramIntegrations = integrations.find(
      (items) => items.provider === "instagram",
    );
    return res.status(200).json({
      success: true,
      data: {
        gmail: {
          connected: googleIntegrations?.services?.includes("gmail") || false,
          email: googleIntegrations?.account?.email || null,
        },
        google_calender: {
          connected:
            googleIntegrations?.services?.includes("google_calender") || false,
          email: googleIntegrations?.account?.email || null,
        },
        instagram: {
          connected:
            instagramIntegrations?.services?.includes("instagram") || false,
          username: instagramIntegrations?.account?.username || null,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Get integrations error ${error}`,
    });
  }
};

export const disconnectIntegrationController = async (req, res) => {
  try {
    const userId = req.user._id;
    const providerParam =
      req.params.provider ||
      (req.path.includes("instagram")
        ? "instagram"
        : req.path.includes("google")
          ? "google"
          : null);

    if (!providerParam) {
      return res.status(400).json({
        success: false,
        message: "Invalid integration provider",
      });
    }

    if (providerParam === "google") {
      await integrationModel.deleteMany({
        userId,
        provider: "google",
      });
      return res.status(200).json({
        success: true,
        message: "Google disconnected successfully",
      });
    }

    if (providerParam === "instagram") {
      await integrationModel.deleteMany({
        userId,
        provider: "instagram",
      });
      return res.status(200).json({
        success: true,
        message: "Instagram disconnected successfully",
      });
    }

    const serviceMapping = {
      gmail: {
        provider: "google",
        service: "gmail",
      },
      google_calendar: {
        provider: "google",
        service: "google_calender",
      },
      instagram: {
        provider: "instagram",
        service: "instagram",
      },
    };

    const integration = serviceMapping[providerParam];

    if (!integration) {
      return res.status(400).json({
        success: false,
        message: "Invalid integration provider",
      });
    }

    const connection = await integrationModel.findOne({
      userId,
      provider: integration.provider,
      services: integration.service,
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: `${providerParam} connection not found`,
      });
    }

    // Remove only the requested service
    connection.services = connection.services.filter(
      (service) => service !== integration.service,
    );

    // Delete document if no services remain
    if (connection.services.length === 0) {
      await integrationModel.deleteOne({
        _id: connection._id,
        userId,
      });
    } else {
      await connection.save();
    }

    return res.status(200).json({
      success: true,
      message: `${providerParam} disconnected successfully`,
    });
  } catch (error) {
    console.error("Disconnect integration error:", error);

    return res.status(500).json({
      success: false,
      message: "Error disconnecting integration",
    });
  }
};
