import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { Role, roles, RoomState } from "shared";
import {
  createRoom,
  csv,
  deleteRoom,
  endRoom,
  getRoom,
  getRooms,
  joinRoom,
  makeDecision,
  playerView,
  publicRoom,
  review,
  setPlayerConnection,
  startRoom
} from "./gameState";

const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || "1014";
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

function emitRooms() {
  for (const client of io.sockets.sockets.values()) {
    if (client.data.isTeacher) {
      client.emit("rooms:update", getRooms().map(publicRoom));
    }
  }
}

function emitPlayerUpdates(room: RoomState) {
  const socketIds = io.sockets.adapter.rooms.get(room.code);
  if (!socketIds) return;

  for (const socketId of socketIds) {
    const client = io.sockets.sockets.get(socketId);
    const role = client?.data.role as Role | undefined;
    if (client && role && roles.includes(role)) {
      client.emit("player:update", playerView(room, role));
    }
  }
}

function payloadObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Invalid request");
  return value as Record<string, unknown>;
}

function roomCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z0-9]{5}$/i.test(value.trim())) {
    throw new Error("Invalid room code");
  }
  return value.trim().toUpperCase();
}

function roleValue(value: unknown): Role {
  if (typeof value !== "string" || !roles.includes(value as Role)) {
    throw new Error("Invalid role");
  }
  return value as Role;
}

function teacherPassword(value: unknown): boolean {
  return typeof value === "string" && value === TEACHER_PASSWORD;
}

function requireTeacher(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!teacherPassword(req.header("x-teacher-password"))) {
    res.status(401).json({ error: "Invalid teacher password" });
    return;
  }
  next();
}

app.post("/api/teacher/login", (req, res) => {
  if (!teacherPassword(req.body?.password)) {
    res.status(401).json({ error: "Invalid teacher password" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/rooms", requireTeacher, (_req, res) => {
  res.json(getRooms().map(publicRoom));
});

app.post("/api/rooms", requireTeacher, (req, res) => {
  try {
    const room = createRoom(req.body?.params);
    emitRooms();
    res.json(publicRoom(room));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/rooms/:code/start", requireTeacher, (req, res) => {
  try {
    const room = startRoom(roomCode(req.params.code));
    emitRooms();
    io.to(room.code).emit("room:update");
    emitPlayerUpdates(room);
    res.json(publicRoom(room));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/rooms/:code/end", requireTeacher, (req, res) => {
  try {
    const room = endRoom(roomCode(req.params.code));
    emitRooms();
    io.to(room.code).emit("room:update");
    emitPlayerUpdates(room);
    res.json(publicRoom(room));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/rooms/:code", requireTeacher, (req, res) => {
  try {
    const room = deleteRoom(roomCode(req.params.code));
    io.to(room.code).emit("room:deleted");
    emitRooms();
    res.json({ code: room.code, deleted: true });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.get("/api/rooms/:code/review", requireTeacher, (req, res) => {
  try {
    res.json(review(req.params.code));
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.get("/api/rooms/:code/csv", requireTeacher, (req, res) => {
  try {
    res.header("Content-Type", "text/csv");
    res.attachment(`beer-game-${req.params.code}.csv`);
    res.send(csv(req.params.code));
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

io.on("connection", socket => {
  socket.on("teacher:authenticate", (payload: unknown) => {
    try {
      const password = payloadObject(payload).password;
      if (!teacherPassword(password)) throw new Error("Invalid teacher password");
      socket.data.isTeacher = true;
      socket.emit("rooms:update", getRooms().map(publicRoom));
    } catch (e: any) {
      socket.emit("teacher:error", e.message);
    }
  });

  socket.on("teacher:logout", () => {
    socket.data.isTeacher = false;
  });

  socket.on("room:join", (payload: unknown) => {
    try {
      const data = payloadObject(payload);
      const code = roomCode(data.roomCode);
      const role = roleValue(data.role);
      if (typeof data.playerName !== "string") throw new Error("Player name is required");
      const room = joinRoom(code, role, data.playerName);
      socket.data.roomCode = code;
      socket.data.role = role;
      socket.join(code);
      emitRooms();
      socket.emit("player:update", playerView(room, role));
      io.to(code).emit("room:update");
    } catch (e: any) {
      socket.emit("error:message", e.message);
    }
  });

  socket.on("room:watch", (payload: unknown) => {
    try {
      const code = roomCode(payloadObject(payload).roomCode);
      const room = getRoom(code);
      if (room) {
        socket.join(code);
        socket.emit("room:update");
      }
    } catch (e: any) {
      socket.emit("error:message", e.message);
    }
  });

  socket.on("decision:submit", (payload: unknown) => {
    try {
      const data = payloadObject(payload);
      const code = roomCode(data.roomCode);
      const role = roleValue(data.role);
      if (socket.data.roomCode !== code || socket.data.role !== role) {
        throw new Error("Join this role before submitting a decision");
      }
      const room = makeDecision(code, role, Number(data.quantity));
      emitRooms();
      io.to(code).emit("room:update");
      emitPlayerUpdates(room);
    } catch (e: any) {
      socket.emit("error:message", e.message);
    }
  });

  socket.on("player:refresh", (payload: unknown) => {
    try {
      const data = payloadObject(payload);
      const code = roomCode(data.roomCode);
      const role = roleValue(data.role);
      if (socket.data.roomCode !== code || socket.data.role !== role) {
        throw new Error("Join this role before refreshing");
      }
      const room = getRoom(code);
      if (room) socket.emit("player:update", playerView(room, role));
    } catch (e: any) {
      socket.emit("error:message", e.message);
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode as string | undefined;
    const role = socket.data.role as Role | undefined;
    if (!code || !role) return;

    const stillConnected = Array.from(io.sockets.sockets.values()).some(client =>
      client.id !== socket.id
      && client.data.roomCode === code
      && client.data.role === role
    );
    if (!stillConnected) {
      setPlayerConnection(code, role, false);
      emitRooms();
    }
  });
});

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/socket.io/")) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, "index.html"));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Beer Game classroom site running on http://localhost:${PORT}`);
});
