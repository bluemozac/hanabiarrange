async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    ...options
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `請求失敗 (${response.status})`);
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }

  return payload;
}

function jsonBody(value) {
  return JSON.stringify(value);
}

export const api = {
  listProjects() {
    return request("/api/projects");
  },

  getProject(projectId) {
    return request(`/api/projects/${projectId}`);
  },

  createProject(values) {
    return request("/api/projects", {
      method: "POST",
      body: jsonBody(values)
    });
  },

  updateProject(projectId, values) {
    return request(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: jsonBody(values)
    });
  },

  deleteProject(projectId) {
    return request(`/api/projects/${projectId}`, { method: "DELETE" });
  },

  createDancer(projectId, values) {
    return request(`/api/projects/${projectId}/dancers`, {
      method: "POST",
      body: jsonBody(values)
    });
  },

  updateDancer(projectId, dancerId, values) {
    return request(`/api/projects/${projectId}/dancers/${dancerId}`, {
      method: "PATCH",
      body: jsonBody(values)
    });
  },

  deleteDancer(projectId, dancerId) {
    return request(`/api/projects/${projectId}/dancers/${dancerId}`, {
      method: "DELETE"
    });
  },

  createFormation(projectId, values) {
    return request(`/api/projects/${projectId}/formations`, {
      method: "POST",
      body: jsonBody(values)
    });
  },

  reorderFormations(projectId, formationIds) {
    return request(`/api/projects/${projectId}/formations/reorder`, {
      method: "PUT",
      body: jsonBody({ formationIds })
    });
  },

  updateFormation(projectId, formationId, values) {
    return request(`/api/projects/${projectId}/formations/${formationId}`, {
      method: "PATCH",
      body: jsonBody(values)
    });
  },

  deleteFormation(projectId, formationId) {
    return request(`/api/projects/${projectId}/formations/${formationId}`, {
      method: "DELETE"
    });
  }
};
