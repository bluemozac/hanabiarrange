const express = require("express");
const { ApiError, parseId, requiredText, finiteNumber } = require("../http");
const {
  getProjectRow,
  mapDancer,
  mapFormation,
  normalizePositions,
  touchProject
} = require("../repository");

function createFormationsRouter(db) {
  const router = express.Router({ mergeParams: true });

  function requireProject(request) {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const project = getProjectRow(db, projectId);
    if (!project) throw new ApiError(404, "找不到舞碼專案");
    return project;
  }

  function getDancers(projectId) {
    return db
      .prepare("SELECT * FROM dancers WHERE project_id = ? ORDER BY sort_order, id")
      .all(projectId)
      .map(mapDancer);
  }

  router.get("/", (request, response) => {
    const project = requireProject(request);
    const formations = db
      .prepare("SELECT * FROM formations WHERE project_id = ? ORDER BY sequence_index, id")
      .all(project.id)
      .map(mapFormation);
    response.json({ formations });
  });

  router.post("/", (request, response) => {
    const project = requireProject(request);
    const nextIndex = db
      .prepare(
        "SELECT COALESCE(MAX(sequence_index), -1) + 1 AS next_index FROM formations WHERE project_id = ?"
      )
      .get(project.id).next_index;
    const name = requiredText(request.body?.name ?? `隊形 ${nextIndex + 1}`, "隊形名稱", 100);
    const transitionSeconds = finiteNumber(
      request.body?.transitionSeconds ?? 2,
      "過渡秒數",
      0,
      60
    );
    const dancers = getDancers(project.id);
    const positions = normalizePositions(
      request.body?.positions,
      dancers,
      project.stage_width,
      project.stage_height
    );

    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO formations
             (project_id, name, sequence_index, transition_seconds, positions_json)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(project.id, name, nextIndex, transitionSeconds, JSON.stringify(positions));
      touchProject(db, project.id);
      return Number(result.lastInsertRowid);
    });

    const formationId = create();
    response.status(201).json({
      formation: mapFormation(db.prepare("SELECT * FROM formations WHERE id = ?").get(formationId))
    });
  });

  router.patch("/:formationId", (request, response) => {
    const project = requireProject(request);
    const formationId = parseId(request.params.formationId, "隊形 ID");
    const current = db
      .prepare("SELECT * FROM formations WHERE id = ? AND project_id = ?")
      .get(formationId, project.id);
    if (!current) throw new ApiError(404, "找不到隊形");

    const name =
      request.body?.name === undefined
        ? current.name
        : requiredText(request.body.name, "隊形名稱", 100);
    const transitionSeconds =
      request.body?.transitionSeconds === undefined
        ? current.transition_seconds
        : finiteNumber(request.body.transitionSeconds, "過渡秒數", 0, 60);
    let positions = JSON.parse(current.positions_json);
    if (request.body?.positions !== undefined) {
      positions = normalizePositions(
        request.body.positions,
        getDancers(project.id),
        project.stage_width,
        project.stage_height,
        positions
      );
    }

    db.prepare(
      `UPDATE formations
       SET name = ?, transition_seconds = ?, positions_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(name, transitionSeconds, JSON.stringify(positions), formationId);
    touchProject(db, project.id);

    response.json({
      formation: mapFormation(
        db.prepare("SELECT * FROM formations WHERE id = ?").get(formationId)
      )
    });
  });

  router.delete("/:formationId", (request, response) => {
    const project = requireProject(request);
    const formationId = parseId(request.params.formationId, "隊形 ID");
    const formation = db
      .prepare("SELECT * FROM formations WHERE id = ? AND project_id = ?")
      .get(formationId, project.id);
    if (!formation) throw new ApiError(404, "找不到隊形");

    const count = db
      .prepare("SELECT COUNT(*) AS count FROM formations WHERE project_id = ?")
      .get(project.id).count;
    if (count <= 1) {
      throw new ApiError(409, "專案至少需要保留一個隊形");
    }

    const remove = db.transaction(() => {
      db.prepare("DELETE FROM formations WHERE id = ?").run(formationId);
      const remaining = db
        .prepare("SELECT id FROM formations WHERE project_id = ? ORDER BY sequence_index, id")
        .all(project.id);
      const updateSequence = db.prepare(
        "UPDATE formations SET sequence_index = ? WHERE id = ?"
      );
      remaining.forEach((item, index) => updateSequence.run(index, item.id));
      touchProject(db, project.id);
    });
    remove();
    response.status(204).end();
  });

  return router;
}

module.exports = createFormationsRouter;
