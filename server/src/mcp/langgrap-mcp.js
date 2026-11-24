import { MCPAdapter } from "@langchain/mcp-adapters";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const serverPath = path.join(dirName, "server.js");
const projectRoot = path.resolve(dirName, "../..");

const getCleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => typeof value === "string" && !key.startsWith("="),
    ),
  );

let adapterInstance = null;

const createAdapter = () => {
  return new MCPAdapter({
    servers: {
      autoMate: {
        transport: "stdio",
        command: process.execPath,
        args: [serverPath],
        cwd: projectRoot,
        env: getCleanEnv(),
        restart: {
          enabled: true,
          maxAttempts: 3,
          delayMs: 1000,
        },
      },
    },
  });
};

export const getMcpTools = async () => {
  if (!adapterInstance) {
    adapterInstance = createAdapter();
  }

  try {
    const tools = await adapterInstance.listTools();
    return tools;
  } catch (error) {
    console.error("MCP tool loading failed, resetting adapter:", error.message);
    try {
      await adapterInstance.close();
    } catch {
      // Ignore cleanup error
    }
    adapterInstance = null;
    throw error;
  }
};

export const closeMcpAdapter = async () => {
  if (adapterInstance) {
    try {
      await adapterInstance.close();
    } catch {
      // Ignore cleanup error
    }
    adapterInstance = null;
  }
};

