const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { createDatabase } = require("../src/database");

function snapshotOf(project) {
  return {
    project: {
      name: project.name,
      description: project.description,
      stageWidth: project.stageWidth,
      stageHeight: project.stageHeight,
      stageShape: project.stageShape,
      stageFlipped: project.stageFlipped,
      defaultDancerScale: project.defaultDancerScale
    },
    teams: project.teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color
    })),
    dancers: project.dancers.map((dancer) => ({
      id: dancer.id,
      teamId: dancer.teamId,
      code: dancer.code,
      name: dancer.name,
      color: dancer.color,
      shape: dancer.shape,
      sizeScale: dancer.sizeScale
    })),
    formations: project.formations.map((formation) => ({
      id: formation.id,
      name: formation.name,
      transitionSeconds: formation.transitionSeconds,
      positions: formation.positions,
      annotations: formation.annotations
    }))
  };
}

test("project snapshot restore reverts edits and structural changes", async (t) => {
  const db = createDatabase(":memory:", { seed: false });
  const app = createApp(db);
  const server = app.listen(0);
  await once(server, "listening");
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  };

  const createdProject = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "Undo Project",
      stageWidth: 100,
      stageHeight: 60
    })
  });
  const projectId = createdProject.payload.project.id;

  const team = await request(`/api/projects/${projectId}/teams`, {
    method: "POST",
    body: JSON.stringify({ name: "Team A", color: "#0ea5e9" })
  });
  const teamId = team.payload.team.id;

  const dancers = [];
  for (const [code, x] of [
    ["A1", 20],
    ["B1", 80]
  ]) {
    const dancer = await request(`/api/projects/${projectId}/dancers`, {
      method: "POST",
      body: JSON.stringify({ code, name: `${code} dancer`, teamId })
    });
    dancers.push(dancer.payload.dancer);
  }

  const firstFormationId = createdProject.payload.project.formations[0].id;
  const formation = await request(
    `/api/projects/${projectId}/formations/${firstFormationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: "Opening",
        transitionSeconds: 2.5,
        positions: {
          [dancers[0].id]: { x: 20, y: 30 },
          [dancers[1].id]: { x: 80, y: 30 }
        },
        annotations: [
          {
            id: "note-1",
            text: "Hold",
            x: 50,
            y: 10,
            color: "#f97316",
            fontSize: 16
          }
        ]
      })
    }
  );
  assert.equal(formation.response.status, 200);

  const createdAt = await request(`/api/projects/${projectId}/formations`, {
    method: "POST",
    body: JSON.stringify({
      name: "Finale",
      transitionSeconds: 4,
      positions: {
        [dancers[0].id]: { x: 30, y: 45 },
        [dancers[1].id]: { x: 70, y: 45 }
      }
    })
  });
  assert.equal(createdAt.response.status, 201);

  const before = await request(`/api/projects/${projectId}`);
  const snapshot = snapshotOf(before.payload.project);
  const originalFormationIds = snapshot.formations.map((item) => item.id);

  // Mutate everything a normal edit session could touch.
  await request(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Changed Name", stageFlipped: true })
  });
  await request(`/api/projects/${projectId}/formations/${firstFormationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Changed",
      positions: {
        [dancers[0].id]: { x: 60, y: 50 },
        [dancers[1].id]: { x: 40, y: 50 }
      },
      annotations: []
    })
  });
  await request(`/api/projects/${projectId}/dancers/${dancers[1].id}`, {
    method: "DELETE"
  });
  await request(`/api/projects/${projectId}/teams/${teamId}`, {
    method: "DELETE"
  });
  await request(
    `/api/projects/${projectId}/formations/${createdAt.payload.formation.id}`,
    { method: "DELETE" }
  );
  await request(`/api/projects/${projectId}/formations/reorder`, {
    method: "PUT",
    body: JSON.stringify({ formationIds: [firstFormationId] })
  });

  const mutated = await request(`/api/projects/${projectId}`);
  assert.equal(mutated.payload.project.name, "Changed Name");
  assert.equal(mutated.payload.project.dancers.length, 1);
  assert.equal(mutated.payload.project.teams.length, 0);

  const restore = await request(`/api/projects/${projectId}/restore`, {
    method: "POST",
    body: JSON.stringify({ snapshot })
  });
  assert.equal(restore.response.status, 200);

  const restored = restore.payload.project;
  assert.equal(restored.name, "Undo Project");
  assert.equal(restored.stageFlipped, false);
  assert.deepEqual(
    restored.formations.map((item) => item.id),
    originalFormationIds
  );
  assert.deepEqual(
    restored.dancers.map((item) => item.code),
    ["A1", "B1"]
  );
  assert.deepEqual(
    restored.dancers.map((item) => item.id),
    snapshot.dancers.map((item) => item.id)
  );
  assert.equal(restored.teams.length, 1);
  assert.equal(restored.teams[0].id, teamId);
  assert.equal(restored.dancers[0].teamId, teamId);
  assert.deepEqual(
    restored.formations[0].positions,
    snapshot.formations[0].positions
  );
  assert.deepEqual(
    restored.formations[0].annotations,
    snapshot.formations[0].annotations
  );
  assert.equal(restored.formations[0].transitionSeconds, 2.5);

  const reread = await request(`/api/projects/${projectId}`);
  assert.deepEqual(reread.payload.project, restored);
});

test("project snapshot restore validates its payload", async (t) => {
  const db = createDatabase(":memory:", { seed: false });
  const app = createApp(db);
  const server = app.listen(0);
  await once(server, "listening");
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  };

  const project = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Validation" })
  });
  const projectId = project.payload.project.id;
  const formationId = project.payload.project.formations[0].id;

  const missingFormations = await request(
    `/api/projects/${projectId}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ snapshot: { formations: [] } })
    }
  );
  assert.equal(missingFormations.response.status, 400);

  const unknownTeam = await request(`/api/projects/${projectId}/restore`, {
    method: "POST",
    body: JSON.stringify({
      snapshot: {
        teams: [],
        dancers: [{ id: 9001, teamId: 555, code: "X1" }],
        formations: [{ id: formationId, name: "Only" }]
      }
    })
  });
  assert.equal(unknownTeam.response.status, 400);

  const duplicateCodes = await request(`/api/projects/${projectId}/restore`, {
    method: "POST",
    body: JSON.stringify({
      snapshot: {
        teams: [],
        dancers: [
          { id: 9001, code: "X1" },
          { id: 9002, code: "X1" }
        ],
        formations: [{ id: formationId, name: "Only" }]
      }
    })
  });
  assert.equal(duplicateCodes.response.status, 400);

  const otherProject = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Other" })
  });
  const otherProjectId = otherProject.payload.project.id;
  const otherFormationId = otherProject.payload.project.formations[0].id;

  const idCollision = await request(`/api/projects/${projectId}/restore`, {
    method: "POST",
    body: JSON.stringify({
      snapshot: {
        teams: [],
        dancers: [],
        formations: [{ id: otherFormationId, name: "Collision" }]
      }
    })
  });
  assert.equal(idCollision.response.status, 409);

  const stillThere = await request(`/api/projects/${projectId}`);
  assert.equal(stillThere.payload.project.name, "Validation");
  assert.equal(stillThere.payload.project.formations.length, 1);
  assert.equal(stillThere.payload.project.formations[0].id, formationId);
  assert.equal(
    (await request(`/api/projects/${otherProjectId}`)).payload.project
      .formations[0].id,
    otherFormationId
  );
});
