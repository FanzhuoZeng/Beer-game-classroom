export type Role = "Retailer" | "Wholesaler" | "Distributor" | "Factory";
export type RoomStatus = "waiting" | "running" | "completed";

export const roles: Role[] = ["Retailer", "Wholesaler", "Distributor", "Factory"];

export interface RoleParams {
  initialCash: number;
  initialInventory: number;
  purchaseCost: number;
  holdingCost: number;
  backlogCost: number;
  sellingPrice: number;
}

export interface GameParams {
  totalRounds: number;
  marketDemand: number[];
  orderLeadTime: number;
  shipmentLeadTime: number;
  roleParams: Record<Role, RoleParams>;
}

export interface RoleState {
  role: Role;
  playerName?: string;
  connected: boolean;
  inventory: number;
  backlog: number;
  cash: number;
  currentIncomingOrder: number;
  currentIncomingShipment: number;
  submittedThisRound: boolean;
  currentDecision?: number;
  orderPipeline: number[];
  shipmentPipeline: number[];
}

export interface RoundRecord {
  roomCode: string;
  round: number;
  role: Role;
  demandReceived: number;
  orderSubmitted: number;
  shipmentReceived: number;
  shipped: number;
  inventory: number;
  backlog: number;
  cash: number;
  revenue: number;
  procurementCost: number;
  holdingCost: number;
  backlogCost: number;
  profitThisRound: number;
}

export interface RoomState {
  code: string;
  status: RoomStatus;
  currentRound: number;
  params: GameParams;
  roles: Record<Role, RoleState>;
  records: RoundRecord[];
  createdAt: number;
}

export interface BullwhipMetric {
  role: Role;
  meanOrder: number;
  stdOrder: number;
  coefficientOfVariation: number;
  amplificationRatio: number;
}

export const defaultParams: GameParams = {
  totalRounds: 12,
  marketDemand: [4,4,4,8,8,8,8,8,8,8,8,8],
  orderLeadTime: 1,
  shipmentLeadTime: 2,
  roleParams: {
    Retailer: {
      initialCash: 1000,
      initialInventory: 12,
      purchaseCost: 3,
      holdingCost: 1,
      backlogCost: 2,
      sellingPrice: 6
    },
    Wholesaler: {
      initialCash: 1000,
      initialInventory: 12,
      purchaseCost: 2,
      holdingCost: 1,
      backlogCost: 2,
      sellingPrice: 3
    },
    Distributor: {
      initialCash: 1000,
      initialInventory: 12,
      purchaseCost: 1,
      holdingCost: 1,
      backlogCost: 2,
      sellingPrice: 2
    },
    Factory: {
      initialCash: 1000,
      initialInventory: 12,
      purchaseCost: 1,
      holdingCost: 1,
      backlogCost: 2,
      sellingPrice: 1.5
    }
  }
};

