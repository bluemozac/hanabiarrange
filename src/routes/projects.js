const express = require("express");
const {
  parseId,
  requiredText,
  optionalText,
  finiteNumber
} = require("../http");
const {
  getProject,
  listProjects,
  normalizePositions,
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

    const create = db.transaction(() => {
      const project = db
        .prepare(
          `INSERT INTO projects (name, description, stage_width, stage_height)
           VALUES (?, ?, ?, ?)`
        )
        .run(name, description, stageWidth, stageHeight);
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

  router.get("/:projectId/export.pdf", async (request, response, next) => {
    try {
      const projectId = parseId(request.params.projectId, "專案 ID");
      const project = getProject(db, projectId);
      if (!project) {
        response.status(404).json({ error: "找不到舞碼專案" });
        return;
      }

      const pdf = await buildProjectPdf(project, {
        theme: request.query.theme === "dark" ? "dark" : "light"
      });
      const filename = `${sanitizeFilename(project.name)}.pdf`;
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

    const update = db.transaction(() => {
      db.prepare(
        `UPDATE projects
         SET name = ?, description = ?, stage_width = ?, stage_height = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(name, description, stageWidth, stageHeight, projectId);

      if (stageWidth !== current.stageWidth || stageHeight !== current.stageHeight) {
        const updateFormation = db.prepare(
          `UPDATE formations
           SET positions_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        );
        for (const formation of current.formations) {
          const positions = normalizePositions(
            formation.positions,
            current.dancers,
            stageWidth,
            stageHeight
          );
          updateFormation.run(JSON.stringify(positions), formation.id);
        }
      }
    });
    update();

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

function sanitizeFilename(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 80) || "formation-project";
}
