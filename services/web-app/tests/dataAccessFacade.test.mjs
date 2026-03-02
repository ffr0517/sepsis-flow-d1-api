import test from "node:test";
import assert from "node:assert/strict";
import { createDataAccessFacade } from "../src/data/dataAccessFacade.js";

test("routes to guest repository in guest mode", async () => {
  const calls = [];
  const guestRepository = {
    listPatients: async () => {
      calls.push("guest:listPatients");
      return [];
    }
  };
  const workspaceRepository = {
    listPatients: async () => {
      calls.push("workspace:listPatients");
      return [];
    }
  };

  const facade = createDataAccessFacade({
    getMode: () => "guest",
    guestRepository,
    workspaceRepository
  });

  await facade.listPatients("");
  assert.deepEqual(calls, ["guest:listPatients"]);
});

test("routes to workspace repository in authenticated mode", async () => {
  const calls = [];
  const guestRepository = {
    listPatients: async () => {
      calls.push("guest:listPatients");
      return [];
    }
  };
  const workspaceRepository = {
    listPatients: async () => {
      calls.push("workspace:listPatients");
      return [];
    }
  };

  const facade = createDataAccessFacade({
    getMode: () => "authenticated",
    guestRepository,
    workspaceRepository
  });

  await facade.listPatients("");
  assert.deepEqual(calls, ["workspace:listPatients"]);
});
