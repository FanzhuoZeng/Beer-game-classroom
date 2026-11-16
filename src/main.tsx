import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { classroomPresets, defaultParams, roles, validateGameParams } from "shared";
import type { GameParams, PlayerView, Role, RoleParams, RoundRecord, RoomStatus } from "shared";
import { initialPlayback, playbackReducer } from "./roundPlayback";
import { SettlementAnimation, SettlementPanel } from "./SettlementAnimation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import designerAvatar from "./assets/fanzhuo-avatar.png";
import "./styles/app.css";

const API = import.meta.env.VITE_API_URL || window.location.origin;
const socket = io(API);
const ROLE_COLORS: Record<Role, string> = {
  Retailer: "#43d9ad",
  Wholesaler: "#58a6ff",
  Distributor: "#c084fc",
  Factory: "#f59e0b"
};
const DEMAND_COLOR = "#f43f5e";

type PublicRole = {
  role: Role;
  playerName?: string;
  joined: boolean;
  connected: boolean;
  submittedThisRound: boolean;
};

type PublicRoom = {
  code: string;
  status: RoomStatus;
  currentRound: number;
  totalRounds: number;
  roles: PublicRole[];
};

type ParameterSet = {
  id: string;
  name: string;
  params: GameParams;
};

const PARAMETER_SETS_KEY = "beer-game-parameter-sets";
const DEFAULT_SET: ParameterSet = {
  id: "default",
  name: "Default classroom game",
  params: structuredClone(defaultParams)
};
const BUILT_IN_SETS: ParameterSet[] = [...classroomPresets, DEFAULT_SET];
const isBuiltIn = (id: string) => BUILT_IN_SETS.some(set => set.id === id);

function loadParameterSets(): ParameterSet[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PARAMETER_SETS_KEY) || "[]");
    if (!Array.isArray(saved)) return [...BUILT_IN_SETS];
    const custom = saved
      .filter(item => item && typeof item.id === "string" && typeof item.name === "string" && !isBuiltIn(item.id))
      .map(item => ({ ...item, params: validateGameParams(item.params) }));
    return [...BUILT_IN_SETS, ...custom];
  } catch {
    return [...BUILT_IN_SETS];
  }
}

function saveParameterSets(sets: ParameterSet[]) {
  localStorage.setItem(
    PARAMETER_SETS_KEY,
    JSON.stringify(sets.filter(set => !isBuiltIn(set.id)))
  );
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return body as T;
}

