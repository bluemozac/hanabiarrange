const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DEFAULT_STAGE = { width: 100, height: 56.25 };
const DEMO_DANCERS = [
  ["A1", "Alice", "#f97316", 16, 18],
  ["A2", "Bella", "#ef4444", 38, 13],
  ["A3", "Cara", "#ec4899", 62, 13],
  ["A4", "Dora", "#8b5cf6", 84, 18],
  ["B1", "Eli", "#0ea5e9", 24, 39],
  ["B2", "Finn", "#14b8a6", 47, 35],
  ["B3", "Gia", "#22c55e", 69, 35],
  ["B4", "Hana", "#eab308", 88, 43]
];

function createDatabase(filename = path.join(__dirname, "..", "data", "hanabi.db"), options = {}) {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }

  const schema = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  db.exec(schema);
  migrateDatabase(db);

  if (options.seed !== false && db.prepare("SELECT COUNT(*) AS count FROM projects").get().count === 0) {
    seedDemo(db);
  }

  return db;
}

function migrateDatabase(db) {
  const formationColumns = db.prepare("PRAGMA table_info(formations)").all();
  if (!formationColumns.some((column) => column.name === "annotations_json")) {
    db.exec(
      `ALTER TABLE formations
       ADD COLUMN annotations_json TEXT NOT NULL DEFAULT '[]'
       CHECK (json_valid(annotations_json))`
    );
  }
}

function seedDemo(db) {
  const seed = db.transaction(() => {
    const project = db
      .prepare(
        `INSERT INTO projects (name, description, stage_width, stage_height)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        "Opening Sequence",
        "8 人示範舞碼：拖曳舞者，切換隊形，再按播放預覽走位。",
        DEFAULT_STAGE.width,
        DEFAULT_STAGE.height
      );

    const projectId = Number(project.lastInsertRowid);
    const insertDancer = db.prepare(
      `INSERT INTO dancers (project_id, code, name, color, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    );
    const dancerIds = DEMO_DANCERS.map(([code, name, color], index) =>
      Number(insertDancer.run(projectId, code, name, color, index).lastInsertRowid)
    );

    const buildPositions = (locations) =>
      Object.fromEntries(
        dancerIds.map((id, index) => [
          String(id),
          { x: locations[index][0], y: locations[index][1] }
        ])
      );

    const opening = buildPositions(DEMO_DANCERS.map((dancer) => [dancer[3], dancer[4]]));
    const wave = buildPositions([
      [13, 37],
      [24, 25],
      [39, 16],
      [56, 14],
      [72, 18],
      [84, 29],
      [83, 45],
      [64, 50]
    ]);
    const line = buildPositions([
      [12, 28],
      [23, 28],
      [34, 28],
      [45, 28],
      [56, 28],
      [67, 28],
      [78, 28],
      [89, 28]
    ]);

    const insertFormation = db.prepare(
      `INSERT INTO formations
         (project_id, name, sequence_index, transition_seconds, positions_json)
       VALUES (?, ?, ?, ?, ?)`
    );
    insertFormation.run(projectId, "Opening V", 0, 2, JSON.stringify(opening));
    insertFormation.run(projectId, "Rolling Wave", 1, 3.2, JSON.stringify(wave));
    insertFormation.run(projectId, "Front Line", 2, 2.4, JSON.stringify(line));
  });

  seed();
}

module.exports = { createDatabase, DEFAULT_STAGE };
