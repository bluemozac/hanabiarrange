const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { createApp } = require("../src/app");
const { createDatabase } = require("../src/database");
const { createRealtimeServer } = require("../src/realtime");

test("two clients receive presence, live drag and formation updates", async (t) => {
  const db = createDatabase(":memory:", { seed: false });
  const app = createApp(db);
  const server = http.createServer(app);
  const realtime = createRealtimeServer(server, db);
  app.locals.realtime = realtime;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sockets = [];

  t.after(async () => {
    for (const socket of sockets) socket.close();
    realtime.close();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  };

  const project = (
    await request("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "Realtime Test",
        stageWidth: 100,
        stageHeight: 60
      })
    })
  ).payload.project;
  const dancerA = (
    await request(`/api/projects/${project.id}/dancers`, {
      method: "POST",
      body: JSON.stringify({ code: "A1", name: "Alice", color: "#f97316" })
    })
  ).payload.dancer;
  const dancerB = (
    await request(`/api/projects/${project.id}/dancers`, {
      method: "POST",
      body: JSON.stringify({ code: "B1", name: "Bella", color: "#0ea5e9" })
    })
  ).payload.dancer;
  const formation = project.formations[0];

  const clientOne = await connectWebSocket(`ws://127.0.0.1:${port}/ws`);
  const clientTwo = await connectWebSocket(`ws://127.0.0.1:${port}/ws`);
  sockets.push(clientOne, clientTwo);
  const presenceReceived = waitForMessage(
    clientOne,
    (message) => message.type === "presence" && message.users.length === 2
  );
  await Promise.all([
    sendJson(clientOne, {
      type: "join",
      projectId: project.id,
      formationId: formation.id,
      user: { id: "client-one", name: "One", color: "#ec4899" }
    }),
    sendJson(clientTwo, {
      type: "join",
      projectId: project.id,
      formationId: formation.id,
      user: { id: "client-two", name: "Two", color: "#14b8a6" }
    })
  ]);

  const presence = await presenceReceived;
  assert.deepEqual(
    new Set(presence.users.map((user) => user.id)),
    new Set(["client-one", "client-two"])
  );

  const dragReceived = waitForMessage(
    clientTwo,
    (message) => message.type === "drag" && message.dancerId === dancerA.id
  );
  sendJson(clientOne, {
    type: "drag",
    formationId: formation.id,
    dancerId: dancerA.id,
    position: { x: 44.5, y: 22.25 }
  });
  const drag = await dragReceived;
  assert.deepEqual(drag.position, { x: 44.5, y: 22.25 });
  assert.equal(drag.user.id, "client-one");

  const formationUpdateReceived = waitForMessage(
    clientTwo,
    (message) => message.type === "formation:update"
  );
  const saved = await request(
    `/api/projects/${project.id}/formations/${formation.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        positions: {
          [dancerA.id]: { x: 44.5, y: 22.25 },
          [dancerB.id]: { x: 72, y: 31 }
        }
      })
    }
  );
  assert.equal(saved.response.status, 200);
  const formationUpdate = await formationUpdateReceived;
  assert.equal(formationUpdate.formation.id, formation.id);
  assert.deepEqual(
    formationUpdate.formation.positions[dancerA.id],
    { x: 44.5, y: 22.25 }
  );
});

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function sendJson(socket, message) {
  return new Promise((resolve) => {
    socket.send(JSON.stringify(message), resolve);
  });
}

function waitForMessage(socket, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);

    function onMessage(buffer) {
      const message = JSON.parse(buffer.toString());
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve(message);
    }

    socket.on("message", onMessage);
  });
}