function teacherHeaders(password: string, json = false): HeadersInit {
  return {
    "x-teacher-password": password,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

function App() {
  const [mode, setMode] = useState<"teacher" | "student">("student");
  const [teacherPassword, setTeacherPassword] = useState("");

  function teacherLogin(password: string) {
    setTeacherPassword(password);
  }

  function teacherLogout() {
    socket.emit("teacher:logout");
    setTeacherPassword("");
    setMode("student");
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span>OPERATIONS LAB</span>
          <h1>Classroom Beer Game</h1>
        </div>
        <div className="header-actions">
          <div className="designer-badge" aria-label="Designed by Fanzhuo Zeng">
            <img src={designerAvatar} alt="Q-style avatar of Fanzhuo Zeng" />
            <div>
              <span>Designed by</span>
              <b>Fanzhuo Zeng</b>
            </div>
          </div>
          <div className="tabs">
            <button onClick={() => setMode("teacher")} className={mode === "teacher" ? "active" : ""}>Teacher</button>
            <button onClick={teacherLogout} className={mode === "student" ? "active" : ""}>Student</button>
          </div>
        </div>
      </header>
      {mode === "teacher" ? (
        teacherPassword
          ? <TeacherApp password={teacherPassword} onLogout={teacherLogout} />
          : <TeacherLogin onLogin={teacherLogin} />
      ) : <StudentApp />}
    </div>
  );
}

function TeacherLogin({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/api/teacher/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      await responseJson<{ ok: boolean }>(response);
      onLogin(password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="teacher-login">
      <form className="card login-panel" onSubmit={submit}>
        <span className="eyebrow">RESTRICTED ACCESS</span>
        <h2>Teacher Sign In</h2>
        <p>Enter the teacher password to manage rooms and view results.</p>
        <label>
          Teacher password
          <input type="password" value={password} autoFocus
            onChange={event => setPassword(event.target.value)} />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Enter Teacher Dashboard"}
        </button>
        {message && <p className="error">{message}</p>}
      </form>
    </main>
  );
}

function TeacherApp({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [reviewCode, setReviewCode] = useState<string | null>(null);
  const [parameterSets, setParameterSets] = useState<ParameterSet[]>(loadParameterSets);
  const [selectedSetId, setSelectedSetId] = useState(classroomPresets[0].id);
  const [managingParameters, setManagingParameters] = useState(false);

  useEffect(() => {
    socket.emit("teacher:authenticate", { password });
    socket.on("rooms:update", setRooms);
    fetch(`${API}/api/rooms`, { headers: teacherHeaders(password) })
      .then(responseJson<PublicRoom[]>)
      .then(setRooms)
      .catch(error => {
        alert(error.message);
        if (error.message.includes("password")) onLogout();
      });
    return () => {
      socket.off("rooms:update", setRooms);
    };
  }, [password, onLogout]);

  function updateParameterSets(next: ParameterSet[]) {
    setParameterSets(next);
    saveParameterSets(next);
    if (!next.some(set => set.id === selectedSetId)) {
      setSelectedSetId(classroomPresets[0].id);
    }
  }

  async function createRoom() {
    const selected = parameterSets.find(set => set.id === selectedSetId) || DEFAULT_SET;
    try {
      const res = await fetch(`${API}/api/rooms`, {
        method: "POST",
        headers: teacherHeaders(password, true),
        body: JSON.stringify({ params: selected.params })
      });
      const room = await responseJson<PublicRoom>(res);
      setReviewCode(null);
      alert(`Room ${room.code} created with "${selected.name}".`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not create room");
    }
  }

  async function startRoom(code: string) {
    const res = await fetch(`${API}/api/rooms/${code}/start`, {
      method: "POST",
      headers: teacherHeaders(password)
    });
    try {
      await responseJson<PublicRoom>(res);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not start room");
    }
  }

  async function endRoom(code: string) {
    const res = await fetch(`${API}/api/rooms/${code}/end`, {
      method: "POST",
      headers: teacherHeaders(password)
    });
    try {
      await responseJson<PublicRoom>(res);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not end room");
    }
  }

  async function removeRoom(code: string) {
    if (!confirm(`Delete room ${code}? This cannot be undone.`)) return;
    const res = await fetch(`${API}/api/rooms/${code}`, {
      method: "DELETE",
      headers: teacherHeaders(password)
    });
    try {
      await responseJson<{ deleted: boolean }>(res);
      if (reviewCode === code) setReviewCode(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete room");
    }
  }

  const active = rooms.filter(r => r.status !== "completed");
  const completed = rooms.filter(r => r.status === "completed");

  if (reviewCode) {
    return <Review code={reviewCode} password={password} onBack={() => setReviewCode(null)} />;
  }
  if (managingParameters) {
    return (
      <ParameterSetManager
        sets={parameterSets}
        onChange={updateParameterSets}
        onBack={() => setManagingParameters(false)}
      />
    );
  }

  return (
    <main>
      <div className="teacher-session">
        <span>Teacher dashboard unlocked</span>
        <button className="secondary" onClick={onLogout}>Lock Teacher Dashboard</button>
      </div>
      <section className="card room-creator">
        <div>
          <h2>Create a room</h2>
          <p>Choose a ready-to-play classroom preset or one of your saved parameter sets.</p>
        </div>
        <div className="create-controls">
          <label htmlFor="parameter-set">Parameter set</label>
          <select
            id="parameter-set"
            value={selectedSetId}
            onChange={event => setSelectedSetId(event.target.value)}
          >
            {parameterSets.map(set => <option key={set.id} value={set.id}>{set.name}</option>)}
          </select>
          <small className="muted preset-description">
            {(() => {
              const params = (parameterSets.find(set => set.id === selectedSetId) || DEFAULT_SET).params;
              return `${params.totalRounds} rounds | Order lead time: ${params.orderLeadTime} | Shipment lead time: ${params.shipmentLeadTime}`;
            })()}
          </small>
          <button onClick={createRoom}>Create Room</button>
          <button className="secondary" onClick={() => setManagingParameters(true)}>Manage Parameter Sets</button>
        </div>
      </section>

      <div className="toolbar">
      </div>

      <h2>Active Rooms</h2>
      <div className="grid">
        {active.map(room => (
          <RoomCard
            key={room.code}
            room={room}
            onStart={() => startRoom(room.code)}
            onEnd={() => endRoom(room.code)}
            onReview={() => setReviewCode(room.code)}
            onDelete={() => removeRoom(room.code)}
          />
        ))}
      </div>

      <h2>Completed Rooms</h2>
      <div className="grid">
        {completed.map(room => (
          <RoomCard
            key={room.code}
            room={room}
            onStart={() => {}}
            onEnd={() => {}}
            onReview={() => setReviewCode(room.code)}
            onDelete={() => removeRoom(room.code)}
          />
        ))}
      </div>
    </main>
  );
}

function ParameterSetManager({ sets, onChange, onBack }: {
  sets: ParameterSet[];
  onChange: (sets: ParameterSet[]) => void;
  onBack: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [params, setParams] = useState<GameParams>(structuredClone(defaultParams));
  const [demandText, setDemandText] = useState(defaultParams.marketDemand.join(", "));
  const [message, setMessage] = useState("");

  function startNew(source: GameParams = defaultParams) {
    setEditingId(null);
    setName("");
    setParams(structuredClone(source));
    setDemandText(source.marketDemand.join(", "));
    setMessage("");
  }

  function edit(set: ParameterSet) {
    setEditingId(isBuiltIn(set.id) ? null : set.id);
    setName(isBuiltIn(set.id) ? `${set.name} copy` : set.name);
    setParams(structuredClone(set.params));
    setDemandText(set.params.marketDemand.join(", "));
    setMessage("");
  }

  function updateTopLevel(field: "totalRounds" | "orderLeadTime" | "shipmentLeadTime", value: number) {
    setParams(current => ({ ...current, [field]: value }));
  }

  function updateRole(role: Role, field: keyof RoleParams, value: number) {
    setParams(current => ({
      ...current,
      roleParams: {
        ...current.roleParams,
        [role]: { ...current.roleParams[role], [field]: value }
      }
    }));
  }

  function save() {
    try {
      if (!name.trim()) throw new Error("Parameter set name is required");
      const marketDemand = demandText
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(value => Number(value));
      const validated = validateGameParams({ ...params, marketDemand });
      const id = editingId || crypto.randomUUID();
      const nextSet = { id, name: name.trim().slice(0, 80), params: validated };
      const next = editingId
        ? sets.map(set => set.id === editingId ? nextSet : set)
        : [...sets, nextSet];
      onChange(next);
      setEditingId(id);
      setMessage("Parameter set saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save parameter set");
    }
  }

  function remove(id: string) {
    if (!confirm("Delete this parameter set?")) return;
    onChange(sets.filter(set => set.id !== id));
    if (editingId === id) startNew();
  }

  return (
    <main>
      <div className="page-heading">
        <div>
          <button onClick={onBack}>Back to Rooms</button>
          <h2>Parameter Sets</h2>
          <p>Built-in presets are always available. Custom sets are saved in this browser. Copy a preset to customize it.</p>
        </div>
        <button onClick={() => startNew()}>New Parameter Set</button>
      </div>

      <div className="parameter-layout">
        <aside className="card preset-list">
          <h3>Saved sets</h3>
          {sets.map(set => (
            <div className="preset-item" key={set.id}>
              <div>
                <b>{set.name}</b>
                <small>{set.params.totalRounds} rounds</small>
              </div>
              <div>
                <button className="small" onClick={() => edit(set)}>
                  {isBuiltIn(set.id) ? "Copy" : "Edit"}
                </button>
                {!isBuiltIn(set.id) && (
                  <button className="small danger" onClick={() => remove(set.id)}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </aside>

        <section className="card parameter-editor">
          <h3>{editingId ? "Edit parameter set" : "New parameter set"}</h3>
          <label>
            Parameter set name
            <input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Week 5 demand shock" />
          </label>

          <div className="form-grid">
            <NumberField label="Total rounds" value={params.totalRounds} min={1} max={100}
              onChange={value => updateTopLevel("totalRounds", value)} />
            <NumberField label="Order lead time" value={params.orderLeadTime} min={0} max={20}
              onChange={value => updateTopLevel("orderLeadTime", value)} />
            <NumberField label="Shipment lead time" value={params.shipmentLeadTime} min={0} max={20}
              onChange={value => updateTopLevel("shipmentLeadTime", value)} />
          </div>

          <label>
            Market demand by round
            <input value={demandText} onChange={event => setDemandText(event.target.value)}
              placeholder="4, 4, 4, 8, 8, 8" />
            <small>Enter non-negative values separated by commas or spaces. If fewer values are entered than rounds, the last value repeats.</small>
          </label>

          <h3>Role economics</h3>
          <div className="table-wrap">
            <table className="parameter-table">
              <thead>
                <tr>
                  <th>Role</th><th>Initial cash</th><th>Initial inventory</th>
                  <th>Purchase cost</th><th>Holding cost</th><th>Backlog cost</th><th>Selling price</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(role => (
                  <tr key={role}>
                    <td><b>{role}</b></td>
                    {(["initialCash", "initialInventory", "purchaseCost", "holdingCost", "backlogCost", "sellingPrice"] as const).map(field => (
                      <td key={field}>
                        <input type="number" min="0" step="any" value={params.roleParams[role][field]}
                          aria-label={`${role} ${field}`}
                          onChange={event => updateRole(role, field, Number(event.target.value))} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="editor-actions">
            <button onClick={save}>Save Parameter Set</button>
            <button className="secondary" onClick={() => startNew()}>Clear</button>
            {message && <span className={message.includes("saved") ? "success" : "error"}>{message}</span>}
          </div>
        </section>
      </div>
    </main>
  );
}

function NumberField({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input type="number" value={value} min={min} max={max}
        onChange={event => onChange(Number(event.target.value))} />
    </label>
  );
}

function RoomCard({ room, onStart, onEnd, onReview, onDelete }: {
  room: PublicRoom;
  onStart: () => void;
  onEnd: () => void;
  onReview: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="card">
      <h3>Room {room.code}</h3>
      <p><b>Status:</b> {room.status}</p>
      <p><b>Round:</b> {room.currentRound} / {room.totalRounds}</p>

      <table>
        <thead>
          <tr><th>Role</th><th>Player</th><th>Connection</th><th>Decision</th></tr>
        </thead>
        <tbody>
          {room.roles.map(r => (
            <tr key={r.role}>
              <td>{r.role}</td>
              <td>{r.playerName || "Not joined"}</td>
              <td>
                <span className={r.connected ? "connection online" : "connection offline"}>
                  {r.connected ? "Online" : r.joined ? "Exited" : "-"}
                </span>
              </td>
              <td>{r.submittedThisRound ? "Submitted" : "Waiting"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="buttons">
        {room.status === "waiting" && <button onClick={onStart}>Start</button>}
        {room.status === "running" && <button onClick={onEnd}>End</button>}
        {room.status === "completed" && <button onClick={onReview}>Review</button>}
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>
    </section>
  );
}

function StudentApp() {
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [role, setRole] = useState<Role>("Retailer");
  const [playback, dispatchPlayback] = useReducer(playbackReducer, initialPlayback);
  const view = playback.visible;
  const playing = playback.active !== null;
  const finishPlayback = useCallback(() => {
    dispatchPlayback({ type: "finish", playbackId: playback.playbackId });
  }, [playback.playbackId]);
  const [quantity, setQuantity] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const receive = (next: PlayerView) => dispatchPlayback({ type: "receive", view: next });
    socket.on("player:update", receive);
    socket.on("room:update", () => {
      if (roomCode && role) socket.emit("player:refresh", { roomCode, role });
    });
    socket.on("error:message", setMessage);
    socket.on("room:deleted", () => {
      dispatchPlayback({ type: "reset" });
      setMessage("This room was deleted by the teacher.");
    });
    return () => {
      socket.off("player:update", receive);
      socket.off("room:update");
      socket.off("error:message", setMessage);
      socket.off("room:deleted");
    };
  }, [roomCode, role]);

  function join() {
    setMessage("");
    const code = roomCode.trim().toUpperCase();
    if (!code || !playerName.trim()) {
      setMessage("Room code and name are required.");
      return;
    }
    setRoomCode(code);
    socket.emit("room:join", { roomCode: code, role, playerName: playerName.trim() });
  }

  function submit() {
    if (!view || playing || view.status !== "running" || view.submittedThisRound) return;
    if (!Number.isFinite(quantity) || quantity < 0) {
      setMessage("Quantity must be a non-negative number.");
      return;
    }
    if (view.maxAffordableQuantity !== null && quantity > view.maxAffordableQuantity) {
      setMessage(`Cash is not enough for this order. You can afford at most ${view.maxAffordableQuantity} units.`);
      return;
    }
    setMessage("");
    socket.emit("decision:submit", { roomCode: roomCode.toUpperCase(), role, quantity });
  }

  if (!view) {
    return (
      <main className="join">
        <h2>Join a Room</h2>
        <input placeholder="Room code" value={roomCode} onChange={e => setRoomCode(e.target.value)} />
        <input placeholder="Your name" value={playerName} onChange={e => setPlayerName(e.target.value)} />
        <select value={role} onChange={e => setRole(e.target.value as Role)}>
          {roles.map(r => <option key={r}>{r}</option>)}
        </select>
        <button onClick={join}>Join</button>
        {message && <p className="error">{message}</p>}
      </main>
    );
  }

  return (
    <main>
      <section className="student-dashboard">
        <div className="dashboard-heading">
          <div>
            <span className="student-role-title">{view.role} CONTROL ROOM</span>
            <h2>Room {view.code}</h2>
          </div>
          <div className="round-status">
            <span>{view.status}</span>
            <b>Round {view.currentRound} / {view.totalRounds}</b>
          </div>
        </div>

        <SupplyChainMap currentRole={view.role} />

        <div className="metrics">
          <div className="metric inventory-metric"><b>Inventory</b><span>{view.inventory}</span></div>
          <div className={`metric ${view.previousRoundBacklog > 0 ? "backlog-metric" : "inventory-metric"}`}>
            <b>Previous Round-End Backlog</b><span>{view.previousRoundBacklog}</span>
            <small>{view.previousRoundBacklogRound ? `End of Round ${view.previousRoundBacklogRound}` : "Before Round 1"}</small>
          </div>
          <div><b>Cash</b><span>{view.cash.toFixed(2)}</span></div>
          <div><b>Orders Received</b><span>{view.receivedOrder}</span>
            <small>{view.receivedOrderRound === null ? "No orders received yet" : `Received in Round ${view.receivedOrderRound}`}</small>
          </div>
          <div><b>Goods Received</b><span>{view.receivedShipment}</span>
            <small>{view.receivedShipmentRound === null ? "No goods received yet" : `Received in Round ${view.receivedShipmentRound}`}</small>
            {view.role === "Factory" && <small>Includes completed production</small>}
          </div>
        </div>

        <SettlementPanel role={view.role} inventory={view.inventory} record={view.records[view.records.length - 1]}
          onReplay={() => dispatchPlayback({ type: "replay" })} />

        <section className="decision card">
          <div className="decision-copy">
            <span className="eyebrow">ROUND DECISION</span>
            <label htmlFor="order-quantity">Order / production quantity</label>
            <small>
              {view.status === "waiting" && "Waiting for the teacher to start the game."}
              {view.status === "running" && !view.submittedThisRound && (
                view.maxAffordableQuantity === null
                  ? "Enter a non-negative quantity. Purchase cost is zero, so there is no cash limit."
                  : `Enter a non-negative quantity. Maximum affordable: ${view.maxAffordableQuantity}.`
              )}
              {view.status === "running" && view.submittedThisRound && "Your decision is locked until the next round."}
              {view.status === "completed" && "The game has ended. No further decisions can be submitted."}
            </small>
          </div>
          <input
            id="order-quantity"
            type="number"
            min="0"
            max={view.maxAffordableQuantity ?? undefined}
            step="1"
            value={quantity}
            disabled={playing || view.status !== "running" || view.submittedThisRound}
            onChange={e => setQuantity(Number(e.target.value))}
          />
          <button
            onClick={submit}
            disabled={playing || view.status !== "running" || view.submittedThisRound}
          >
            {view.submittedThisRound ? "Decision Submitted" : "Submit Decision"}
          </button>
        </section>

        <section className="card cost-panel">
          <div>
            <span className="eyebrow">YOUR UNIT ECONOMICS</span>
            <h3>Cost and price assumptions</h3>
          </div>
          <div className="cost-grid">
            <div><span>Holding cost</span><b>{view.costs.holdingCost.toFixed(2)}</b></div>
            <div><span>Purchase cost</span><b>{view.costs.purchaseCost.toFixed(2)}</b></div>
            <div><span>Selling price</span><b>{view.costs.sellingPrice.toFixed(2)}</b></div>
            <div><span>Backlog cost</span><b>{view.costs.backlogCost.toFixed(2)}</b></div>
          </div>
        </section>

        {view.submittedThisRound && <p className="notice">Decision submitted. Waiting for other players.</p>}
        {view.status === "completed" && <p className="notice">Game completed. Please wait for teacher review.</p>}
        {message && <p className="error">{message}</p>}

        <StudentTrendChart records={view.records} />

        <section className="card">
          <h3>Your history</h3>
          <div className="table-wrap"><table>
          <thead>
            <tr>
              <th>Round</th><th>Orders Received</th><th>Ordered</th><th>Goods Received</th><th>Ending Inventory</th><th>Ending Backlog</th><th>Cash</th>
            </tr>
          </thead>
          <tbody>
            {view.records.map(r => (
              <tr key={r.round}>
                <td>{r.round}</td><td>{r.demandReceived}</td><td>{r.orderSubmitted}</td>
                <td>{r.shipmentReceived}</td><td>{r.inventory}</td><td>{r.backlog}</td><td>{r.cash.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          </table></div>
        </section>
      </section>
      {playback.active && <SettlementAnimation key={playback.playbackId} record={playback.active} onFinish={finishPlayback} />}
    </main>
  );
}

function SupplyChainMap({ currentRole }: { currentRole: Role }) {
  const chain: Array<Role | "Consumer"> = ["Factory", "Distributor", "Wholesaler", "Retailer", "Consumer"];
  return (
    <section className="card supply-chain">
      <div>
        <span className="eyebrow">YOUR SUPPLY CHAIN POSITION</span>
        <h3>Know your upstream and downstream partners</h3>
      </div>
      <div className="chain-flow" aria-label={`Supply chain position: ${currentRole}`}>
        {chain.map((node, index) => (
          <React.Fragment key={node}>
            <div className={node === currentRole ? "chain-node current" : "chain-node"}>
              <span>{node === currentRole ? "YOU ARE HERE" : index === 0 ? "UPSTREAM" : index === chain.length - 1 ? "DEMAND" : ""}</span>
              <b>{node}</b>
            </div>
            {index < chain.length - 1 && <div className="chain-arrow" aria-hidden="true">→</div>}
          </React.Fragment>
        ))}
      </div>
      <p className="chain-note">Orders flow upstream ← &nbsp;&nbsp; Shipments flow downstream →</p>
    </section>
  );
}

function StudentTrendChart({ records }: { records: RoundRecord[] }) {
  const data = records.map(record => ({
    round: record.round,
    "Orders Received": record.demandReceived,
    Inventory: record.inventory
  }));

  return (
    <section className="card wide">
      <span className="eyebrow">OPERATING TREND</span>
      <h3>Orders received and inventory</h3>
      {data.length === 0 ? (
        <p className="muted">The chart will appear after the first round is processed.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid stroke="#263241" strokeDasharray="3 3" />
              <XAxis dataKey="round" stroke="#8b9bad" />
              <YAxis stroke="#8b9bad" />
              <Tooltip contentStyle={{ background: "#121a24", border: "1px solid #334155" }} />
              <Line type="monotone" dataKey="Orders Received" stroke="#58a6ff" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="Inventory" stroke="#43d9ad" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart-key">
        <span><i style={{ background: "#58a6ff" }} />Orders Received</span>
        <span><i style={{ background: "#43d9ad" }} />Inventory</span>
      </div>
    </section>
  );
}

function Review({ code, password, onBack }: {
  code: string;
  password: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [hiddenRoles, setHiddenRoles] = useState<Set<Role>>(new Set());

  useEffect(() => {
    fetch(`${API}/api/rooms/${code}/review`, { headers: teacherHeaders(password) })
      .then(responseJson<any>)
      .then(setData)
      .catch(error => setData({ error: error.message }));
  }, [code, password]);

  async function downloadCsv() {
    try {
      const response = await fetch(`${API}/api/rooms/${code}/csv`, {
        headers: teacherHeaders(password)
      });
      if (!response.ok) await responseJson(response);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `beer-game-${code}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not download CSV");
    }
  }

  const records = data?.room?.records || [];

  const chartData = useMemo(() => {
    const byRound: Record<number, any> = {};
    for (const r of records) {
      if (!byRound[r.round]) byRound[r.round] = { round: r.round };
      byRound[r.round][`${r.role} Orders`] = r.orderSubmitted;
      byRound[r.round][`${r.role} Inventory`] = r.inventory;
      byRound[r.round][`${r.role} Backlog`] = r.backlog;
      byRound[r.round][`${r.role} Cash`] = r.cash;
    }
    const marketDemand: number[] = data?.room?.params?.marketDemand || [];
    const lastDemand = marketDemand[marketDemand.length - 1] ?? 0;
    for (const row of Object.values(byRound)) {
      row["Consumer Demand"] = marketDemand[row.round - 1] ?? lastDemand;
    }
    return Object.values(byRound);
  }, [records, data]);

  function toggleRole(role: Role) {
    setHiddenRoles(current => {
      const next = new Set(current);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  if (!data) return <main>Loading...</main>;
  if (data.error) {
    return <main><button onClick={onBack}>Back</button><p className="error">{data.error}</p></main>;
  }

  return (
    <main>
      <button onClick={onBack}>Back</button>
      <button className="buttonLink" onClick={downloadCsv}>Download CSV</button>

      <div className="dashboard-heading review-heading">
        <div>
          <span className="eyebrow">POST-GAME ANALYTICS</span>
          <h2>Room {code} Review</h2>
        </div>
      </div>

      <section className="card">
        <h3>Bullwhip Effect</h3>
        <div className="table-wrap"><table>
        <thead>
          <tr><th>Role</th><th>Mean Order</th><th>Std Order</th><th>CV</th><th>Amplification</th></tr>
        </thead>
        <tbody>
          {data.bullwhip.map((b: any) => (
            <tr key={b.role}>
              <td>{b.role}</td><td>{b.meanOrder}</td><td>{b.stdOrder}</td>
              <td>{b.coefficientOfVariation}</td><td>{b.amplificationRatio}</td>
            </tr>
          ))}
        </tbody>
        </table></div>
      </section>

      <section className="role-filter card">
        <div>
          <span className="eyebrow">ROLE VISIBILITY</span>
          <h3>Click a role to hide or show its lines</h3>
        </div>
        <div className="role-buttons">
          {roles.map(role => (
            <button
              key={role}
              className={hiddenRoles.has(role) ? "role-toggle hidden" : "role-toggle"}
              style={{ "--role-color": ROLE_COLORS[role] } as React.CSSProperties}
              onClick={() => toggleRole(role)}
            >
              <i />{role}
            </button>
          ))}
        </div>
      </section>

      <Chart title="Order Quantity vs Consumer Demand" data={chartData} suffix="Orders"
        hiddenRoles={hiddenRoles} includeDemand />
      <Chart title="Inventory by Role" data={chartData} suffix="Inventory" hiddenRoles={hiddenRoles} />
      <Chart title="Backlog by Role" data={chartData} suffix="Backlog" hiddenRoles={hiddenRoles} />
      <Chart title="Cash by Role" data={chartData} suffix="Cash" hiddenRoles={hiddenRoles} />
    </main>
  );
}

function Chart({ title, data, suffix, hiddenRoles, includeDemand = false }: {
  title: string;
  data: any[];
  suffix: string;
  hiddenRoles: Set<Role>;
  includeDemand?: boolean;
}) {
  return (
    <section className="card wide">
      <h3>{title}</h3>
      <div className="chart">
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid stroke="#263241" strokeDasharray="3 3" />
            <XAxis dataKey="round" stroke="#8b9bad" />
            <YAxis stroke="#8b9bad" />
            <Tooltip contentStyle={{ background: "#121a24", border: "1px solid #334155" }} />
            {roles.filter(role => !hiddenRoles.has(role)).map(role => (
              <Line key={role} type="monotone" dataKey={`${role} ${suffix}`}
                stroke={ROLE_COLORS[role]} strokeWidth={3} dot={false} />
            ))}
            {includeDemand && (
              <Line type="stepAfter" dataKey="Consumer Demand" stroke={DEMAND_COLOR}
                strokeWidth={3} strokeDasharray="7 5" dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-key">
        {roles.filter(role => !hiddenRoles.has(role)).map(role => (
          <span key={role}><i style={{ background: ROLE_COLORS[role] }} />{role}</span>
        ))}
        {includeDemand && <span><i className="demand-key" />Consumer Demand</span>}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
