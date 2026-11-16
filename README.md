# Classroom Beer Game

A multiplayer classroom Beer Game web app for operations and supply chain management.

## Features

- Teacher can create multiple rooms.
- Four roles per room: Retailer, Wholesaler, Distributor, Factory.
- Students join by room code and select one role.
- Each student submits one quantity decision per round.
- Teacher public dashboard only shows:
  - room code
  - room status
  - current round
  - role assignment
  - submission status
- Operational information is hidden during the game to preserve Beer Game information asymmetry.
- After the game ends, the teacher can review:
  - order volatility
  - inventory
  - backlog
  - cash/profit
  - bullwhip effect
- CSV export supported.

## Install

```bash
npm run install:all
```

## Run

```bash
npm run build
npm start
```

Then open:

- Classroom site: http://localhost:4000

Students on the same local network can use the teacher computer's LAN address,
for example `http://192.168.1.20:4000`. The host firewall must allow inbound
connections to port 4000.

Set `VITE_API_URL` when the backend is hosted somewhere other than
the same origin as the frontend.

For development with hot reload, use `npm run dev` and open
`http://localhost:5173`.

On Windows, `start-classroom.bat` installs missing dependencies, builds the
site, opens the browser, and starts the server.

## Verify

```bash
npm test
npm run build
```

## Suggested classroom use

1. Teacher clicks **Teacher** and signs in with password `1014`.
2. Teacher opens **Manage Parameter Sets** to create and name reusable settings.
3. Teacher selects a parameter set and creates one or more rooms.
4. Students join with the room code.
5. Each group has four players.
6. Teacher starts the room.
7. Students submit quantity decisions each round.
8. After the game, teacher opens the review page and discusses bullwhip effect.

If a student closes the page, the teacher dashboard marks that role as
**Exited**. The student can rejoin a running game with the same room code,
role, and player name; their role state and history are preserved.

Student order quantities are limited by available cash. With zero order lead
time, orders are processed by the upstream role in the same round.

## Classroom Presets And Settlement Playback

The teacher's **Parameter set** dropdown includes **Test (3 rounds)**,
**Short (10)**, **Medium (15)**, **Standard (20)** and **Long (30)**. These are
the calibrated v4 demand sequences, with both lead times set to zero. All
roles have a unit margin of 6, holding cost of 1 and backlog cost of 3.
Downstream purchase prices match upstream selling prices. Built-in presets
can be copied into named custom sets but cannot be overwritten or deleted.

Student metric cards show **Previous Round-End Backlog**, **Orders Received**
and **Goods Received**, each with the relevant round number. First-round
goods received are zero. With zero order lead time, upstream players see the
last settled order, since the new downstream order is not known until all
players submit; the retailer sees current-round consumer demand. Zero-lead
goods received show the latest completed settlement, not goods still in transit.
Factory receipts include completed production.

After each round, a focused warehouse animation shows opening stock,
outbound shipments, inbound goods and ending stock. The rest of the page is
dimmed and locked, and its values remain unchanged until playback finishes.
**Replay** repeats the latest settlement without submitting or advancing a
round. **Skip Animation** (or Escape) ends playback immediately. Rejoining a
room restores the current dashboard without playing its entire history.

Settlement follows the engine's actual timing: zero-lead shipments arrive
after dispatch and cannot be re-shipped in that same round. Factory
production with zero lead time, or deliveries already due at the start of a
positive-lead round, appear before dispatch. The animation explicitly shows
these earlier receipts so warehouse stock never becomes negative.

The teacher can delete waiting, running, or completed rooms. Switching to the
student view or refreshing the page locks the teacher dashboard again.

The default teacher password is `1014`. For deployment, it can be overridden
with the `TEACHER_PASSWORD` environment variable.

Custom parameter sets are saved in the teacher browser's local storage. They
remain available after refreshing or restarting the site, but are specific to
that browser and device.

## Deploy To A Permanent Link

This app needs a Node.js web service because it uses a backend and realtime
Socket.IO connections. A static website host is not enough.

Recommended simple deployment: Render.

1. Create a Render account at https://render.com.
2. Put this project in a GitHub repository.
3. In Render, choose **New +** -> **Blueprint**.
4. Connect the GitHub repository.
5. Render will read `render.yaml` automatically.
6. Set the environment variable `TEACHER_PASSWORD` to the teacher password you
   want to use, for example `1014`.
7. Click **Apply** or **Deploy**.
8. After deployment, Render gives you a permanent URL like:

```text
https://beer-game-classroom.onrender.com
```

Use that URL for both teacher and student access. Students no longer need the
teacher computer's local IP address.

Important classroom note: the current version stores active rooms in server
memory. If the hosting service restarts, active rooms are cleared. The website
link remains the same, but games should be run during one uninterrupted class
session. For long-term saved rooms across restarts, add a database such as
PostgreSQL or Redis.
