const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/app");
const { createDatabase } = require("../src/database");

test("project, dancer and formation CRUD workflow", async (t) => {
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
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options
    });
    const payload = response.status === 204 ? null : await response.json();
    return { response, payload };
  };

  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.status, "ok");

  const pdfHealth = await request("/api/health/pdf");
  assert.equal(pdfHealth.response.status, 200);
  assert.equal(pdfHealth.payload.available, true);
  assert.equal(pdfHealth.payload.source, "bundled");

  const createdProject = await request("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "API Test Project",
      description: "Automated test",
      stageWidth: 100,
      stageHeight: 60
    })
  });
  assert.equal(createdProject.response.status, 201);
  const projectId = createdProject.payload.project.id;
  assert.equal(createdProject.payload.project.formations.length, 1);

  const firstDancer = await request(`/api/projects/${projectId}/dancers`, {
    method: "POST",
    body: JSON.stringify({ code: "A1", name: "Alice", color: "#f97316" })
  });
  assert.equal(firstDancer.response.status, 201);

  const secondDancer = await request(`/api/projects/${projectId}/dancers`, {
    method: "POST",
    body: JSON.stringify({ code: "B1", name: "Bella" })
  });
  assert.equal(secondDancer.response.status, 201);
  assert.equal(secondDancer.payload.dancer.color, "#f97316");

  const duplicateDancer = await request(`/api/projects/${projectId}/dancers`, {
    method: "POST",
    body: JSON.stringify({ code: "A1", name: "Duplicate", color: "#ef4444" })
  });
  assert.equal(duplicateDancer.response.status, 409);

  const projectAfterDancers = await request(`/api/projects/${projectId}`);
  const firstFormation = projectAfterDancers.payload.project.formations[0];
  assert.equal(projectAfterDancers.payload.project.dancers.length, 2);
  assert.equal(Object.keys(firstFormation.positions).length, 2);

  const newFormation = await request(`/api/projects/${projectId}/formations`, {
    method: "POST",
    body: JSON.stringify({
      name: "Line",
      transitionSeconds: 3.5,
      positions: {
        [firstDancer.payload.dancer.id]: { x: 20, y: 30 },
        [secondDancer.payload.dancer.id]: { x: 80, y: 30 }
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
  });
  assert.equal(newFormation.response.status, 201);
  assert.equal(newFormation.payload.formation.transitionSeconds, 3.5);
  assert.deepEqual(newFormation.payload.formation.annotations, [
    {
      id: "note-1",
      text: "Hold",
      x: 50,
      y: 10,
      color: "#f97316",
      fontSize: 16
    }
  ]);

  const formationId = newFormation.payload.formation.id;
  const updatedFormation = await request(
    `/api/projects/${projectId}/formations/${formationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        positions: {
          [firstDancer.payload.dancer.id]: { x: 900, y: -20 },
          [secondDancer.payload.dancer.id]: { x: 80, y: 30 }
        }
      })
    }
  );
  assert.equal(updatedFormation.response.status, 200);
  assert.deepEqual(updatedFormation.payload.formation.positions[firstDancer.payload.dancer.id], {
    x: 100,
    y: 0
  });

  const decimalFormation = await request(
    `/api/projects/${projectId}/formations/${formationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        positions: {
          [firstDancer.payload.dancer.id]: { x: 24.75, y: 21.55 },
          [secondDancer.payload.dancer.id]: { x: 80, y: 30 }
        }
      })
    }
  );
  assert.equal(decimalFormation.response.status, 200);
  assert.deepEqual(decimalFormation.payload.formation.positions[firstDancer.payload.dancer.id], {
    x: 24.75,
    y: 21.55
  });

  const updatedAnnotations = await request(
    `/api/projects/${projectId}/formations/${formationId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        annotations: [
          {
            id: "note-2",
            text: "第二拍轉身",
            x: 50,
            y: 8,
            color: "#0ea5e9",
            fontSize: 18
          }
        ]
      })
    }
  );
  assert.equal(updatedAnnotations.response.status, 200);
  assert.deepEqual(updatedAnnotations.payload.formation.annotations, [
    {
      id: "note-2",
      text: "第二拍轉身",
      x: 50,
      y: 8,
      color: "#0ea5e9",
      fontSize: 18
    }
  ]);

  const thirdFormation = await request(`/api/projects/${projectId}/formations`, {
    method: "POST",
    body: JSON.stringify({
      name: "Arc",
      transitionSeconds: 2.2,
      positions: decimalFormation.payload.formation.positions
    })
  });
  assert.equal(thirdFormation.response.status, 201);

  const reordered = await request(`/api/projects/${projectId}/formations/reorder`, {
    method: "PUT",
    body: JSON.stringify({
      formationIds: [
        thirdFormation.payload.formation.id,
        firstFormation.id,
        formationId
      ]
    })
  });
  assert.equal(reordered.response.status, 200);
  assert.deepEqual(
    reordered.payload.formations.map((formation) => formation.name),
    ["Arc", "第一個隊形", "Line"]
  );
  assert.deepEqual(
    reordered.payload.formations.map((formation) => formation.sequenceIndex),
    [0, 1, 2]
  );

  const invalidOrder = await request(`/api/projects/${projectId}/formations/reorder`, {
    method: "PUT",
    body: JSON.stringify({
      formationIds: [
        thirdFormation.payload.formation.id,
        thirdFormation.payload.formation.id,
        firstFormation.id
      ]
    })
  });
  assert.equal(invalidOrder.response.status, 400);

  const pdfResponse = await fetch(`${baseUrl}/api/projects/${projectId}/export.pdf?theme=dark`);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get("content-type"), /^application\/pdf/);
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdfBuffer.length > 5000);

  const simplePdfResponse = await fetch(
    `${baseUrl}/api/projects/${projectId}/export.pdf?theme=dark&mode=simple`
  );
  assert.equal(simplePdfResponse.status, 200);
  assert.match(simplePdfResponse.headers.get("content-type"), /^application\/pdf/);
  assert.match(simplePdfResponse.headers.get("content-disposition"), /simple\.pdf/);
  const simplePdfBuffer = Buffer.from(await simplePdfResponse.arrayBuffer());
  assert.equal(simplePdfBuffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(simplePdfBuffer.length < pdfBuffer.length);

  const deletedDancer = await request(
    `/api/projects/${projectId}/dancers/${secondDancer.payload.dancer.id}`,
    { method: "DELETE" }
  );
  assert.equal(deletedDancer.response.status, 204);

  const projectAfterDelete = await request(`/api/projects/${projectId}`);
  assert.equal(projectAfterDelete.payload.project.dancers.length, 1);
  for (const formation of projectAfterDelete.payload.project.formations) {
    assert.equal(Object.hasOwn(formation.positions, String(secondDancer.payload.dancer.id)), false);
  }

  const updatedProject = await request(`/api/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ stageWidth: 50, stageHeight: 50 })
  });
  assert.equal(updatedProject.response.status, 200);
  assert.equal(updatedProject.payload.project.stageWidth, 50);
  for (const formation of updatedProject.payload.project.formations) {
    for (const position of Object.values(formation.positions)) {
      assert.ok(position.x <= 50);
      assert.ok(position.y <= 50);
    }
  }

  const deletedProject = await request(`/api/projects/${projectId}`, { method: "DELETE" });
  assert.equal(deletedProject.response.status, 204);

  const projects = await request("/api/projects");
  assert.equal(projects.payload.projects.length, 0);
});
