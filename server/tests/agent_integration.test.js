import { describe, it } from "node:test";
import assert from "node:assert/strict";
import agentModel from "../src/model/agent.model.js";
import {
  createAgentController,
  getAgentsController,
  deleteAgentController,
} from "../src/controller/agent.controller.js";

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

describe("Agent Management Integration Tests", () => {
  const mockUserId = "usr_integration_agent_123";

  it("completes full Agent lifecycle: create -> list -> delete", async () => {
    const memoryStore = new Map();

    const originalFindOne = agentModel.findOne;
    const originalCreate = agentModel.create;
    const originalFind = agentModel.find;
    const originalFindOneAndDelete = agentModel.findOneAndDelete;

    try {
      // Mock Mongoose operations backed by an in-memory Map
      agentModel.findOne = async (query) => {
        if (query.name) {
          return Array.from(memoryStore.values()).find((a) => a.name === query.name) || null;
        }
        return null;
      };

      agentModel.create = async (doc) => {
        const id = "agent_" + Date.now();
        const saved = { _id: id, ...doc };
        memoryStore.set(id, saved);
        return saved;
      };

      agentModel.find = (query) => ({
        populate: async () =>
          Array.from(memoryStore.values()).filter(
            (a) => a.userId === query.userId,
          ),
      });

      agentModel.findOneAndDelete = async (query) => {
        const item = Array.from(memoryStore.values()).find(
          (a) => a._id === query._id && a.userId === query.userId,
        );
        if (item) {
          memoryStore.delete(item._id);
          return item;
        }
        return null;
      };

      // 1. Create Agent with specialized tools
      const createReq = {
        user: { _id: mockUserId },
        body: {
          name: "Sales Assistant",
          instructions: "Help write polite email responses and schedule calls",
          knowledgeBase: "Company products and services overview",
          tools: ["send_email", "create_calendar_event"],
        },
      };
      const createRes = createMockRes();

      await createAgentController(createReq, createRes);

      assert.equal(createRes.statusCode, 201);
      assert.equal(createRes.body.name, "Sales Assistant");
      assert.deepEqual(createRes.body.tools, [
        "send_email",
        "create_calendar_event",
      ]);

      const createdAgentId = createRes.body._id;

      // 2. Query Agents scoped to user
      const listReq = { user: { _id: mockUserId } };
      const listRes = createMockRes();

      await getAgentsController(listReq, listRes);

      assert.equal(listRes.statusCode, 200);
      assert.ok(Array.isArray(listRes.body));
      assert.equal(listRes.body.length, 1);
      assert.equal(listRes.body[0]._id, createdAgentId);

      // 3. Delete Agent
      const deleteReq = {
        user: { _id: mockUserId },
        params: { id: createdAgentId },
      };
      const deleteRes = createMockRes();

      await deleteAgentController(deleteReq, deleteRes);

      assert.equal(deleteRes.statusCode, 200);
      assert.equal(deleteRes.body._id, createdAgentId);
      assert.equal(memoryStore.size, 0, "Agent should be deleted from store");
    } finally {
      agentModel.findOne = originalFindOne;
      agentModel.create = originalCreate;
      agentModel.find = originalFind;
      agentModel.findOneAndDelete = originalFindOneAndDelete;
    }
  });

  it("rejects creating agent with missing required parameters", async () => {
    const invalidReq = {
      user: { _id: mockUserId },
      body: {
        name: "", // empty name
        instructions: "Do stuff",
      },
    };
    const res = createMockRes();

    await createAgentController(invalidReq, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "All fields are required");
  });
});
