export class CollaborationClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.socket = null;
    this.projectId = null;
    this.formationId = null;
    this.user = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.closed = true;
    this.lastDragAt = new Map();
    this.pendingDrag = new Map();
  }

  connect(projectId, formationId, user) {
    this.projectId = projectId;
    this.formationId = formationId;
    this.user = user;
    this.closed = false;
    this.clearReconnectTimer();
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      this.sendJoin();
      return;
    }
    this.openSocket();
  }

  join(projectId, formationId) {
    this.projectId = projectId;
    this.formationId = formationId;
    if (this.socket?.readyState === WebSocket.OPEN) this.sendJoin();
  }

  disconnect() {
    this.closed = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
  }

  sendDrag(formationId, payload) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const key = `${formationId}:${payload.dancerId || payload.annotationId || ""}`;
    const now = performance.now();
    const previous = this.lastDragAt.get(key) || 0;
    if (now - previous < 33) {
      this.pendingDrag.set(key, { formationId, payload });
      if (!this.dragFlushTimer) {
        this.dragFlushTimer = window.setTimeout(() => {
          this.dragFlushTimer = null;
          for (const pending of this.pendingDrag.values()) {
            this.sendNow({
              type: "drag",
              formationId: pending.formationId,
              ...pending.payload
            });
          }
          this.pendingDrag.clear();
        }, 34);
      }
      return;
    }
    this.lastDragAt.set(key, now);
    this.sendNow({ type: "drag", formationId, ...payload });
  }

  openSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.sendJoin();
      this.handlers.onStatus?.("connected");
    });
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "presence") {
        this.handlers.onPresence?.(message.users);
      } else if (message.type === "drag") {
        this.handlers.onDrag?.(message);
      } else if (message.type === "formation:update") {
        this.handlers.onFormationUpdate?.(message.formation);
      } else if (message.type === "project:changed") {
        this.handlers.onProjectChanged?.(message.reason);
      }
    });
    this.socket.addEventListener("close", () => {
      this.handlers.onStatus?.("disconnected");
      if (!this.closed) this.scheduleReconnect();
    });
    this.socket.addEventListener("error", () => {
      this.socket?.close();
    });
  }

  sendJoin() {
    this.sendNow({
      type: "join",
      projectId: this.projectId,
      formationId: this.formationId,
      user: this.user
    });
  }

  sendNow(payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  scheduleReconnect() {
    this.clearReconnectTimer();
    const delay = Math.min(10000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.closed && this.projectId && this.formationId) this.openSocket();
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
