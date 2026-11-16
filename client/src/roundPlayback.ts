import type { PlayerView, RoundRecord } from "shared";

export interface PlaybackState {
  visible: PlayerView | null;
  latest: PlayerView | null;
  active: RoundRecord | null;
  queue: RoundRecord[];
  seenRound: number;
  playbackId: number;
}

export const initialPlayback: PlaybackState = {
  visible: null, latest: null, active: null, queue: [], seenRound: 0, playbackId: 0
};

type PlaybackAction =
  | { type: "receive"; view: PlayerView }
  | { type: "finish"; playbackId: number }
  | { type: "replay" }
  | { type: "reset" };

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  if (action.type === "reset") return { ...initialPlayback, playbackId: state.playbackId + 1 };
  if (action.type === "receive") {
    const view = action.view;
    const lastRound = view.records[view.records.length - 1]?.round ?? 0;
    if (!state.latest || state.latest.code !== view.code || state.latest.role !== view.role) {
      // Rejoining shows the current state; historical rounds are available through Replay.
      return { ...initialPlayback, visible: view, latest: view, seenRound: lastRound,
        playbackId: state.playbackId + 1 };
    }
    if (lastRound < state.seenRound || view.currentRound < state.latest.currentRound) return state;
    const unseen = view.records.filter(record => record.round > state.seenRound);
    const queue = [...state.queue, ...unseen];
    if (!state.active && queue.length) {
      return { ...state, latest: view, active: queue[0], queue: queue.slice(1),
        seenRound: lastRound, playbackId: state.playbackId + 1 };
    }
    return { ...state, latest: view, visible: state.active ? state.visible : view,
      queue, seenRound: Math.max(state.seenRound, lastRound) };
  }
  if (action.type === "replay") {
    const record = state.visible?.records[state.visible.records.length - 1];
    if (!record || state.active) return state;
    return { ...state, active: record, playbackId: state.playbackId + 1 };
  }
  if (!state.active || action.playbackId !== state.playbackId) return state;
  if (state.queue.length) {
    return { ...state, active: state.queue[0], queue: state.queue.slice(1), playbackId: state.playbackId + 1 };
  }
  return { ...state, active: null, visible: state.latest };
}

export interface SettlementStep {
  kind: "opening" | "receive-before" | "ship" | "receive-after" | "closing";
  before: number;
  after: number;
  quantity: number;
}

export function settlementTiming(step: SettlementStep): { durationMs: number; transferAtMs: number } {
  const travelling = step.quantity > 0 && (step.kind === "ship" || step.kind.startsWith("receive-"));
  const durationMs = travelling ? 4800 : 2600;
  // Match the truck's pickup (18%) and arrival (76%) stops in the route animation.
  const transferAtMs = travelling ? durationMs * (step.kind === "ship" ? 0.18 : 0.76) : 0;
  return { durationMs, transferAtMs };
}

export function settlementSteps(record: RoundRecord): SettlementStep[] {
  let stock = record.openingInventory;
  const steps: SettlementStep[] = [{ kind: "opening", before: stock, after: stock, quantity: 0 }];
  if (record.receiptsBeforeShipping > 0) {
    steps.push({ kind: "receive-before", before: stock, after: stock + record.receiptsBeforeShipping,
      quantity: record.receiptsBeforeShipping });
    stock += record.receiptsBeforeShipping;
  }
  steps.push({ kind: "ship", before: stock, after: stock - record.shipped, quantity: record.shipped });
  stock -= record.shipped;
  steps.push({ kind: "receive-after", before: stock, after: stock + record.receiptsAfterShipping,
    quantity: record.receiptsAfterShipping });
  stock += record.receiptsAfterShipping;
  steps.push({ kind: "closing", before: stock, after: record.inventory, quantity: 0 });
  return steps;
}
