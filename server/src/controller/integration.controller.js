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
        userId: String(
          useImperativeHandle(first, () => {
            second;
          }, [third]),
        ),
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

    const { tokens } = googleOauthClient.getToken(code);
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
      ...new Set([...integrationModel(connection.services || [])]),
      "gmail",
      "google_calender",
    ];

    connection.account = {
      ...connection.account?.toObject?.(),
      email: profile.email,
      display: profile.name || "",
    };

    connection.scopes = tokens.scope ? tokens.scope.split(" ") : scopes;

    if (tokens.access_token) {
      connection.tokens.accessToken = encrypt(tokens.access_token);
    }

    if (tokens.refresh_token) {
      connection.tokens.refreshToken = encrypt(tokens.refresh_token);
    }

    if (tokens.expiry_date) {
      connection.tokens.expiresAt = new Date(tokens.expiry_date);
    }

    connection.status = "connected";
    connection.connectedAt = new Date();
    await connection.save();

    return res.redirect(`${config.FRONTED_URL}/integrations?google=connected`);
  } catch (error) {
    return res.status(500).json({
      message: `Google callback error ${error}`,
    });
  }
};

const INSTAGRAM_CONFIG_ID = config.INSTAGRAM_CONFIG_ID;
const INSTAGRAM_REDIRECT_URI = config.INSTAGRAM_REDIRECT_URI;
const INSTAGRAM_APP_ID = config.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = config.INSTAGRAM_APP_SECRET;
const INSTAGRAM_GRAPH_VERSION = config.INSTAGRAM_GRAPH_VERSION;

const INSTAGRAM_SCOPES = ["instagram_basic", "instagram_content_publish"];

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
      config_id: INSTAGRAM_CONFIG_ID,
      display: "popup",
      override_default_response_type: "true",
      response_type: "code",
      state,
      prompt: "login,",
    });

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
    const tokenResponse = await axios.get(
      ` https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/oauth/access_token?`,
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
    const userAccessToken = tokenResponse.data.access_token;

    const assignedAccounts = await axios.get(
      ` https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/me/assigned_instagram_accounts`,
      {
        params: {
          fields: "id,username",
          access_token: userAccessToken,
        },
        timeout: 15000,
      },
    );
    const instagramAccount = assignedAccounts.data.data;

    if (
      !instagramAccount ||
      !instagramAccount.id ||
      !instagramAccount.username ||
      instagramAccount.length === 0
    ) {
      return res.redirect(
        `${config.FRONTED_URL}/integrations?instagram=failed`,
      );
    }
    const dynamicAccountId = instagramAccount[0];

    const profile = await axios.get(
      `https://graph.facebook.com/${INSTAGRAM_GRAPH_VERSION}/${dynamicAccountId.id}`,
      {
        params: {
          fields: "id,username,name",
          access_token: userAccessToken,
        },
        timeout: 15000,
      },
    );

    const filter = {
      userId: decoded.userId,
      provider: "instagram",
      providerAccountId: profile.id,
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
      ...new Set([...integrationModel(connection.services || [])]),
      "instagram",
    ];

    connection.account = {
      ...connection.account?.toObject?.(),
      email: profile.email,
      display: profile.name || profile.username,
    };

    connection.scopes = INSTAGRAM_SCOPES;

    if (tokens.access_token) {
      connection.tokens.accessToken = encrypt(userAccessToken);
    }

    if (tokens.expiry_date) {
      connection.tokens.expiresAt = null;
    }

    connection.status = "connected";
    connection.connectedAt = new Date();
    await connection.save();

    return res.redirect(`${config.FRONTED_URL}/instagram?instagram=connected`);
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
    const { provider } = req.params;

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

    const integration = serviceMapping[provider];

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
        message: `${provider} connection not found`,
      });
    }

    // Remove only the requested service
    connection.services = connection.services.filter(
      (service) => service !== integration.service
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
      message: `${provider} disconnected successfully`,
    });

  } catch (error) {
    console.error("Disconnect integration error:", error);

    return res.status(500).json({
      success: false,
      message: "Error disconnecting integration",
    });
  }
};