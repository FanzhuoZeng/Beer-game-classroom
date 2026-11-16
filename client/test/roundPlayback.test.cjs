const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/roundPlayback.ts");
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename);
const { playbackReducer, initialPlayback, settlementSteps, settlementTiming } = compiled.exports;
const { classroomPresets, createInitialRoom, prepareRound, processRound, roles, submitDecision } = require("../../shared/dist/index.js");
const { playerView } = require("../../server/dist/gameState.js");

function views() {
  let room = createInitialRoom("PLAY1", structuredClone(classroomPresets[0].params));
  room.status = "running";
  room = prepareRound(room);
  const result = [playerView(room, "Retailer")];
  for (let round = 1; round <= 3; round++) {
    for (const role of roles) room = submitDecision(room, role, 100);
    room = processRound(room);
    result.push(playerView(room, "Retailer"));
  }
  return result;
}
const receive = (state, view) => playbackReducer(state, { type: "receive", view });
const finish = state => playbackReducer(state, { type: "finish", playbackId: state.playbackId });

test("new round freezes all dashboard values until playback finishes", () => {
  const [before, after] = views();
  let state = receive(initialPlayback, before);
  state = receive(state, after);
  assert.equal(state.visible, before);
  assert.equal(state.latest, after);
  assert.equal(state.active.round, 1);
  state = finish(state);
  assert.equal(state.active, null);
  assert.equal(state.visible, after);
});

test("duplicate refresh events neither restart nor duplicate an animation", () => {
  const [before, after] = views();
  let state = receive(receive(initialPlayback, before), after);
  const id = state.playbackId;
  for (let i = 0; i < 8; i++) state = receive(state, structuredClone(after));
  assert.equal(state.playbackId, id);
  assert.equal(state.queue.length, 0);
  state = finish(state);
  state = receive(state, after);
  assert.equal(state.active, null);
});

test("replay shows the last completed round without advancing the game", () => {
  const [, after] = views();
  let state = receive(initialPlayback, after);
  assert.equal(state.active, null);
  state = playbackReducer(state, { type: "replay" });
  assert.equal(state.active.round, 1);
  const duplicate = playbackReducer(state, { type: "replay" });
  assert.equal(duplicate, state);
  state = finish(state);
  assert.equal(state.visible, after);
  assert.equal(state.seenRound, 1);
});

test("rounds arriving during playback queue once, including the final settlement", () => {
  const [before, one, two, final] = views();
  let state = receive(receive(initialPlayback, before), one);
  state = receive(state, two);
  state = receive(state, final);
  state = receive(state, final);
  assert.deepEqual(state.queue.map(r => r.round), [2, 3]);
  assert.equal(state.visible.status, "running");
  state = finish(state);
  assert.equal(state.active.round, 2);
  state = finish(state);
  assert.equal(state.active.round, 3);
  state = finish(state);
  assert.equal(state.visible.status, "completed");
  assert.equal(state.visible.records.length, 3);
});

test("a new round received during replay is not lost", () => {
  const [, one, two] = views();
  let state = playbackReducer(receive(initialPlayback, one), { type: "replay" });
  state = receive(state, two);
  state = finish(state);
  assert.equal(state.active.round, 2);
  state = finish(state);
  assert.equal(state.visible, two);
});

test("stale payloads and stale completion callbacks cannot undo newer rounds", () => {
  const [before, one, two] = views();
  let state = receive(receive(initialPlayback, before), one);
  const firstId = state.playbackId;
  state = receive(state, two);
  state = finish(state);
  assert.equal(receive(state, one), state);
  assert.equal(playbackReducer(state, { type: "finish", playbackId: firstId }), state);
});

test("rejoining or changing rooms does not autoplay old history", () => {
  const [, after] = views();
  let state = receive(initialPlayback, after);
  assert.equal(state.active, null);
  state = playbackReducer(state, { type: "replay" });
  state = receive(state, { ...after, code: "OTHER" });
  assert.equal(state.active, null);
  assert.equal(state.queue.length, 0);
  state = playbackReducer(state, { type: "reset" });
  assert.equal(state.visible, null);
});

test("normal animation shows opening stock, outbound truck, inbound truck, then closing stock", () => {
  const record = views()[1].records[0];
  const steps = settlementSteps(record);
  assert.deepEqual(steps.map(s => s.kind), ["opening", "ship", "receive-after", "closing"]);
  assert.deepEqual(steps.map(s => s.after), [180, 120, 220, 220]);
});

test("factory and positive-lead arrivals appear before shipping with no negative animation stock", () => {
  const record = { openingInventory: 0, receiptsBeforeShipping: 100,
    receiptsAfterShipping: 0, shipped: 100, inventory: 0 };
  const steps = settlementSteps(record);
  assert.deepEqual(steps.map(s => s.kind), ["opening", "receive-before", "ship", "receive-after", "closing"]);
  for (const step of steps) { assert.ok(step.before >= 0); assert.ok(step.after >= 0); }
});

test("slower transport timing updates stock at pickup and arrival, not halfway along a route", () => {
  const steps = settlementSteps(views()[1].records[0]);
  const timings = steps.map(settlementTiming);
  assert.equal(timings.reduce((sum, timing) => sum + timing.durationMs, 0), 14800);
  assert.deepEqual(timings[1], { durationMs: 4800, transferAtMs: 864 });
  assert.deepEqual(timings[2], { durationMs: 4800, transferAtMs: 3648 });
  for (const timing of timings) assert.ok(timing.transferAtMs < timing.durationMs);
});

test("zero-quantity steps use a short hold without a phantom delivery", () => {
  assert.deepEqual(settlementTiming({ kind: "ship", before: 10, after: 10, quantity: 0 }),
    { durationMs: 2600, transferAtMs: 0 });
  assert.deepEqual(settlementTiming({ kind: "receive-after", before: 10, after: 10, quantity: 0 }),
    { durationMs: 2600, transferAtMs: 0 });
});
