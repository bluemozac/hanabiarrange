const { randomUUID } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");

function createRealtimeServer(server, db) {
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024
  });
  const clients = new Set();

  const handleUpgrade = (request, socket, head) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket);
    });
  };
  server.on("upgrade", handleUpgrade);

  websocketServer.on("connection", (websocket) => {
    websocket.meta = null;
    clients.add(websocket);

    websocket.on("message", (buffer) => {
      let message;
      try {
        message = JSON.parse(buffer.toString());
      } catch {
        websocket.send(JSON.stringify({ type: "error", error: "訊息格式不正確" }));
        return;
      }
      handleClientMessage(websocket, message);
    });

    websocket.on("close", () => {
      const previousProjectId = websocket.meta?.projectId;
      clients.delete(websocket);
      if (previousProjectId) broadcastPresence(previousProjectId);
    });

    websocket.on("error", () => {
      clients.delete(websocket);
    });
  });

  function handleClientMessage(websocket, message) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "join") {
      const projectId = positiveInteger(message.projectId);
      const formationId = positiveInteger(message.formationId);
      if (!projectId || !formationId) return;
      const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
      const formation = db
        .prepare("SELECT id FROM formations WHERE id = ? AND project_id = ?")
        .get(formationId, projectId);
      if (!project || !formation) return;

      const previousProjectId = websocket.meta?.projectId;
      websocket.meta = {
        projectId,
        formationId,
        user: normalizeUser(message.user)
      };
      if (previousProjectId && previousProjectId !== projectId) {
        broadcastPresence(previousProjectId);
      }
      broadcastPresence(projectId);
      websocket.send(
        JSON.stringify({
          type: "joined",
          projectId,
          formationId,
          user: websocket.meta.user
        })
      );
      return;
    }

    if (!websocket.meta) return;
    if (message.type === "drag") {
      const formationId = positiveInteger(message.formationId);
      if (formationId !== websocket.meta.formationId) return;
      const position = normalizePosition(message.position);
      if (!position) return;
      const dancerId = positiveInteger(message.dancerId);
      const annotationId =
        typeof message.annotationId === "string"
          ? message.annotationId.slice(0, 80)
          : null;
      if (!dancerId && !annotationId) return;
      broadcastToProject(
        websocket.meta.projectId,
        {
          type: "drag",
          formationId,
          dancerId,
          annotationId,
          position,
          user: websocket.meta.user
        },
        { exclude: websocket, formationId }
      );
    }
  }

  function broadcastPresence(projectId) {
    const users = [];
    const seen = new Set();
    for (const client of clients) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.meta?.projectId === projectId &&
        !seen.has(client.meta.user.id)
      ) {
        seen.add(client.meta.user.id);
        users.push({
          ...client.meta.user,
          formationId: client.meta.formationId
        });
      }
    }
    broadcastToProject(projectId, { type: "presence", users });
  }

  function broadcastToProject(projectId, payload, options = {}) {
    const text = JSON.stringify(payload);
    for (const client of clients) {
      if (
        client.readyState !== WebSocket.OPEN ||
        client.meta?.projectId !== projectId ||
        client === options.exclude
      ) {
        continue;
      }
      if (
        options.formationId &&
        client.meta?.formationId !== options.formationId
      ) {
        continue;
      }
      client.send(text);
    }
  }

  function broadcastFormationUpdate(projectId, formation) {
    broadcastToProject(projectId, {
      type: "formation:update",
      formation
    });
  }

  function broadcastProjectChanged(projectId, reason) {
    broadcastToProject(projectId, {
      type: "project:changed",
      reason
    });
  }

  function close() {
    server.off("upgrade", handleUpgrade);
    for (const client of clients) client.close();
    websocketServer.close();
  }

  return {
    broadcastFormationUpdate,
    broadcastProjectChanged,
    close
  };
}

function normalizeUser(input) {
  const id =
    typeof input?.id === "string" && input.id.trim()
      ? input.id.trim().slice(0, 80)
      : randomUUID();
  const name =
    typeof input?.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 40)
      : `舞者 ${id.slice(-4)}`;
  const color = /^#[0-9a-f]{6}$/i.test(input?.color)
    ? input.color.toLowerCase()
    : "#0ea5e9";
  return { id, name, color };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizePosition(input) {
  const x = Number(input?.x);
  const y = Number(input?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100
  };
}

module.exports = { createRealtimeServer };
