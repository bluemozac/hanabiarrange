const http = require("node:http");
const path = require("node:path");
const { createApp } = require("./app");
const { createDatabase } = require("./database");
const { createRealtimeServer } = require("./realtime");

const port = Number(process.env.PORT) || 3030;
const host = process.env.HOST || "0.0.0.0";
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "hanabi.db");
const db = createDatabase(databasePath);
const app = createApp(db);
const server = http.createServer(app);
const realtime = createRealtimeServer(server, db);
app.locals.realtime = realtime;

server.listen(port, host, () => {
  console.log(`Hanabi Stage is running at http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  realtime.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
