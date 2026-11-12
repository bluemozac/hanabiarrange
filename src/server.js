const path = require("node:path");
const { createApp } = require("./app");
const { createDatabase } = require("./database");

const port = Number(process.env.PORT) || 3030;
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "hanabi.db");
const db = createDatabase(databasePath);
const app = createApp(db);

const server = app.listen(port, () => {
  console.log(`Hanabi Stage is running at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
