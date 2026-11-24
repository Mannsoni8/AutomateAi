import { cert, initializeApp, getApps } from "firebase-admin/app";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidatePaths = [
  path.resolve(__dirname, "../../serviceAccountKey.json"),
  path.resolve(process.cwd(), "serviceAccountKey.json"),
  path.resolve(process.cwd(), "server/serviceAccountKey.json"),
  "/etc/secrets/serviceAccountKey.json",
];

let serviceAccount = null;

for (const candidate of candidatePaths) {
  if (fs.existsSync(candidate)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      break;
    } catch (err) {
      console.error(`Error reading ${candidate}:`, err.message);
    }
  }
}

if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
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

if (!serviceAccount) {
  console.warn(
    "⚠️ No Firebase service account credentials found! Set FIREBASE_SERVICE_ACCOUNT in Render Environment or upload serviceAccountKey.json.",
  );
}

export const app =
  getApps().length === 0
    ? initializeApp({
        credential: serviceAccount ? cert(serviceAccount) : undefined,
      })
    : getApps()[0];

