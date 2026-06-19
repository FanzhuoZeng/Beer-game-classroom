const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRoom,
  deleteRoom,
  endRoom,
  getRoom,
  joinRoom,
  makeDecision,
  playerView,
  publicRoom,
  setPlayerConnection,
  startRoom
} = require("../dist/gameState.js");

test("a room requires all roles before it can start", () => {
  const room = createRoom();
  assert.throws(() => startRoom(room.code), /All four roles/);

  joinRoom(room.code.toLowerCase(), "Retailer", "R");
  joinRoom(room.code, "Wholesaler", "W");
  joinRoom(room.code, "Distributor", "D");
  joinRoom(room.code, "Factory", "F");

  const started = startRoom(room.code);
  assert.equal(started.status, "running");
  assert.equal(playerView(started, "Retailer").currentIncomingOrder, 4);
  assert.throws(() => startRoom(room.code), /cannot be started/);
});

test("room decisions enforce membership, quantity, and one submission per round", () => {
  const room = createRoom();
  for (const role of ["Retailer", "Wholesaler", "Distributor", "Factory"]) {
    joinRoom(room.code, role, role);
  }
  startRoom(room.code);

  makeDecision(room.code, "Retailer", 4);
  assert.throws(() => makeDecision(room.code, "Retailer", 5), /already submitted/);
  assert.throws(() => makeDecision(room.code, "Wholesaler", -1), /non-negative/);
});

test("only running rooms can be ended", () => {
  const room = createRoom();
  assert.throws(() => endRoom(room.code), /Only a running room/);
});

test("invalid room parameters are rejected", () => {
  assert.throws(
    () => createRoom({ totalRounds: 0 }),
    /Total rounds/
  );
});

test("a player view includes only that role's economics", () => {
  const room = createRoom();
  joinRoom(room.code, "Retailer", "R");
  const view = playerView(room, "Retailer");

  assert.deepEqual(view.costs, room.params.roleParams.Retailer);
  assert.equal(view.costs.purchaseCost, 3);
  assert.equal(view.costs.sellingPrice, 6);
  assert.equal(view.maxAffordableQuantity, 333);
});

test("a disconnected player can reclaim the same role with the same name", () => {
  const room = createRoom();
  joinRoom(room.code, "Retailer", "Alex");
  joinRoom(room.code, "Wholesaler", "W");
  joinRoom(room.code, "Distributor", "D");
  joinRoom(room.code, "Factory", "F");
  startRoom(room.code);

  setPlayerConnection(room.code, "Retailer", false);
  assert.equal(publicRoom(getRoom(room.code)).roles.find(role => role.role === "Retailer").connected, false);
  assert.equal(joinRoom(room.code, "Retailer", "alex").roles.Retailer.connected, true);
  assert.throws(() => joinRoom(room.code, "Retailer", "Someone else"), /Role already taken/);
});

test("rooms can be deleted regardless of status", () => {
  const activeRoom = createRoom();
  activeRoom.status = "running";
  assert.equal(deleteRoom(activeRoom.code).status, "running");

  const completedRoom = createRoom();
  completedRoom.status = "completed";
  assert.equal(deleteRoom(completedRoom.code).status, "completed");
  assert.throws(() => deleteRoom(completedRoom.code), /Room not found/);
});
