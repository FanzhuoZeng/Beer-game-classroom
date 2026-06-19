const test = require("node:test");
const assert = require("node:assert/strict");
const {
  allSubmitted,
  createInitialRoom,
  defaultParams,
  prepareRound,
  processRound,
  roles,
  submitDecision
} = require("../dist/index.js");

function runningRoom(totalRounds = 2) {
  const room = createInitialRoom("TEST1", {
    ...defaultParams,
    totalRounds,
    marketDemand: [4, 8]
  });
  room.status = "running";
  return prepareRound(room);
}

test("the retailer sees first-round market demand before deciding", () => {
  const room = runningRoom();
  assert.equal(room.roles.Retailer.currentIncomingOrder, 4);
});

test("a round advances after all four valid decisions", () => {
  let room = runningRoom();
  for (const role of roles) room = submitDecision(room, role, 4);

  assert.equal(allSubmitted(room), true);
  room = processRound(room);

  assert.equal(room.currentRound, 2);
  assert.equal(room.records.length, 4);
  assert.equal(room.records.every(record => record.orderSubmitted === 4), true);
  assert.equal(room.status, "running");
});

test("the final round completes the game", () => {
  let room = runningRoom(1);
  for (const role of roles) room = submitDecision(room, role, 4);

  room = processRound(room);

  assert.equal(room.status, "completed");
  assert.equal(room.currentRound, 1);
});

test("invalid and duplicate decisions are rejected", () => {
  const room = runningRoom();
  assert.throws(() => submitDecision(room, "Retailer", Number.NaN), /non-negative/);
  assert.throws(() => submitDecision(room, "Retailer", -1), /non-negative/);

  const submitted = submitDecision(room, "Retailer", 3.9);
  assert.equal(submitted.roles.Retailer.currentDecision, 3);
  assert.throws(
    () => submitDecision(submitted, "Retailer", 4),
    /already submitted/
  );
});

test("a decision cannot exceed the role's available cash", () => {
  const room = runningRoom();
  room.roles.Retailer.cash = 10;
  assert.throws(() => submitDecision(room, "Retailer", 4), /Cash is not enough.*3/);
  assert.equal(submitDecision(room, "Retailer", 3.9).roles.Retailer.currentDecision, 3);
});

test("zero order lead time lets the upstream role process the order immediately", () => {
  let room = createInitialRoom("ZERO1", {
    ...defaultParams,
    totalRounds: 2,
    marketDemand: [4, 4],
    orderLeadTime: 0
  });
  room.status = "running";
  room = prepareRound(room);
  room = submitDecision(room, "Retailer", 7);
  room = submitDecision(room, "Wholesaler", 4);
  room = submitDecision(room, "Distributor", 4);
  room = submitDecision(room, "Factory", 4);
  room = processRound(room);

  assert.equal(room.currentRound, 2);
  assert.equal(room.roles.Wholesaler.currentIncomingOrder, 0);
  assert.equal(room.records.find(record =>
    record.round === 1 && record.role === "Wholesaler"
  ).demandReceived, 7);
});

test("a zero-lead order ships immediately when upstream inventory is sufficient", () => {
  let room = createInitialRoom("SHIP1", {
    ...defaultParams,
    totalRounds: 2,
    marketDemand: [4, 4],
    orderLeadTime: 0,
    shipmentLeadTime: 2,
    roleParams: {
      ...defaultParams.roleParams,
      Retailer: {
        ...defaultParams.roleParams.Retailer,
        initialCash: 1000,
        purchaseCost: 3
      },
      Wholesaler: {
        ...defaultParams.roleParams.Wholesaler,
        initialInventory: 200
      }
    }
  });
  room.status = "running";
  room = prepareRound(room);
  room = submitDecision(room, "Retailer", 150);
  room = submitDecision(room, "Wholesaler", 4);
  room = submitDecision(room, "Distributor", 4);
  room = submitDecision(room, "Factory", 4);
  room = processRound(room);

  assert.equal(room.currentRound, 2);
  assert.equal(room.roles.Retailer.shipmentPipeline.reduce((a, b) => a + b, 0), 150);
});

test("decisions cannot be submitted before the game starts", () => {
  const room = createInitialRoom("TEST2", defaultParams);
  assert.throws(() => submitDecision(room, "Retailer", 4), /not running/);
});
