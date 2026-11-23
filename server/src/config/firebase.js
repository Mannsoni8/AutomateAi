import { cert, initializeApp, getApps } from "firebase-admin/app";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keyPath = path.resolve(__dirname, "../../serviceAccountKey.json");

let serviceAccount = null;

if (fs.existsSync(keyPath)) {
  try {
    serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  } catch (err) {
    console.error("Error reading serviceAccountKey.json:", err.message);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch {
    try {
      serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf-8")
      );
    } catch (parseErr) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", parseErr.message);
    }
  }
}

export const app =
  getApps().length === 0
    ? initializeApp({
        credential: serviceAccount ? cert(serviceAccount) : undefined,
      })
    : getApps()[0];

