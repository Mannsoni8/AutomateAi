import { google } from "googleapis";
import { config } from "./env.js";

export const googleOauthClient = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_REDIRECT_URI,
);

// generate a url that asks permissions for Blogger and Google Calendar scopes
export const scopes = [
  "opeanid",
  "gmail",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gamil.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];
