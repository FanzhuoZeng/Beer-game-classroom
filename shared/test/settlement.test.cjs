const test = require("node:test");
const assert = require("node:assert/strict");
const {
  classroomPresets, createInitialRoom, prepareRound, processRound, roles, submitDecision, validateGameParams
} = require("../dist/index.js");

test("five classroom presets preserve the calibrated sequences and role economics", () => {
  assert.deepEqual(classroomPresets.map(p => p.params.totalRounds), [3, 10, 15, 20, 30]);
  assert.deepEqual(classroomPresets.map(p => p.params.roleParams.Retailer.initialCash), [14000, 24000, 26000, 28000, 32000]);
  assert.deepEqual(classroomPresets.map(p => p.params.marketDemand), [
    [60, 220, 20],
    [90, 220, 65, 10, 290, 350, 55, 175, 245, 60],
    [95, 225, 85, 65, 10, 240, 205, 105, 250, 310, 350, 55, 175, 235, 70],
    [95, 225, 80, 235, 110, 65, 10, 285, 205, 90, 245, 120, 250, 315, 350, 55, 190, 240, 100, 170],
    [95, 220, 80, 245, 120, 70, 240, 165, 60, 10, 295, 195, 85, 230, 110, 215, 65, 250, 155, 90, 200, 235, 325, 350, 55, 185, 210, 100, 205, 225]
  ]);
  for (const { params } of classroomPresets) {
    assert.deepEqual(validateGameParams(params), params);
    assert.equal(params.orderLeadTime, 0);
    assert.equal(params.shipmentLeadTime, 0);
    for (const [index, role] of roles.entries()) {
      const p = params.roleParams[role];
      assert.equal(p.sellingPrice - p.purchaseCost, 6);
      assert.equal(p.holdingCost, 1);
      assert.equal(p.backlogCost, 3);
      assert.equal(p.initialInventory, params.totalRounds === 3 ? 180 : 240);
      if (index < roles.length - 1) assert.equal(p.purchaseCost, params.roleParams[roles[index + 1]].sellingPrice);
    }
  }
});

function begin(orderLeadTime = 0, shipmentLeadTime = 0, stock = 180) {
  const params = structuredClone(classroomPresets[0].params);
  Object.assign(params, { orderLeadTime, shipmentLeadTime });
  for (const role of roles) params.roleParams[role].initialInventory = stock;
  let room = createInitialRoom("SETTL", params);
  room.status = "running";
  return prepareRound(room);
}

test("zero-lead goods are recorded, with factory production before dispatch", () => {
  let room = begin();
  for (const role of roles) room = submitDecision(room, role, 100);
  room = processRound(room);
  for (const record of room.records) {
    assert.equal(record.openingInventory, 180);
    assert.equal(record.openingBacklog, 0);
    assert.equal(record.shipmentReceived, 100);
    assert.equal(record.receiptsBeforeShipping, record.role === "Factory" ? 100 : 0);
    assert.equal(record.receiptsAfterShipping, record.role === "Factory" ? 0 : 100);
    assert.equal(record.inventory, record.role === "Retailer" ? 220 : 180);
    assert.equal(record.cash, 14000 + record.profitThisRound);
  }
});

test("zero-lead receipts do not incorrectly satisfy demand before their arrival", () => {
  let room = begin(0, 0, 0);
  for (const role of roles) room = submitDecision(room, role, 100);
  room = processRound(room);
  const factory = room.records.find(r => r.role === "Factory");
  const distributor = room.records.find(r => r.role === "Distributor");
  const retailer = room.records.find(r => r.role === "Retailer");
  assert.equal(factory.shipped, 100);
  assert.equal(distributor.shipped, 0);
  assert.equal(distributor.shipmentReceived, 100);
  assert.equal(distributor.inventory, 100);
  assert.equal(distributor.backlog, 100);
  assert.equal(retailer.shipmentReceived, 0);
  assert.equal(retailer.backlog, 60);
});

for (const orderLeadTime of [0, 1, 2]) {
  for (const shipmentLeadTime of [0, 1, 2]) {
    test(`inventory, backlog and cash reconcile for lead times ${orderLeadTime}/${shipmentLeadTime}`, () => {
      let room = begin(orderLeadTime, shipmentLeadTime, 30);
      for (let round = 1; round <= 3; round++) {
        for (const [i, role] of roles.entries()) room = submitDecision(room, role, round * 20 + i * 15);
        room = processRound(room);
        for (const record of room.records.filter(r => r.round === round)) {
          const available = record.openingInventory + record.receiptsBeforeShipping;
          assert.ok(available >= record.shipped);
          assert.equal(available - record.shipped + record.receiptsAfterShipping, record.inventory);
          assert.equal(record.openingBacklog + record.demandReceived - record.shipped, record.backlog);
          assert.equal(record.receiptsBeforeShipping + record.receiptsAfterShipping, record.shipmentReceived);
          assert.equal(record.openingCash + record.profitThisRound, record.cash);
        }
      }
      assert.equal(room.status, "completed");
    });
  }
}
