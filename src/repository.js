const { randomUUID } = require("node:crypto");
const { ApiError, isPlainObject, notFound, colorHex } = require("./http");

function mapProjectSummary(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    stageWidth: row.stage_width,
    stageHeight: row.stage_height,
    stageShape: row.stage_shape || "rectangle",
    stageFlipped: Boolean(row.stage_flipped),
    defaultDancerScale: row.default_dancer_scale ?? 1,
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
    sizeScale: row.size_scale ?? 1,
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
    annotations: JSON.parse(row.annotations_json || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeAnnotations(
  input,
  stageWidth,
  stageHeight,
  stageShape = "rectangle",
  stageFlipped = false
) {
  if (!Array.isArray(input)) {
    throw new ApiError(400, "annotations 必須是文字注解陣列");
  }
  if (input.length > 100) {
    throw new ApiError(400, "每個隊形最多可有 100 個文字注解");
  }

  const ids = new Set();
  return input.map((annotation) => {
    if (!isPlainObject(annotation)) {
      throw new ApiError(400, "文字注解格式不正確");
    }
    const text = typeof annotation.text === "string" ? annotation.text.trim() : "";
    if (!text || text.length > 240) {
      throw new ApiError(400, "文字注解必須介於 1 與 240 個字元");
    }

    const id =
      typeof annotation.id === "string" && annotation.id.trim()
        ? annotation.id.trim().slice(0, 80)
        : randomUUID();
    if (ids.has(id)) {
      throw new ApiError(400, "文字注解 ID 不可重複");
    }
    ids.add(id);

    const x = Number(annotation.x);
    const y = Number(annotation.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new ApiError(400, "文字注解座標格式不正確");
    }
    const fontSize = Number(annotation.fontSize ?? 14);
    if (!Number.isFinite(fontSize) || fontSize < 10 || fontSize > 32) {
      throw new ApiError(400, "文字注解字級必須介於 10 與 32");
    }

    const position = clampStageCoordinates(
      x,
      y,
      stageWidth,
      stageHeight,
      stageShape,
      stageFlipped
    );
    return {
      id,
      text,
      x: position.x,
      y: position.y,
      color: colorHex(annotation.color ?? "#eb5e35"),
      fontSize: Math.round(fontSize)
    };
  });
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

function defaultPositions(
  dancers,
  stageWidth,
  stageHeight,
  stageShape = "rectangle",
  stageFlipped = false
) {
  if (dancers.length === 0) return {};

  const columns = Math.max(1, Math.ceil(Math.sqrt(dancers.length * (stageWidth / stageHeight))));
  const rows = Math.ceil(dancers.length / columns);
  return Object.fromEntries(
    dancers.map((dancer, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = (stageWidth * (column + 1)) / (columns + 1);
      const y = (stageHeight * (row + 1)) / (rows + 1);
      return [
        String(dancer.id),
        clampStageCoordinates(
          x,
          y,
          stageWidth,
          stageHeight,
          stageShape,
          stageFlipped
        )
      ];
    })
  );
}

function normalizePositions(
  input,
  dancers,
  stageWidth,
  stageHeight,
  fallback = {},
  stageShape = "rectangle",
  stageFlipped = false
) {
  if (input !== undefined && !isPlainObject(input)) {
    throw new ApiError(400, "positions 必須是舞者 ID 對應座標的物件");
  }

  const defaults = defaultPositions(
    dancers,
    stageWidth,
    stageHeight,
    stageShape,
    stageFlipped
  );
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
        clampStageCoordinates(
          x,
          y,
          stageWidth,
          stageHeight,
          stageShape,
          stageFlipped
        )
      ];
    })
  );
}

function clampStageCoordinates(
  x,
  y,
  stageWidth,
  stageHeight,
  stageShape = "rectangle",
  stageFlipped = false
) {
  let nextX = Math.min(stageWidth, Math.max(0, Number(x)));
  let nextY = Math.min(stageHeight, Math.max(0, Number(y)));
  const centerX = stageWidth / 2;
  const centerY =
    stageShape === "semicircle"
      ? stageFlipped
        ? 0
        : stageHeight
      : stageHeight / 2;
  const radiusX = stageWidth / 2;
  const radiusY = stageShape === "semicircle" ? stageHeight : stageHeight / 2;

  if (stageShape === "circle" || stageShape === "semicircle") {
    const normalizedX = (nextX - centerX) / radiusX;
    const normalizedY = (nextY - centerY) / radiusY;
    const distance = Math.hypot(normalizedX, normalizedY);
    if (distance > 0.995) {
      const scale = 0.995 / distance;
      nextX = centerX + normalizedX * scale * radiusX;
      nextY = centerY + normalizedY * scale * radiusY;
    }
  }

  return { x: roundCoordinate(nextX), y: roundCoordinate(nextY) };
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
  normalizeAnnotations,
  clampStageCoordinates,
  touchProject
};
