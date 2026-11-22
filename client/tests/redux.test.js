import { describe, it } from "node:test";
import assert from "node:assert/strict";
import userReducer, { setUserData } from "../src/redux/userSlice.js";
import agentReducer, {
  setAgents,
  setSelectedAgent,
  setagentsLoading,
  setDelete,
} from "../src/redux/agentSlice.js";

describe("User Redux Slice Tests", () => {
  it("initializes with null userData", () => {
    const initialState = userReducer(undefined, { type: "@@INIT" });
    assert.deepEqual(initialState, { userData: null });
  });

  it("sets user data correctly with setUserData action", () => {
    const previousState = { userData: null };
    const mockUser = {
      _id: "usr_123",
      name: "Alice Developer",
      email: "alice@example.com",
      profilePicture: "https://example.com/avatar.png",
    };

    const nextState = userReducer(previousState, setUserData(mockUser));
    assert.deepEqual(nextState.userData, mockUser);
  });

  it("clears user data on logout by passing null", () => {
    const previousState = {
      userData: { _id: "usr_123", name: "Alice Developer" },
    };

    const nextState = userReducer(previousState, setUserData(null));
    assert.equal(nextState.userData, null);
  });
});

describe("Agent Redux Slice Tests", () => {
  it("initializes with empty agents and default values", () => {
    const initialState = agentReducer(undefined, { type: "@@INIT" });
    assert.deepEqual(initialState, {
      agents: [],
      selectedAgent: "",
      agentsLoading: false,
    });
  });

  it("updates agents list with setAgents action", () => {
    const mockAgents = [
      { _id: "agent_1", name: "Instagram Assistant" },
      { _id: "agent_2", name: "Email Copilot" },
    ];

    const nextState = agentReducer(undefined, setAgents(mockAgents));
    assert.equal(nextState.agents.length, 2);
    assert.deepEqual(nextState.agents, mockAgents);
  });

  it("handles empty or null payload in setAgents safely", () => {
    const nextState = agentReducer(undefined, setAgents(null));
    assert.deepEqual(nextState.agents, []);
  });

  it("updates selectedAgent with setSelectedAgent action", () => {
    const nextState = agentReducer(undefined, setSelectedAgent("agent_abc"));
    assert.equal(nextState.selectedAgent, "agent_abc");
  });

  it("updates loading state with setagentsLoading action", () => {
    let state = agentReducer(undefined, setagentsLoading(true));
    assert.equal(state.agentsLoading, true);

    state = agentReducer(state, setagentsLoading(false));
    assert.equal(state.agentsLoading, false);
  });

  it("deletes target agent by id with setDelete action", () => {
    const stateWithAgents = {
      agents: [
        { _id: "agent_1", name: "Agent One" },
        { _id: "agent_2", name: "Agent Two" },
        { _id: "agent_3", name: "Agent Three" },
      ],
      selectedAgent: "agent_2",
      agentsLoading: false,
    };

    const nextState = agentReducer(stateWithAgents, setDelete("agent_2"));
    assert.equal(nextState.agents.length, 2);
    assert.equal(nextState.agents.find((a) => a._id === "agent_2"), undefined);
    assert.ok(nextState.agents.some((a) => a._id === "agent_1"));
    assert.ok(nextState.agents.some((a) => a._id === "agent_3"));
  });
});