export function validateGameParams(value: unknown): GameParams {
  if (!value || typeof value !== "object") throw new Error("Invalid game parameters");
  const input = value as Partial<GameParams>;

  const totalRounds = integerInRange(input.totalRounds, "Total rounds", 1, 100);
  const orderLeadTime = integerInRange(input.orderLeadTime, "Order lead time", 0, 20);
  const shipmentLeadTime = integerInRange(input.shipmentLeadTime, "Shipment lead time", 0, 20);

  if (!Array.isArray(input.marketDemand) || input.marketDemand.length === 0) {
    throw new Error("Market demand must contain at least one value");
  }
  const marketDemand = input.marketDemand.map((value, index) =>
    nonNegativeNumber(value, `Market demand for round ${index + 1}`)
  );

  if (!input.roleParams || typeof input.roleParams !== "object") {
    throw new Error("Role parameters are required");
  }

  const roleParams = {} as Record<Role, RoleParams>;
  for (const role of roles) {
    const params = input.roleParams[role];
    if (!params || typeof params !== "object") {
      throw new Error(`Parameters for ${role} are required`);
    }
    roleParams[role] = {
      initialCash: nonNegativeNumber(params.initialCash, `${role} initial cash`),
      initialInventory: nonNegativeNumber(params.initialInventory, `${role} initial inventory`),
      purchaseCost: nonNegativeNumber(params.purchaseCost, `${role} purchase cost`),
      holdingCost: nonNegativeNumber(params.holdingCost, `${role} holding cost`),
      backlogCost: nonNegativeNumber(params.backlogCost, `${role} backlog cost`),
      sellingPrice: nonNegativeNumber(params.sellingPrice, `${role} selling price`)
    };
  }

  return {
    totalRounds,
    marketDemand,
    orderLeadTime,
    shipmentLeadTime,
    roleParams
  };
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function integerInRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function createInitialRoom(code: string, params: GameParams): RoomState {
  const roleStates = {} as Record<Role, RoleState>;

  for (const role of roles) {
    const p = params.roleParams[role];
    roleStates[role] = {
      role,
      connected: false,
      inventory: p.initialInventory,
      backlog: 0,
      cash: p.initialCash,
      currentIncomingOrder: 0,
      currentIncomingShipment: 0,
      submittedThisRound: false,
      orderPipeline: Array(params.orderLeadTime).fill(0),
      shipmentPipeline: Array(params.shipmentLeadTime).fill(0)
    };
  }

  return {
    code,
    status: "waiting",
    currentRound: 1,
    params,
    roles: roleStates,
    records: [],
    createdAt: Date.now()
  };
}

function upstream(role: Role): Role | null {
  if (role === "Retailer") return "Wholesaler";
  if (role === "Wholesaler") return "Distributor";
  if (role === "Distributor") return "Factory";
  return null;
}

function downstream(role: Role): Role | null {
  if (role === "Factory") return "Distributor";
  if (role === "Distributor") return "Wholesaler";
  if (role === "Wholesaler") return "Retailer";
  return null;
}

export function submitDecision(room: RoomState, role: Role, quantity: number): RoomState {
  if (room.status !== "running") throw new Error("Game is not running");
  if (!roles.includes(role)) throw new Error("Invalid role");
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative number");
  }
  if (room.roles[role].submittedThisRound) {
    throw new Error("Decision already submitted for this round");
  }

  const purchaseCost = room.params.roleParams[role].purchaseCost;
  const maxAffordable = purchaseCost === 0
    ? Number.POSITIVE_INFINITY
    : Math.floor(Math.max(0, room.roles[role].cash) / purchaseCost);
  const normalizedQuantity = Math.max(0, Math.floor(quantity));
  if (normalizedQuantity > maxAffordable) {
    throw new Error(`Cash is not enough for this order. Maximum affordable quantity is ${maxAffordable}`);
  }

  const next = structuredClone(room) as RoomState;
  next.roles[role].currentDecision = normalizedQuantity;
  next.roles[role].submittedThisRound = true;
  return next;
}

export function allSubmitted(room: RoomState): boolean {
  return roles.every(role => room.roles[role].submittedThisRound);
}

export function prepareRound(room: RoomState): RoomState {
  if (room.status !== "running") throw new Error("Game is not running");

  const next = structuredClone(room) as RoomState;
  const roundIndex = next.currentRound - 1;
  const marketDemand = next.params.marketDemand[roundIndex]
    ?? next.params.marketDemand[next.params.marketDemand.length - 1]
    ?? 0;

  for (const role of roles) {
    const state = next.roles[role];

    if (state.shipmentPipeline.length > 0) {
      const shipmentReceived = state.shipmentPipeline.shift() ?? 0;
      state.currentIncomingShipment = shipmentReceived;
      state.inventory += shipmentReceived;
      state.shipmentPipeline.push(0);
    }

    if (role === "Retailer") {
      state.currentIncomingOrder = marketDemand;
    } else if (state.orderPipeline.length > 0) {
      state.currentIncomingOrder = state.orderPipeline.shift() ?? 0;
      state.orderPipeline.push(0);
    }
  }

  return next;
}

