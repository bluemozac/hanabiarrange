export function captureProjectSnapshot(project) {
  if (!project) return null;
  return {
    project: {
      name: project.name,
      description: project.description ?? "",
      stageWidth: project.stageWidth,
      stageHeight: project.stageHeight,
      stageShape: project.stageShape,
      stageFlipped: Boolean(project.stageFlipped),
      defaultDancerScale: project.defaultDancerScale ?? 1
    },
    teams: (project.teams ?? []).map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color
    })),
    dancers: project.dancers.map((dancer) => ({
      id: dancer.id,
      teamId: dancer.teamId ?? null,
      code: dancer.code,
      name: dancer.name ?? "",
      color: dancer.color,
      shape: dancer.shape || "circle",
      sizeScale: dancer.sizeScale ?? 1
    })),
    formations: project.formations.map((formation) => ({
      id: formation.id,
      name: formation.name,
      transitionSeconds: formation.transitionSeconds,
      positions: Object.fromEntries(
        Object.entries(formation.positions ?? {}).map(([dancerId, position]) => [
          dancerId,
          { x: position.x, y: position.y }
        ])
      ),
      annotations: (formation.annotations ?? []).map((annotation) => ({
        id: annotation.id,
        text: annotation.text,
        x: annotation.x,
        y: annotation.y,
        color: annotation.color,
        fontSize: annotation.fontSize
      }))
    }))
  };
}

export class EditHistory {
  constructor(limit = 50) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get undoLabel() {
    return this.past.at(-1)?.label ?? "";
  }

  get redoLabel() {
    return this.future.at(-1)?.label ?? "";
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  record(snapshot, label) {
    if (!snapshot) return;
    this.past.push({ snapshot, label });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(currentSnapshot) {
    const entry = this.past.pop();
    if (!entry) return null;
    if (currentSnapshot) {
      this.future.push({ snapshot: currentSnapshot, label: entry.label });
    }
    return entry;
  }

  redo(currentSnapshot) {
    const entry = this.future.pop();
    if (!entry) return null;
    if (currentSnapshot) {
      this.past.push({ snapshot: currentSnapshot, label: entry.label });
    }
    return entry;
  }
}
