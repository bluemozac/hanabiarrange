const path = require("node:path");
const express = require("express");
const { ApiError } = require("./http");
const createProjectsRouter = require("./routes/projects");
const createDancersRouter = require("./routes/dancers");
const createFormationsRouter = require("./routes/formations");

function createApp(db) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", database: "connected" });
  });

  app.use("/api/projects", createProjectsRouter(db));
  app.use("/api/projects/:projectId/dancers", createDancersRouter(db));
  app.use("/api/projects/:projectId/formations", createFormationsRouter(db));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/api", (_request, _response, next) => {
    next(new ApiError(404, "API 路徑不存在"));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      response.status(400).json({ error: "JSON 格式不正確" });
      return;
    }

    if (error instanceof ApiError) {
      response.status(error.status).json({
        error: error.message,
        ...(error.details ? { details: error.details } : {})
      });
      return;
    }

    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      response.status(409).json({ error: "資料重複，請確認代號或名稱是否已存在" });
      return;
    }

    console.error(error);
    response.status(500).json({ error: "伺服器發生未預期錯誤" });
  });

  return app;
}

module.exports = { createApp };
