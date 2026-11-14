const express = require("express");
const {
  ApiError,
  parseId,
  requiredText,
  optionalText,
  colorHex,
  finiteNumber
} = require("../http");
const {
  getProjectRow,
  mapDancer,
  normalizePositions,
  touchProject
} = require("../repository");

function createDancersRouter(db) {
  const router = express.Router({ mergeParams: true });

  function requireProject(request) {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const project = getProjectRow(db, projectId);
    if (!project) throw new ApiError(404, "找不到舞碼專案");
    return project;
  }

  router.get("/", (request, response) => {
    const project = requireProject(request);
    const dancers = db
      .prepare("SELECT * FROM dancers WHERE project_id = ? ORDER BY sort_order, id")
      .all(project.id)
      .map(mapDancer);
    response.json({ dancers });
  });

  router.post("/", (request, response) => {
    const project = requireProject(request);
    const code = requiredText(request.body?.code, "舞者代號", 20);
    const name = optionalText(request.body?.name, "舞者名稱", 80) ?? "";
    const color = colorHex(request.body?.color ?? "#f97316");
    const sizeScale = finiteNumber(
      request.body?.sizeScale ?? project.default_dancer_scale ?? 1,
      "舞者大小",
      0.5,
      2
    );

    const create = db.transaction(() => {
      const nextOrder = db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM dancers WHERE project_id = ?"
        )
        .get(project.id).next_order;
      const result = db
        .prepare(
          `INSERT INTO dancers (project_id, code, name, color, size_scale, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(project.id, code, name, color, sizeScale, nextOrder);
      const dancerId = Number(result.lastInsertRowid);

      const dancers = db
        .prepare("SELECT * FROM dancers WHERE project_id = ? ORDER BY sort_order, id")
        .all(project.id)
        .map(mapDancer);
      const formations = db
        .prepare("SELECT id, positions_json FROM formations WHERE project_id = ?")
        .all(project.id);
      const updatePositions = db.prepare(
        `UPDATE formations
         SET positions_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );
      for (const formation of formations) {
        const current = JSON.parse(formation.positions_json);
        const positions = normalizePositions(
          current,
          dancers,
          project.stage_width,
          project.stage_height,
          current,
          project.stage_shape,
          Boolean(project.stage_flipped)
        );
        updatePositions.run(JSON.stringify(positions), formation.id);
      }
      touchProject(db, project.id);
      return dancerId;
    });

    const dancerId = create();
    const dancer = db
      .prepare("SELECT * FROM dancers WHERE id = ? AND project_id = ?")
      .get(dancerId, project.id);
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "dancers-changed");
    response.status(201).json({ dancer: mapDancer(dancer) });
  });

  router.patch("/:dancerId", (request, response) => {
    const project = requireProject(request);
    const dancerId = parseId(request.params.dancerId, "舞者 ID");
    const current = db
      .prepare("SELECT * FROM dancers WHERE id = ? AND project_id = ?")
      .get(dancerId, project.id);
    if (!current) throw new ApiError(404, "找不到舞者");

    const code = request.body?.code === undefined ? current.code : requiredText(request.body.code, "舞者代號", 20);
    const name =
      request.body?.name === undefined ? current.name : optionalText(request.body.name, "舞者名稱", 80);
    const color = request.body?.color === undefined ? current.color : colorHex(request.body.color);
    const sizeScale =
      request.body?.sizeScale === undefined
        ? current.size_scale
        : finiteNumber(request.body.sizeScale, "舞者大小", 0.5, 2);

    db.prepare(
      `UPDATE dancers
       SET code = ?, name = ?, color = ?, size_scale = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(code, name, color, sizeScale, dancerId);
    touchProject(db, project.id);
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "dancers-changed");

    response.json({
      dancer: mapDancer(db.prepare("SELECT * FROM dancers WHERE id = ?").get(dancerId))
    });
  });

  router.delete("/:dancerId", (request, response) => {
    const project = requireProject(request);
    const dancerId = parseId(request.params.dancerId, "舞者 ID");
    const current = db
      .prepare("SELECT id FROM dancers WHERE id = ? AND project_id = ?")
      .get(dancerId, project.id);
    if (!current) throw new ApiError(404, "找不到舞者");

    const remove = db.transaction(() => {
      db.prepare("DELETE FROM dancers WHERE id = ?").run(dancerId);
      const formations = db
        .prepare("SELECT id, positions_json FROM formations WHERE project_id = ?")
        .all(project.id);
      const updatePositions = db.prepare(
        `UPDATE formations
         SET positions_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      );
      for (const formation of formations) {
        const positions = JSON.parse(formation.positions_json);
        delete positions[String(dancerId)];
        updatePositions.run(JSON.stringify(positions), formation.id);
      }
      touchProject(db, project.id);
    });
    remove();
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "dancers-changed");
    response.status(204).end();
  });

  return router;
}

module.exports = createDancersRouter;
