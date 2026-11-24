import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { getMcpTools, closeMcpAdapter } from "../src/mcp/langgrap-mcp.js";

describe("MCP Stdio Transport Integration Tests", () => {
  after(async () => {
    await closeMcpAdapter();
  });

  it("connects to stdio server, retrieves all registered tools, and maintains clean JSON-RPC protocol", async () => {
    const tools = await getMcpTools();

    assert.ok(Array.isArray(tools), "Tools must be returned as an array");
    assert.ok(tools.length >= 6, "Must register at least 6 primary tools");

    const toolNames = tools.map((t) => t.name);
    assert.ok(
      toolNames.some((n) => n.includes("web_search")),
      "web_search tool must be registered",
    );
    assert.ok(
      toolNames.some((n) => n.includes("send_email")),
      "send_email tool must be registered",
    );
    assert.ok(
      toolNames.some((n) => n.includes("list_emails")),
      "list_emails tool must be registered",
    );
    assert.ok(
      toolNames.some((n) => n.includes("create_calendar_event")),
      "create_calendar_event tool must be registered",
    );
    assert.ok(
      toolNames.some((n) => n.includes("publish_instagram_post")),
      "publish_instagram_post tool must be registered",
    );
    assert.ok(
      toolNames.some((n) => n.includes("analyze_image")),
      "analyze_image tool must be registered",
    );
  });

  it("handles consecutive tool listing calls safely via connection manager", async () => {
    const tools1 = await getMcpTools();
    const tools2 = await getMcpTools();

    assert.equal(tools1.length, tools2.length);
  });
});
