import {
  allSubmitted,
  calculateBullwhip,
  createInitialRoom,
  defaultParams,
  exportRoomCsv,
  GameParams,
  prepareRound,
  processRound,
  Role,
  roles,
  RoomState,
  submitDecision,
  validateGameParams
} from "shared";

const rooms = new Map<string, RoomState>();

function code(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function createRoom(params?: unknown): RoomState {
  let roomCode = code();
  while (rooms.has(roomCode)) roomCode = code();

  const room = createInitialRoom(
    roomCode,
    validateGameParams(params ?? structuredClone(defaultParams))
  );
  rooms.set(roomCode, room);
  return room;
}

export function getRooms(): RoomState[] {
  return Array.from(rooms.values()).sort((a,b) => b.createdAt - a.createdAt);
}

export function getRoom(roomCode: string): RoomState | undefined {
  return rooms.get(roomCode.toUpperCase());
}

export function deleteRoom(roomCode: string): RoomState {
  roomCode = roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  rooms.delete(roomCode);
  return room;
}

export function joinRoom(roomCode: string, role: Role, playerName: string): RoomState {
  roomCode = roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (!roles.includes(role)) throw new Error("Invalid role");
  if (!playerName.trim()) throw new Error("Player name is required");

  const normalizedName = playerName.trim().slice(0, 50);
  const existingName = room.roles[role].playerName;
  if (existingName) {
    if (existingName.toLocaleLowerCase() !== normalizedName.toLocaleLowerCase()) {
      throw new Error("Role already taken");
    }
  } else {
    if (room.status !== "waiting") throw new Error("Cannot claim a new role after the game has started");
    room.roles[role].playerName = normalizedName;
  }
  room.roles[role].connected = true;
  rooms.set(roomCode, room);
  return room;
}

export function setPlayerConnection(roomCode: string, role: Role, connected: boolean): RoomState | undefined {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room || !roles.includes(role) || !room.roles[role].playerName) return room;
  room.roles[role].connected = connected;
  rooms.set(room.code, room);
  return room;
}

export function startRoom(roomCode: string): RoomState {
  roomCode = roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (room.status !== "waiting") throw new Error("Room cannot be started");
  if (roles.some(role => !room.roles[role].playerName)) {
    throw new Error("All four roles must be joined before starting");
  }
  room.status = "running";
  const started = prepareRound(room);
  rooms.set(roomCode, started);
  return started;
}

export function endRoom(roomCode: string): RoomState {
  roomCode = roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (room.status !== "running") throw new Error("Only a running room can be ended");
  room.status = "completed";
  rooms.set(roomCode, room);
  return room;
}

export function makeDecision(roomCode: string, role: Role, quantity: number): RoomState {
  roomCode = roomCode.toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) throw new Error("Room not found");
  if (!roles.includes(role)) throw new Error("Invalid role");
  if (!room.roles[role].playerName) throw new Error("Role has not joined");

  let next = submitDecision(room, role, quantity);
  if (allSubmitted(next)) {
    next = processRound(next);
  }

  rooms.set(roomCode, next);
  return next;
}

export function publicRoom(room: RoomState) {
  return {
    code: room.code,
    status: room.status,
    currentRound: room.currentRound,
    totalRounds: room.params.totalRounds,
    roles: roles.map(role => ({
      role,
      playerName: room.roles[role].playerName,
      joined: Boolean(room.roles[role].playerName),
      connected: room.roles[role].connected,
      submittedThisRound: room.roles[role].submittedThisRound
    }))
  };
}

export function playerView(room: RoomState, role: Role) {
  const state = room.roles[role];
  const costs = room.params.roleParams[role];
  return {
    code: room.code,
    status: room.status,
    currentRound: room.currentRound,
    totalRounds: room.params.totalRounds,
    role,
    playerName: state.playerName,
    inventory: state.inventory,
    backlog: state.backlog,
    cash: state.cash,
    currentIncomingOrder: state.currentIncomingOrder,
    currentIncomingShipment: state.currentIncomingShipment,
    inTransitShipment: state.shipmentPipeline.reduce((sum, quantity) => sum + quantity, 0),
    costs,
    maxAffordableQuantity: costs.purchaseCost === 0
      ? null
      : Math.floor(Math.max(0, state.cash) / costs.purchaseCost),
    submittedThisRound: state.submittedThisRound,
    records: room.records.filter(r => r.role === role)
  };
}

export function review(roomCode: string) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) throw new Error("Room not found");
  return {
    room,
    bullwhip: calculateBullwhip(room)
  };
}

export function csv(roomCode: string): string {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) throw new Error("Room not found");
  return exportRoomCsv(room);
}
