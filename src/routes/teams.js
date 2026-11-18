const express = require("express");
const {
  ApiError,
  parseId,
  requiredText,
  colorHex
} = require("../http");
const {
  getProjectRow,
  mapDancer,
  mapTeam,
  touchProject
} = require("../repository");

function createTeamsRouter(db) {
  const router = express.Router({ mergeParams: true });

  function requireProject(request) {
    const projectId = parseId(request.params.projectId, "專案 ID");
    const project = getProjectRow(db, projectId);
    if (!project) throw new ApiError(404, "找不到舞碼專案");
    return project;
  }

  function getTeams(projectId) {
    return db
      .prepare(
        `SELECT t.*,
          (SELECT COUNT(*) FROM dancers d WHERE d.team_id = t.id) AS member_count
         FROM teams t
         WHERE t.project_id = ?
         ORDER BY t.sort_order, t.id`
      )
      .all(projectId)
      .map(mapTeam);
  }

  router.get("/", (request, response) => {
    const project = requireProject(request);
    response.json({ teams: getTeams(project.id) });
  });

  router.post("/", (request, response) => {
    const project = requireProject(request);
    const name = requiredText(request.body?.name, "隊伍名稱", 60);
    const color = colorHex(request.body?.color ?? "#0ea5e9");
    const nextOrder = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM teams WHERE project_id = ?"
      )
      .get(project.id).next_order;

    const result = db
      .prepare(
        `INSERT INTO teams (project_id, name, color, sort_order)
         VALUES (?, ?, ?, ?)`
      )
      .run(project.id, name, color, nextOrder);
    touchProject(db, project.id);
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "teams-changed");
    response.status(201).json({
      team: mapTeam(
        db
          .prepare(
            `SELECT t.*, 0 AS member_count FROM teams t WHERE t.id = ?`
          )
          .get(Number(result.lastInsertRowid))
      )
    });
  });

  router.put("/reorder", (request, response) => {
    const project = requireProject(request);
    if (!Array.isArray(request.body?.teamIds)) {
      throw new ApiError(400, "teamIds 必須是隊伍 ID 陣列");
    }
    const teamIds = request.body.teamIds.map((id) => parseId(id, "隊伍 ID"));
    const current = db
      .prepare("SELECT id FROM teams WHERE project_id = ? ORDER BY sort_order, id")
      .all(project.id);
    const currentIds = new Set(current.map((team) => team.id));
    const uniqueIds = new Set(teamIds);
    if (
      teamIds.length !== current.length ||
      uniqueIds.size !== teamIds.length ||
      teamIds.some((id) => !currentIds.has(id))
    ) {
      throw new ApiError(400, "teamIds 必須完整且不重複包含所有隊伍");
    }

    const reorder = db.transaction(() => {
      const update = db.prepare(
        "UPDATE teams SET sort_order = ? WHERE id = ? AND project_id = ?"
      );
      teamIds.forEach((teamId, index) => update.run(-(index + 1), teamId, project.id));
      teamIds.forEach((teamId, index) => update.run(index, teamId, project.id));
      touchProject(db, project.id);
    });
    reorder();
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "teams-reordered");
    response.json({ teams: getTeams(project.id) });
  });

  router.patch("/:teamId", (request, response) => {
    const project = requireProject(request);
    const teamId = parseId(request.params.teamId, "隊伍 ID");
    const current = db
      .prepare("SELECT * FROM teams WHERE id = ? AND project_id = ?")
      .get(teamId, project.id);
    if (!current) throw new ApiError(404, "找不到隊伍");
    const name =
      request.body?.name === undefined
        ? current.name
        : requiredText(request.body.name, "隊伍名稱", 60);
    const color =
      request.body?.color === undefined ? current.color : colorHex(request.body.color);
    db.prepare(
      `UPDATE teams
       SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(name, color, teamId);
    touchProject(db, project.id);
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "teams-changed");
    response.json({
      team: getTeams(project.id).find((team) => team.id === teamId)
    });
  });

  router.put("/:teamId/members", (request, response) => {
    const project = requireProject(request);
    const teamId = parseId(request.params.teamId, "隊伍 ID");
    const team = db
      .prepare("SELECT id FROM teams WHERE id = ? AND project_id = ?")
      .get(teamId, project.id);
    if (!team) throw new ApiError(404, "找不到隊伍");
    if (!Array.isArray(request.body?.dancerIds)) {
      throw new ApiError(400, "dancerIds 必須是舞者 ID 陣列");
    }
    const dancerIds = request.body.dancerIds.map((id) => parseId(id, "舞者 ID"));
    if (new Set(dancerIds).size !== dancerIds.length) {
      throw new ApiError(400, "舞者 ID 不可重複");
    }
    const projectDancerIds = new Set(
      db
        .prepare("SELECT id FROM dancers WHERE project_id = ?")
        .all(project.id)
        .map((dancer) => dancer.id)
    );
    if (dancerIds.some((id) => !projectDancerIds.has(id))) {
      throw new ApiError(400, "包含不屬於此專案的舞者");
    }

    const updateMembers = db.transaction(() => {
      db.prepare(
        "UPDATE dancers SET team_id = NULL WHERE project_id = ? AND team_id = ?"
      ).run(project.id, teamId);
      const assign = db.prepare(
        "UPDATE dancers SET team_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      );
      dancerIds.forEach((dancerId) => assign.run(teamId, dancerId));
      touchProject(db, project.id);
    });
    updateMembers();
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "team-members");
    response.json({
      teams: getTeams(project.id),
      dancers: db
        .prepare("SELECT * FROM dancers WHERE project_id = ? ORDER BY sort_order, id")
        .all(project.id)
        .map(mapDancer)
    });
  });

  router.delete("/:teamId", (request, response) => {
    const project = requireProject(request);
    const teamId = parseId(request.params.teamId, "隊伍 ID");
    const result = db
      .prepare("DELETE FROM teams WHERE id = ? AND project_id = ?")
      .run(teamId, project.id);
    if (result.changes === 0) throw new ApiError(404, "找不到隊伍");

    const remaining = db
      .prepare("SELECT id FROM teams WHERE project_id = ? ORDER BY sort_order, id")
      .all(project.id);
    const updateOrder = db.prepare("UPDATE teams SET sort_order = ? WHERE id = ?");
    remaining.forEach((team, index) => updateOrder.run(index, team.id));
    touchProject(db, project.id);
    request.app.locals.realtime?.broadcastProjectChanged(project.id, "teams-changed");
    response.status(204).end();
  });

  return router;
}

module.exports = createTeamsRouter;
