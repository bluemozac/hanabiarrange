const { ApiError, isPlainObject, notFound } = require("./http");

function mapProjectSummary(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    stageWidth: row.stage_width,
    stageHeight: row.stage_height,
    dancerCount: row.dancer_count,
    formationCount: row.formation_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDancer(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order
  };
}

function mapFormation(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sequenceIndex: row.sequence_index,
    transitionSeconds: row.transition_seconds,
    positions: JSON.parse(row.positions_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getProjectRow(db, projectId) {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
}

function requireProjectRow(db, projectId) {
  const project = getProjectRow(db, projectId);
  if (!project) notFound("找不到舞碼專案");
  return project;
}

function getProject(db, projectId) {
  const projectRow = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM dancers d WHERE d.project_id = p.id) AS dancer_count,
        (SELECT COUNT(*) FROM formations f WHERE f.project_id = p.id) AS formation_count
       FROM projects p
       WHERE p.id = ?`
    )
    .get(projectId);

  if (!projectRow) return null;

  const dancers = db
    .prepare("SELECT * FROM dancers WHERE project_id = ? ORDER BY sort_order, id")
    .all(projectId)
    .map(mapDancer);
  const formations = db
    .prepare("SELECT * FROM formations WHERE project_id = ? ORDER BY sequence_index, id")
    .all(projectId)
    .map(mapFormation);

  return {
    ...mapProjectSummary(projectRow),
    dancers,
    formations
  };
}

function getProjectSummary(db, projectId) {
  const row = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM dancers d WHERE d.project_id = p.id) AS dancer_count,
        (SELECT COUNT(*) FROM formations f WHERE f.project_id = p.id) AS formation_count
       FROM projects p
       WHERE p.id = ?`
    )
    .get(projectId);
  return row ? mapProjectSummary(row) : null;
}

function listProjects(db) {
  return db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM dancers d WHERE d.project_id = p.id) AS dancer_count,
        (SELECT COUNT(*) FROM formations f WHERE f.project_id = p.id) AS formation_count
       FROM projects p
       ORDER BY p.updated_at DESC, p.id DESC`
    )
    .all()
    .map(mapProjectSummary);
}

function defaultPositions(dancers, stageWidth, stageHeight) {
  if (dancers.length === 0) return {};

  const columns = Math.max(1, Math.ceil(Math.sqrt(dancers.length * (stageWidth / stageHeight))));
  const rows = Math.ceil(dancers.length / columns);
  return Object.fromEntries(
    dancers.map((dancer, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = (stageWidth * (column + 1)) / (columns + 1);
      const y = (stageHeight * (row + 1)) / (rows + 1);
      return [String(dancer.id), { x: roundCoordinate(x), y: roundCoordinate(y) }];
    })
  );
}

function normalizePositions(input, dancers, stageWidth, stageHeight, fallback = {}) {
  if (input !== undefined && !isPlainObject(input)) {
    throw new ApiError(400, "positions 必須是舞者 ID 對應座標的物件");
  }

  const defaults = defaultPositions(dancers, stageWidth, stageHeight);
  return Object.fromEntries(
    dancers.map((dancer) => {
      const key = String(dancer.id);
      const candidate = input?.[key] ?? fallback[key] ?? defaults[key];
      if (!candidate || typeof candidate !== "object") {
        return [key, defaults[key]];
      }

      const x = Number(candidate.x);
      const y = Number(candidate.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new ApiError(400, `舞者 ${dancer.code} 的座標格式不正確`);
      }

      return [
        key,
        {
          x: roundCoordinate(Math.min(stageWidth, Math.max(0, x))),
          y: roundCoordinate(Math.min(stageHeight, Math.max(0, y)))
        }
      ];
    })
  );
}

function roundCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function touchProject(db, projectId) {
  db.prepare("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(projectId);
}

module.exports = {
  mapProjectSummary,
  mapDancer,
  mapFormation,
  getProjectRow,
  requireProjectRow,
  getProject,
  getProjectSummary,
  listProjects,
  defaultPositions,
  normalizePositions,
  touchProject
};