export function processRound(room: RoomState): RoomState {
  if (room.status !== "running") throw new Error("Game is not running");
  if (!allSubmitted(room)) return room;

  const next = structuredClone(room) as RoomState;
  // 1. Place this round's decisions upstream.
  for (const role of roles) {
    const orderQty = next.roles[role].currentDecision ?? 0;
    const up = upstream(role);

    if (up) {
      const target = next.roles[up];
      if (target.orderPipeline.length === 0) {
        target.currentIncomingOrder += orderQty;
      } else {
        target.orderPipeline[target.orderPipeline.length - 1] += orderQty;
      }
    } else {
      const factory = next.roles.Factory;
      if (factory.shipmentPipeline.length === 0) {
        factory.inventory += orderQty;
      } else {
        factory.shipmentPipeline[factory.shipmentPipeline.length - 1] += orderQty;
      }
    }
  }

  const demandReceived = Object.fromEntries(
    roles.map(role => [role, next.roles[role].currentIncomingOrder])
  ) as Record<Role, number>;
  const shipmentReceived = Object.fromEntries(
    roles.map(role => [role, next.roles[role].currentIncomingShipment])
  ) as Record<Role, number>;

  // 2. Fulfil all orders available this round, including zero-lead-time orders.
  const shippedByRole: Record<Role, number> = {
    Retailer: 0,
    Wholesaler: 0,
    Distributor: 0,
    Factory: 0
  };

  for (const role of roles) {
    const state = next.roles[role];
    const totalDemand = state.currentIncomingOrder + state.backlog;
    const shipped = Math.min(state.inventory, totalDemand);
    state.inventory -= shipped;
    state.backlog = totalDemand - shipped;
    shippedByRole[role] = shipped;
  }

  // 3. Clear received values before scheduling next round's shipments.
  for (const role of roles) {
    next.roles[role].currentIncomingOrder = 0;
    next.roles[role].currentIncomingShipment = 0;
  }

  // 4. Send fulfilled shipments downstream.
  for (const role of roles) {
    const down = downstream(role);
    if (!down) continue;

    const target = next.roles[down];
    const shipped = shippedByRole[role];
    if (target.shipmentPipeline.length === 0) {
      target.inventory += shipped;
    } else {
      target.shipmentPipeline[target.shipmentPipeline.length - 1] += shipped;
    }
  }

  // 5. Update cash and record data.
  for (const role of roles) {
    const state = next.roles[role];
    const params = next.params.roleParams[role];
    const orderQty = state.currentDecision ?? 0;
    const shipped = shippedByRole[role];

    const revenue = shipped * params.sellingPrice;
    const procurementCost = orderQty * params.purchaseCost;
    const holdingCost = state.inventory * params.holdingCost;
    const backlogCost = state.backlog * params.backlogCost;
    const profitThisRound = revenue - procurementCost - holdingCost - backlogCost;

    state.cash += profitThisRound;

    next.records.push({
      roomCode: next.code,
      round: next.currentRound,
      role,
      demandReceived: demandReceived[role],
      orderSubmitted: orderQty,
      shipmentReceived: shipmentReceived[role],
      shipped,
      inventory: state.inventory,
      backlog: state.backlog,
      cash: state.cash,
      revenue,
      procurementCost,
      holdingCost,
      backlogCost,
      profitThisRound
    });

    state.submittedThisRound = false;
    state.currentDecision = undefined;
  }

  if (next.currentRound >= next.params.totalRounds) {
    next.status = "completed";
  } else {
    next.currentRound += 1;
    return prepareRound(next);
  }

  return next;
}

export function calculateBullwhip(room: RoomState): BullwhipMetric[] {
  const demand = room.params.marketDemand.slice(0, room.params.totalRounds);
  const demandMean = mean(demand);
  const demandStd = std(demand);
  const demandCv = demandMean === 0 ? 0 : demandStd / demandMean;

  return roles.map(role => {
    const orders = room.records.filter(r => r.role === role).map(r => r.orderSubmitted);
    const m = mean(orders);
    const s = std(orders);
    const cv = m === 0 ? 0 : s / m;
    return {
      role,
      meanOrder: round2(m),
      stdOrder: round2(s),
      coefficientOfVariation: round2(cv),
      amplificationRatio: round2(demandCv === 0 ? 0 : cv / demandCv)
    };
  });
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a,b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a,b) => a + Math.pow(b - m, 2), 0) / xs.length;
  return Math.sqrt(variance);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function exportRoomCsv(room: RoomState): string {
  const header = [
    "roomCode","round","role","demandReceived","orderSubmitted","shipmentReceived",
    "shipped","inventory","backlog","cash","revenue","procurementCost",
    "holdingCost","backlogCost","profitThisRound"
  ];

  const rows = room.records.map(r => [
    r.roomCode, r.round, r.role, r.demandReceived, r.orderSubmitted, r.shipmentReceived,
    r.shipped, r.inventory, r.backlog, r.cash, r.revenue, r.procurementCost,
    r.holdingCost, r.backlogCost, r.profitThisRound
  ]);

  return [header, ...rows].map(row => row.join(",")).join("\n");
}
