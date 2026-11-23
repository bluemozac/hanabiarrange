const express = require("express");
const {
  ApiError,
  parseId,
  requiredText,
  optionalText,
  finiteNumber,
  colorHex,
  validStageShape,
  validBoolean,
  validDancerShape,
  isPlainObject
} = require("../http");
const {
  getProject,
  listProjects,
  normalizePositions,
  normalizeAnnotations,
  touchProject
} = require("../repository");
const { buildProjectPdf } = require("../pdf");

function createProjectsRouter(db) {
  const router = express.Router();

  router.get("/", (_request, response) => {
    response.json({ projects: listProjects(db) });
  });

  router.post("/", (request, response) => {
    const name = requiredText(request.body?.name, "專案名稱", 100);
    const description = optionalText(request.body?.description, "專案說明", 500) ?? "";
    const stageWidth = finiteNumber(request.body?.stageWidth ?? 100, "舞台寬度", 10, 1000);
    const stageHeight = finiteNumber(request.body?.stageHeight ?? 56.25, "舞台高度", 10, 1000);
    const stageShape = validStageShape(request.body?.stageShape, "rectangle");
    const stageFlipped = validBoolean(
      request.body?.stageFlipped,
      "舞台反轉",
      false
    );
    const defaultDancerScale = finiteNumber(
      request.body?.defaultDancerScale ?? 1,
      "新舞者預設大小",
      0.5,
      2
    );

    const create = db.transaction(() => {
      const project = db
        .prepare(
          `INSERT INTO projects
             (name, description, stage_width, stage_height, stage_shape, stage_flipped,
              default_dancer_scale)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name,
          description,
          stageWidth,
          stageHeight,
          stageShape,
          stageFlipped ? 1 : 0,
          defaultDancerScale
        );
      const projectId = Number(project.lastInsertRowid);
      db.prepare(
        `INSERT INTO formations
           (project_id, name, sequence_index, transition_seconds, positions_json)
         VALUES (?, ?, 0, 2, '{}')`
      ).run(projectId, "第一個隊形");
      return projectId;
    });

    const projectId = create();
    response.status(201).json({ project: getProject(db, projectId) });
  });

  router.post("/:projectId/duplicate", (request, response) => {
    const sourceId = parseId(request.params.projectId, "專案 ID");
    const source = getProject(db, sourceId);
    if (!source) {
      response.status(404).json({ error: "找不到舞碼專案" });
      return;
    }

    const suffix = " 副本";
    const duplicateName = `${source.name
      .slice(0, 100 - suffix.length)
      .trimEnd()}${suffix}`;

    const duplicate = db.transaction(() => {
      const project = db
        .prepare(
          `INSERT INTO projects
             (name, description, stage_width, stage_height, stage_shape, stage_flipped,
              default_dancer_scale)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          duplicateName,
          source.description,
          source.stageWidth,
          source.stageHeight,
          source.stageShape,
          source.stageFlipped ? 1 : 0,
          source.defaultDancerScale
        );
      const projectId = Number(project.lastInsertRowid);
      const teamIdMap = new Map();
      const insertTeam = db.prepare(
        `INSERT INTO teams (project_id, name, color, sort_order)
         VALUES (?, ?, ?, ?)`
      );
      for (const team of source.teams ?? []) {
        const result = insertTeam.run(
          projectId,
          team.name,
          team.color,
          team.sortOrder
        );
        teamIdMap.set(team.id, Number(result.lastInsertRowid));
      }
      const dancerIdMap = new Map();
      const insertDancer = db.prepare(
        `INSERT INTO dancers
           (project_id, team_id, code, name, color, shape, size_scale, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const dancer of source.dancers) {
        const result = insertDancer.run(
          projectId,
          teamIdMap.get(dancer.teamId) ?? null,
          dancer.code,
          dancer.name,
          dancer.color,
          dancer.shape,
          dancer.sizeScale,
          dancer.sortOrder
        );
        dancerIdMap.set(dancer.id, Number(result.lastInsertRowid));
      }

      const insertFormation = db.prepare(
        `INSERT INTO formations
           (project_id, name, sequence_index, transition_seconds, positions_json, annotations_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const formation of source.formations) {
        const positions = {};
        for (const [oldDancerId, position] of Object.entries(formation.positions)) {
          const newDancerId = dancerIdMap.get(Number(oldDancerId));
          if (newDancerId) positions[String(newDancerId)] = position;
        }
        insertFormation.run(
          projectId,
          formation.name,
          formation.sequenceIndex,
          formation.transitionSeconds,
          JSON.stringify(positions),
          JSON.stringify(formation.annotations ?? [])
        );
      }
      return projectId;
    });

    const projectId = duplicate();
    response.status(201).json({ project: getProject(db, projectId) });
  });

  router.post("/:projectId/restore", (request, response) => {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const current = getProject(db, projectId);
    if (!current) {
      throw new ApiError(404, "找不到舞碼專案");
    }

    const restored = readRestoreSnapshot(
      db,
      projectId,
      current,
      request.body?.snapshot
    );

    const apply = db.transaction(() => {
      db.prepare("DELETE FROM formations WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM dancers WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM teams WHERE project_id = ?").run(projectId);
      db.prepare(
        `UPDATE projects
         SET name = ?, description = ?, stage_width = ?, stage_height = ?, stage_shape = ?,
             stage_flipped = ?, default_dancer_scale = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        restored.project.name,
        restored.project.description,
        restored.project.stageWidth,
        restored.project.stageHeight,
        restored.project.stageShape,
        restored.project.stageFlipped ? 1 : 0,
        restored.project.defaultDancerScale,
        projectId
      );

      const insertTeam = db.prepare(
        `INSERT INTO teams (id, project_id, name, color, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      );
      restored.teams.forEach((team, index) => {
        insertTeam.run(team.id, projectId, team.name, team.color, index);
      });

      const insertDancer = db.prepare(
        `INSERT INTO dancers
           (id, project_id, team_id, code, name, color, shape, size_scale, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      restored.dancers.forEach((dancer, index) => {
        insertDancer.run(
          dancer.id,
          projectId,
          dancer.teamId,
          dancer.code,
          dancer.name,
          dancer.color,
          dancer.shape,
          dancer.sizeScale,
          index
        );
      });

      const insertFormation = db.prepare(
        `INSERT INTO formations
           (id, project_id, name, sequence_index, transition_seconds, positions_json, annotations_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      restored.formations.forEach((formation, index) => {
        insertFormation.run(
          formation.id,
          projectId,
          formation.name,
          index,
          formation.transitionSeconds,
          JSON.stringify(formation.positions),
          JSON.stringify(formation.annotations)
        );
      });
    });
    apply();

    request.app.locals.realtime?.broadcastProjectChanged(
      projectId,
      "history-restored"
    );
    response.json({ project: getProject(db, projectId) });
  });

  router.get("/:projectId/export.pdf", async (request, response, next) => {
    try {
      const projectId = parseId(request.params.projectId, "專案 ID");
      const project = getProject(db, projectId);
      if (!project) {
        response.status(404).json({ error: "找不到舞碼專案" });
        return;
      }

      const mode = request.query.mode === "simple" ? "simple" : "full";
      const pdf = await buildProjectPdf(project, {
        theme: request.query.theme === "dark" ? "dark" : "light",
        mode
      });
      const suffix = mode === "simple" ? "-simple" : "";
      const filename = `${sanitizeFilename(project.name)}${suffix}.pdf`;
      response.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="project-${project.id}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": pdf.length,
        "Cache-Control": "no-store"
      });
      response.send(pdf);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId", (request, response) => {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const project = getProject(db, projectId);
    if (!project) {
      response.status(404).json({ error: "找不到舞碼專案" });
      return;
    }
    response.json({ project });
  });

  router.patch("/:projectId", (request, response) => {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const current = getProject(db, projectId);
    if (!current) {
      response.status(404).json({ error: "找不到舞碼專案" });
      return;
    }

    const name =
      request.body?.name === undefined
        ? current.name
        : requiredText(request.body.name, "專案名稱", 100);
    const description =
      request.body?.description === undefined
        ? current.description
        : optionalText(request.body.description, "專案說明", 500);
    const stageWidth =
      request.body?.stageWidth === undefined
        ? current.stageWidth
        : finiteNumber(request.body.stageWidth, "舞台寬度", 10, 1000);
    const stageHeight =
      request.body?.stageHeight === undefined
        ? current.stageHeight
        : finiteNumber(request.body.stageHeight, "舞台高度", 10, 1000);
    const stageShape =
      request.body?.stageShape === undefined
        ? current.stageShape
        : validStageShape(request.body.stageShape);
    const stageFlipped =
      request.body?.stageFlipped === undefined
        ? current.stageFlipped
        : validBoolean(request.body.stageFlipped, "舞台反轉");
    const defaultDancerScale =
      request.body?.defaultDancerScale === undefined
        ? current.defaultDancerScale
        : finiteNumber(
            request.body.defaultDancerScale,
            "新舞者預設大小",
            0.5,
            2
          );

    const update = db.transaction(() => {
      db.prepare(
        `UPDATE projects
         SET name = ?, description = ?, stage_width = ?, stage_height = ?, stage_shape = ?,
             stage_flipped = ?, default_dancer_scale = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        name,
        description,
        stageWidth,
        stageHeight,
        stageShape,
        stageFlipped ? 1 : 0,
        defaultDancerScale,
        projectId
      );

      if (
        stageWidth !== current.stageWidth ||
        stageHeight !== current.stageHeight ||
        stageShape !== current.stageShape ||
        stageFlipped !== current.stageFlipped
      ) {
        const updateFormation = db.prepare(
          `UPDATE formations
           SET positions_json = ?, annotations_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        );
        for (const formation of current.formations) {
          const sourcePositions =
            stageFlipped !== current.stageFlipped
              ? mirrorPositions(formation.positions, stageHeight)
              : formation.positions;
          const sourceAnnotations =
            stageFlipped !== current.stageFlipped
              ? mirrorAnnotations(formation.annotations, stageHeight)
              : formation.annotations;
          const positions = normalizePositions(
            sourcePositions,
            current.dancers,
            stageWidth,
            stageHeight,
            sourcePositions,
            stageShape,
            stageFlipped
          );
          const annotations = normalizeAnnotations(
            sourceAnnotations,
            stageWidth,
            stageHeight,
            stageShape,
            stageFlipped
          );
          updateFormation.run(
            JSON.stringify(positions),
            JSON.stringify(annotations),
            formation.id
          );
        }
      }
    });
    update();

    request.app.locals.realtime?.broadcastProjectChanged(projectId, "project-updated");
    response.json({ project: getProject(db, projectId) });
  });

  router.delete("/:projectId", (request, response) => {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    if (result.changes === 0) {
      response.status(404).json({ error: "找不到舞碼專案" });
      return;
    }
    response.status(204).end();
  });

  return router;
}

module.exports = createProjectsRouter;

function mirrorPositions(positions, stageHeight) {
  return Object.fromEntries(
    Object.entries(positions).map(([dancerId, position]) => [
      dancerId,
      {
        x: position.x,
        y: round(stageHeight - Number(position.y))
      }
    ])
  );
}

function mirrorAnnotations(annotations, stageHeight) {
  return (annotations ?? []).map((annotation) => ({
    ...annotation,
    y: round(stageHeight - Number(annotation.y))
  }));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const RESTORE_LIMITS = { teams: 500, dancers: 1000, formations: 1000 };

function readRestoreSnapshot(db, projectId, current, snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new ApiError(400, "復原資料格式不正確");
  }
  const projectInput = isPlainObject(snapshot.project) ? snapshot.project : {};

  const project = {
    name: requiredText(
      projectInput.name ?? current.name,
      "專案名稱",
      100
    ),
    description:
      optionalText(projectInput.description, "專案說明", 500) ??
      current.description ??
      "",
    stageWidth: finiteNumber(
      projectInput.stageWidth ?? current.stageWidth,
      "舞台寬度",
      10,
      1000
    ),
    stageHeight: finiteNumber(
      projectInput.stageHeight ?? current.stageHeight,
      "舞台高度",
      10,
      1000
    ),
    stageShape: validStageShape(
      projectInput.stageShape ?? current.stageShape,
      "rectangle"
    ),
    stageFlipped: validBoolean(
      projectInput.stageFlipped,
      "舞台反轉",
      Boolean(current.stageFlipped)
    ),
    defaultDancerScale: finiteNumber(
      projectInput.defaultDancerScale ?? current.defaultDancerScale ?? 1,
      "新舞者預設大小",
      0.5,
      2
    )
  };

  const teamsInput = snapshot.teams ?? [];
  if (!Array.isArray(teamsInput) || teamsInput.length > RESTORE_LIMITS.teams) {
    throw new ApiError(400, "復原資料的隊伍格式不正確");
  }
  const teamIds = new Set();
  const teamNames = new Set();
  const teams = teamsInput.map((input) => {
    if (!isPlainObject(input)) {
      throw new ApiError(400, "復原資料的隊伍格式不正確");
    }
    const id = parseId(input.id, "隊伍 ID");
    if (teamIds.has(id)) {
      throw new ApiError(400, "復原資料中的隊伍 ID 重複");
    }
    teamIds.add(id);
    const name = requiredText(input.name, "隊伍名稱", 60);
    if (teamNames.has(name)) {
      throw new ApiError(400, `復原資料中的隊伍名稱「${name}」重複`);
    }
    teamNames.add(name);
    return {
      id,
      name,
      color: colorHex(input.color ?? "#0ea5e9")
    };
  });

  const dancersInput = snapshot.dancers ?? [];
  if (
    !Array.isArray(dancersInput) ||
    dancersInput.length > RESTORE_LIMITS.dancers
  ) {
    throw new ApiError(400, "復原資料的舞者格式不正確");
  }
  const dancerIds = new Set();
  const dancerCodes = new Set();
  const dancers = dancersInput.map((input) => {
    if (!isPlainObject(input)) {
      throw new ApiError(400, "復原資料的舞者格式不正確");
    }
    const id = parseId(input.id, "舞者 ID");
    if (dancerIds.has(id)) {
      throw new ApiError(400, "復原資料中的舞者 ID 重複");
    }
    dancerIds.add(id);
    const code = requiredText(input.code, "舞者代號", 20);
    if (dancerCodes.has(code)) {
      throw new ApiError(400, `復原資料中的舞者代號「${code}」重複`);
    }
    dancerCodes.add(code);
    const teamId =
      input.teamId === null || input.teamId === undefined
        ? null
        : parseId(input.teamId, "隊伍 ID");
    if (teamId !== null && !teamIds.has(teamId)) {
      throw new ApiError(400, "復原資料的舞者所屬隊伍不存在");
    }
    return {
      id,
      teamId,
      code,
      name: optionalText(input.name, "舞者名稱", 80) ?? "",
      color: colorHex(input.color ?? "#f97316"),
      shape: validDancerShape(input.shape, "circle"),
      sizeScale: finiteNumber(input.sizeScale ?? 1, "舞者大小", 0.5, 2)
    };
  });

  const formationsInput = snapshot.formations;
  if (
    !Array.isArray(formationsInput) ||
    formationsInput.length === 0 ||
    formationsInput.length > RESTORE_LIMITS.formations
  ) {
    throw new ApiError(
      400,
      `復原資料必須包含 1 到 ${RESTORE_LIMITS.formations} 個隊形`
    );
  }
  const formationIds = new Set();
  const formations = formationsInput.map((input) => {
    if (!isPlainObject(input)) {
      throw new ApiError(400, "復原資料的隊形格式不正確");
    }
    const id = parseId(input.id, "隊形 ID");
    if (formationIds.has(id)) {
      throw new ApiError(400, "復原資料中的隊形 ID 重複");
    }
    formationIds.add(id);
    return {
      id,
      name: requiredText(input.name, "隊形名稱", 100),
      transitionSeconds: finiteNumber(
        input.transitionSeconds ?? 2,
        "過渡秒數",
        0,
        60
      ),
      positions: normalizePositions(
        input.positions ?? {},
        dancers,
        project.stageWidth,
        project.stageHeight,
        {},
        project.stageShape,
        project.stageFlipped
      ),
      annotations: normalizeAnnotations(
        input.annotations ?? [],
        project.stageWidth,
        project.stageHeight,
        project.stageShape,
        project.stageFlipped
      )
    };
  });

  assertRestoreIds(db, "teams", teams, projectId, "隊伍");
  assertRestoreIds(db, "dancers", dancers, projectId, "舞者");
  assertRestoreIds(db, "formations", formations, projectId, "隊形");

  return { project, teams, dancers, formations };
}

function assertRestoreIds(db, table, rows, projectId, label) {
  const statement = db.prepare(
    `SELECT 1 FROM ${table} WHERE id = ? AND project_id != ?`
  );
  for (const row of rows) {
    if (statement.get(row.id, projectId)) {
      throw new ApiError(409, `復原資料中的${label} ID 與其他專案衝突`);
    }
  }
}

function sanitizeFilename(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 80) || "formation-project";
}
