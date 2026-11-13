import { api } from "./api.js";
import { StageCanvas } from "./stage.js";

const $ = (selector) => document.querySelector(selector);
const DEFAULT_DANCER_COLOR = "#f97316";
const STAGE_THEME_KEY = "hanabi-stage-theme";
const STAGE_GRID_KEY = "hanabi-stage-grid";
const STAGE_SIZE_KEY = "hanabi-stage-size";
const mobileLayout = window.matchMedia("(max-width: 720px)");

const elements = {
  projectSelect: $("#projectSelect"),
  projectDescription: $("#projectDescription"),
  projectTitle: $("#projectTitle"),
  dancerCount: $("#dancerCount"),
  dancerList: $("#dancerList"),
  connectionLabel: $("#connectionLabel"),
  saveState: $("#saveState"),
  stageFormationName: $("#stageFormationName"),
  stageDimensions: $("#stageDimensions"),
  stagePanel: $("#stagePanel"),
  stageCanvas: $("#stageCanvas"),
  canvasFrame: $("#canvasFrame"),
  addTextButton: $("#addTextButton"),
  stageGridButton: $("#stageGridButton"),
  stageThemeButton: $("#stageThemeButton"),
  stageThemeIcon: $("#stageThemeIcon"),
  stageResizeHandle: $("#stageResizeHandle"),
  canvasStageArea: $("#canvasStageArea"),
  emptyStage: $("#emptyStage"),
  playButton: $("#playButton"),
  previousFormationButton: $("#previousFormationButton"),
  nextFormationButton: $("#nextFormationButton"),
  transitionDirection: $("#transitionDirection"),
  transitionTime: $("#transitionTime"),
  formationForm: $("#formationForm"),
  formationNameInput: $("#formationNameInput"),
  transitionInput: $("#transitionInput"),
  formationSequence: $("#formationSequence"),
  deleteFormationButton: $("#deleteFormationButton"),
  dancerForm: $("#dancerForm"),
  selectedDancerTitle: $("#selectedDancerTitle"),
  dancerCodeInput: $("#dancerCodeInput"),
  dancerNameInput: $("#dancerNameInput"),
  dancerColorInput: $("#dancerColorInput"),
  dancerXInput: $("#dancerXInput"),
  dancerYInput: $("#dancerYInput"),
  saveDancerButton: $("#saveDancerButton"),
  deleteDancerButton: $("#deleteDancerButton"),
  formationCount: $("#formationCount"),
  totalDuration: $("#totalDuration"),
  formationTrack: $("#formationTrack"),
  inspectorPanel: $("#inspectorPanel"),
  inspectorToggle: $("#inspectorToggle"),
  inspectorToggleSummary: $("#inspectorToggleSummary"),
  timelinePanel: $("#timelinePanel"),
  timelineToggle: $("#timelineToggle"),
  timelineToggleSummary: $("#timelineToggleSummary"),
  projectDialog: $("#projectDialog"),
  projectForm: $("#projectForm"),
  projectIdInput: $("#projectIdInput"),
  projectDialogTitle: $("#projectDialogTitle"),
  projectNameInput: $("#projectNameInput"),
  projectDescriptionInput: $("#projectDescriptionInput"),
  stageRatioSelect: $("#stageRatioSelect"),
  stageWidthInput: $("#stageWidthInput"),
  stageHeightInput: $("#stageHeightInput"),
  dancerDialog: $("#dancerDialog"),
  dancerDialogForm: $("#dancerDialogForm"),
  newDancerCode: $("#newDancerCode"),
  newDancerName: $("#newDancerName"),
  newDancerColor: $("#newDancerColor"),
  exportPdfButton: $("#exportPdfButton"),
  duplicateProjectButton: $("#duplicateProjectButton"),
  exportDialog: $("#exportDialog"),
  exportForm: $("#exportForm"),
  annotationDialog: $("#annotationDialog"),
  annotationForm: $("#annotationForm"),
  annotationDialogTitle: $("#annotationDialogTitle"),
  annotationIdInput: $("#annotationIdInput"),
  annotationXInput: $("#annotationXInput"),
  annotationYInput: $("#annotationYInput"),
  annotationTextInput: $("#annotationTextInput"),
  annotationColorInput: $("#annotationColorInput"),
  annotationFontSizeInput: $("#annotationFontSizeInput"),
  deleteAnnotationButton: $("#deleteAnnotationButton"),
  toastRegion: $("#toastRegion"),
  loadingScreen: $("#loadingScreen")
};

const state = {
  projects: [],
  project: null,
  selectedFormationId: null,
  selectedDancerId: null,
  selectedAnnotationId: null,
  isPlaying: false,
  stageTheme: readPreference(STAGE_THEME_KEY, "light"),
  gridVisible: readPreference(STAGE_GRID_KEY, "true") !== "false"
};

let formationSaveTimer = null;
let pendingFormationSaveId = null;
let stageResizeState = null;
let formationDragState = null;
let annotationSaveTimer = null;

const stage = new StageCanvas(elements.stageCanvas, {
  onSelect: (dancerId) => selectDancer(dancerId),
  onPositionChange: (dancerId, position) => handlePositionChange(dancerId, position),
  onPositionCommit: (dancerId, position) => saveDancerPosition(dancerId, position),
  onAnnotationPlace: (position) => openNewAnnotationDialog(position),
  onAnnotationClick: (annotationId) => openAnnotationEditor(annotationId),
  onAnnotationPositionChange: (annotationId, position) =>
    handleAnnotationPositionChange(annotationId, position),
  onAnnotationPositionCommit: (annotationId, position) =>
    handleAnnotationPositionCommit(annotationId, position),
  onPageScroll: (deltaY) => window.scrollBy(0, -deltaY),
  onMobileStageGesture: (gesture) => handleMobileStageGesture(gesture),
  onMobileStageGestureStart: () =>
    elements.canvasStageArea.classList.add("is-panning"),
  onMobileStageGestureEnd: () => finishMobileStageGesture(),
  onAnimationComplete: (formationId) => finishPlayback(formationId)
});

function selectedFormation() {
  return state.project?.formations.find((formation) => formation.id === state.selectedFormationId) ?? null;
}

function selectedDancer() {
  return state.project?.dancers.find((dancer) => dancer.id === state.selectedDancerId) ?? null;
}

async function init() {
  bindEvents();
  initializeMobilePanels();
  applyStageAppearance();
  restoreStageSize();
  try {
    const payload = await api.listProjects();
    state.projects = payload.projects;
    renderProjectSelect();
    if (state.projects.length > 0) {
      await loadProject(state.projects[0].id);
    } else {
      renderAll();
    }
  } catch (error) {
    showError(error);
    elements.connectionLabel.textContent = "資料庫連線失敗";
  } finally {
    elements.loadingScreen.classList.add("is-hidden");
  }
}

function bindEvents() {
  elements.projectSelect.addEventListener("change", () => {
    const projectId = Number(elements.projectSelect.value);
    if (projectId) loadProject(projectId);
  });

  $("#newProjectButton").addEventListener("click", () => openProjectDialog());
  $("#editProjectButton").addEventListener("click", () => {
    if (state.project) openProjectDialog(state.project);
  });
  $("#deleteProjectButton").addEventListener("click", deleteProject);
  elements.duplicateProjectButton.addEventListener("click", duplicateCurrentProject);
  $("#newDancerButton").addEventListener("click", openDancerDialog);
  $("#newFormationButton").addEventListener("click", createFormationFromCurrent);
  elements.exportPdfButton.addEventListener("click", openExportDialog);
  elements.exportForm.addEventListener("submit", submitExportForm);
  elements.addTextButton.addEventListener("click", toggleAnnotationPlacement);
  elements.annotationForm.addEventListener("submit", submitAnnotationForm);
  elements.deleteAnnotationButton.addEventListener("click", deleteSelectedAnnotation);
  elements.stageThemeButton.addEventListener("click", toggleStageTheme);
  elements.stageGridButton.addEventListener("click", toggleStageGrid);
  elements.stageResizeHandle.addEventListener("pointerdown", beginStageResize);
  elements.stageResizeHandle.addEventListener("pointermove", moveStageResize);
  elements.stageResizeHandle.addEventListener("pointerup", endStageResize);
  elements.stageResizeHandle.addEventListener("pointercancel", endStageResize);
  elements.stageResizeHandle.addEventListener("dblclick", resetStageSize);
  window.addEventListener("resize", clampStageFrame);
  mobileLayout.addEventListener("change", initializeMobilePanels);
  elements.inspectorToggle.addEventListener("click", () => toggleMobilePanel("inspector"));
  elements.timelineToggle.addEventListener("click", () => toggleMobilePanel("timeline"));

  elements.playButton.addEventListener("click", playCurrentTransition);
  elements.previousFormationButton.addEventListener("click", () => stepFormation(-1));
  elements.nextFormationButton.addEventListener("click", () => stepFormation(1));

  elements.dancerList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-dancer-id]");
    if (item) selectDancer(Number(item.dataset.dancerId));
  });

  elements.formationTrack.addEventListener("click", (event) => {
    if (event.target.closest("[data-drag-formation-id]")) return;
    const card = event.target.closest("[data-formation-id]");
    if (card) selectFormation(Number(card.dataset.formationId));
  });
  elements.formationTrack.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-formation-id]");
    if (!card) return;
    event.preventDefault();
    selectFormation(Number(card.dataset.formationId));
  });
  elements.formationTrack.addEventListener("pointerdown", beginFormationDrag);
  elements.formationTrack.addEventListener("pointermove", moveFormationDrag);
  elements.formationTrack.addEventListener("pointerup", endFormationDrag);
  elements.formationTrack.addEventListener("pointercancel", cancelFormationDrag);

  elements.projectForm.addEventListener("submit", submitProjectForm);
  elements.stageRatioSelect.addEventListener("change", applyRatioPreset);
  elements.stageWidthInput.addEventListener("input", detectCustomRatio);
  elements.stageHeightInput.addEventListener("input", detectCustomRatio);

  elements.dancerDialogForm.addEventListener("submit", submitDancerForm);
  elements.dancerForm.addEventListener("submit", submitDancerEdit);
  elements.deleteDancerButton.addEventListener("click", deleteSelectedDancer);
  elements.formationForm.addEventListener("submit", submitFormationEdit);
  elements.deleteFormationButton.addEventListener("click", deleteSelectedFormation);

  elements.dancerXInput.addEventListener("change", updateDancerFromCoordinates);
  elements.dancerYInput.addEventListener("change", updateDancerFromCoordinates);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.closeDialog).close();
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function loadProject(projectId, preferredFormationId = null, preferredDancerId = null) {
  try {
    const payload = await api.getProject(projectId);
    state.project = payload.project;
    state.selectedFormationId =
      state.project.formations.find((formation) => formation.id === preferredFormationId)?.id ??
      state.project.formations[0]?.id ??
      null;
    state.selectedDancerId =
      state.project.dancers.find((dancer) => dancer.id === preferredDancerId)?.id ?? null;
    state.selectedAnnotationId = null;
    state.isPlaying = false;
    setAnnotationPlacement(false);
    renderAll();
    stage.setProject(state.project);
    stage.setSelectedDancer(state.selectedDancerId);
    stage.setSelectedAnnotation(null);
    stage.setFormation(selectedFormation());
    setSaveState("saved", "已同步");
  } catch (error) {
    showError(error);
  }
}

async function refreshProjects(preferredProjectId = state.project?.id) {
  const payload = await api.listProjects();
  state.projects = payload.projects;
  renderProjectSelect(preferredProjectId);
}

function renderAll() {
  renderProjectSelect(state.project?.id);
  renderProjectMeta();
  renderDancerList();
  renderFormationTrack();
  renderFormationInspector();
  renderDancerInspector();
  renderTransport();
  renderStats();
  updateEmptyState();
}

function renderProjectSelect(preferredId = state.project?.id) {
  elements.projectSelect.innerHTML = state.projects.length
    ? state.projects
        .map(
          (project) =>
            `<option value="${project.id}">${escapeHtml(project.name)}</option>`
        )
        .join("")
    : '<option value="">尚無專案</option>';
  elements.projectSelect.disabled = state.projects.length === 0;
  if (preferredId) elements.projectSelect.value = String(preferredId);
}

function renderProjectMeta() {
  const project = state.project;
  elements.projectTitle.textContent = project?.name ?? "Hanabi Stage";
  elements.projectDescription.textContent =
    project?.description || (project ? "尚未填寫專案說明" : "建立舞碼專案以開始編排");
  elements.dancerCount.textContent = String(project?.dancers.length ?? 0);
  elements.stageDimensions.textContent = project
    ? `${formatNumber(project.stageWidth)} × ${formatNumber(project.stageHeight)}`
    : "-- × --";

  $("#editProjectButton").disabled = !project;
  $("#deleteProjectButton").disabled = !project;
  elements.duplicateProjectButton.disabled = !project;
  $("#newDancerButton").disabled = !project;
  elements.exportPdfButton.disabled = !project;
}

function renderDancerList() {
  const project = state.project;
  if (!project || project.dancers.length === 0) {
    elements.dancerList.innerHTML =
      '<p class="dancer-name" style="padding:8px 4px">尚未新增舞者</p>';
    return;
  }

  const formation = selectedFormation();
  elements.dancerList.innerHTML = project.dancers
    .map((dancer) => {
      const position = formation?.positions[String(dancer.id)];
      return `
        <button class="dancer-item ${dancer.id === state.selectedDancerId ? "is-selected" : ""}"
          type="button" data-dancer-id="${dancer.id}">
          <span class="dancer-swatch" style="background:${safeColor(dancer.color)}"></span>
          <span class="dancer-copy">
            <span class="dancer-code">${escapeHtml(dancer.code)}</span>
            <span class="dancer-name">${escapeHtml(dancer.name || "未命名舞者")}</span>
          </span>
          <span class="dancer-position">${position ? `${formatNumber(position.x)},${formatNumber(position.y)}` : "--"}</span>
        </button>
      `;
    })
    .join("");
}

function renderFormationTrack() {
  const formations = state.project?.formations ?? [];
  if (formations.length === 0) {
    elements.formationTrack.innerHTML = '<span class="dancer-name">尚未建立隊形</span>';
    return;
  }

  elements.formationTrack.innerHTML = formations
    .map(
      (formation) => `
        <div class="formation-card ${formation.id === state.selectedFormationId ? "is-selected" : ""}"
          role="button" tabindex="0" data-formation-id="${formation.id}">
          <span class="formation-number">${String(formation.sequenceIndex + 1).padStart(2, "0")}</span>
          <span class="formation-card-copy">
            <span class="formation-card-name">${escapeHtml(formation.name)}</span>
            <span class="formation-card-time">${formation.transitionSeconds.toFixed(1)}s transition</span>
          </span>
          <button class="formation-drag-handle" type="button"
            data-drag-formation-id="${formation.id}" title="拖曳調整隊形順序" aria-label="拖曳調整 ${escapeHtml(formation.name)} 的順序">
            <svg><use href="#icon-grip"></use></svg>
          </button>
        </div>
      `
    )
    .join("");
}

function renderFormationInspector() {
  const formation = selectedFormation();
  const controls = elements.formationForm.querySelectorAll("input, button");
  controls.forEach((control) => {
    control.disabled = !formation;
  });
  elements.deleteFormationButton.disabled =
    !formation || (state.project?.formations.length ?? 0) <= 1;

  if (!formation) {
    elements.formationNameInput.value = "";
    elements.transitionInput.value = "";
    elements.formationSequence.textContent = "--";
    return;
  }

  elements.formationNameInput.value = formation.name;
  elements.transitionInput.value = formation.transitionSeconds;
  elements.formationSequence.textContent = String(formation.sequenceIndex + 1).padStart(2, "0");
}

function renderDancerInspector() {
  const dancer = selectedDancer();
  const formation = selectedFormation();
  const fields = [
    elements.dancerCodeInput,
    elements.dancerNameInput,
    elements.dancerColorInput,
    elements.dancerXInput,
    elements.dancerYInput,
    elements.saveDancerButton
  ];
  fields.forEach((field) => {
    field.disabled = !dancer;
  });
  elements.deleteDancerButton.disabled = !dancer;

  if (!dancer) {
    elements.selectedDancerTitle.textContent = "未選取舞者";
    elements.dancerCodeInput.value = "";
    elements.dancerNameInput.value = "";
    elements.dancerColorInput.value = "#f97316";
    elements.dancerXInput.value = "";
    elements.dancerYInput.value = "";
    return;
  }

  const position = formation?.positions[String(dancer.id)] ?? { x: 0, y: 0 };
  elements.selectedDancerTitle.textContent = dancer.name || `舞者 ${dancer.code}`;
  elements.dancerCodeInput.value = dancer.code;
  elements.dancerNameInput.value = dancer.name;
  elements.dancerColorInput.value = safeColor(dancer.color);
  elements.dancerXInput.max = state.project.stageWidth;
  elements.dancerYInput.max = state.project.stageHeight;
  elements.dancerXInput.value = formatNumber(position.x);
  elements.dancerYInput.value = formatNumber(position.y);
}

function renderTransport() {
  const formations = state.project?.formations ?? [];
  const index = formations.findIndex((formation) => formation.id === state.selectedFormationId);
  const current = formations[index];
  const next = formations.length > 1 ? formations[(index + 1) % formations.length] : null;

  elements.stageFormationName.textContent = current?.name ?? "尚未選擇隊形";
  elements.playButton.disabled = !current || !next || state.isPlaying;
  elements.previousFormationButton.disabled = formations.length <= 1 || state.isPlaying;
  elements.nextFormationButton.disabled = formations.length <= 1 || state.isPlaying;
  elements.playButton.querySelector("span").textContent = state.isPlaying ? "播放中..." : "播放走位";

  if (current && next) {
    elements.transitionDirection.textContent = `${current.name} → ${next.name}`;
    elements.transitionTime.textContent = `${next.transitionSeconds.toFixed(1)}s`;
  } else {
    elements.transitionDirection.textContent = "目前隊形";
    elements.transitionTime.textContent = `${current?.transitionSeconds.toFixed(1) ?? "0.0"}s`;
  }
}

function renderStats() {
  const formations = state.project?.formations ?? [];
  const totalDuration = formations
    .reduce((total, formation) => total + formation.transitionSeconds, 0)
    .toFixed(1);
  elements.formationCount.textContent = String(formations.length);
  elements.totalDuration.textContent = `${totalDuration}s`;
  const formation = selectedFormation();
  elements.inspectorToggleSummary.textContent = formation
    ? `${formation.name} · ${state.project?.dancers.length ?? 0} 位舞者`
    : "尚未選擇隊形";
  elements.timelineToggleSummary.textContent =
    `${formations.length} 個隊形 · ${totalDuration} 秒`;
}

function updateEmptyState() {
  const formation = selectedFormation();
  elements.emptyStage.hidden = Boolean(formation);
}

function selectDancer(dancerId) {
  if (state.isPlaying) return;
  state.selectedAnnotationId = null;
  stage.setSelectedAnnotation(null);
  state.selectedDancerId =
    state.project?.dancers.some((dancer) => dancer.id === dancerId) ? dancerId : null;
  if (dancerId && mobileLayout.matches) {
    setMobilePanelExpanded("inspector", true);
    setMobilePanelExpanded("timeline", false);
  }
  stage.setSelectedDancer(state.selectedDancerId);
  renderDancerList();
  renderDancerInspector();
}

function toggleAnnotationPlacement() {
  const formation = selectedFormation();
  if (!formation) {
    showToast("請先選擇一個隊形");
    return;
  }
  const active = !elements.addTextButton.classList.contains("is-active");
  setAnnotationPlacement(active);
  if (active) {
    state.selectedAnnotationId = null;
    stage.setSelectedAnnotation(null);
    showToast("點擊舞台放置文字注解");
  }
}

function setAnnotationPlacement(active) {
  stage.setTextPlacementMode(active);
  elements.addTextButton.classList.toggle("is-active", active);
  elements.addTextButton.setAttribute("aria-pressed", String(active));
}

function openNewAnnotationDialog(position) {
  const formation = selectedFormation();
  if (!formation) return;
  setAnnotationPlacement(false);
  elements.annotationForm.reset();
  elements.annotationIdInput.value = "";
  elements.annotationXInput.value = position.x;
  elements.annotationYInput.value = position.y;
  elements.annotationDialogTitle.textContent = "新增文字注解";
  elements.annotationColorInput.value = "#eb5e35";
  elements.annotationFontSizeInput.value = "14";
  elements.deleteAnnotationButton.hidden = true;
  elements.annotationDialog.showModal();
  elements.annotationTextInput.focus();
}

function openAnnotationEditor(annotationId) {
  const formation = selectedFormation();
  const annotation = formation?.annotations.find((item) => item.id === annotationId);
  if (!annotation) return;
  setAnnotationPlacement(false);
  state.selectedAnnotationId = annotation.id;
  stage.setSelectedAnnotation(annotation.id);
  elements.annotationForm.reset();
  elements.annotationIdInput.value = annotation.id;
  elements.annotationXInput.value = annotation.x;
  elements.annotationYInput.value = annotation.y;
  elements.annotationTextInput.value = annotation.text;
  elements.annotationColorInput.value = safeColor(annotation.color);
  elements.annotationFontSizeInput.value = String(annotation.fontSize);
  elements.annotationDialogTitle.textContent = "編輯文字注解";
  elements.deleteAnnotationButton.hidden = false;
  elements.annotationDialog.showModal();
  elements.annotationTextInput.focus();
}

function submitAnnotationForm(event) {
  event.preventDefault();
  const formation = selectedFormation();
  if (!formation) return;
  const text = elements.annotationTextInput.value.trim();
  if (!text) {
    showToast("請輸入注解文字", true);
    return;
  }

  const annotationId = elements.annotationIdInput.value;
  let annotation = formation.annotations.find((item) => item.id === annotationId);
  if (!annotation) {
    annotation = {
      id: createAnnotationId(),
      x: Number(elements.annotationXInput.value),
      y: Number(elements.annotationYInput.value)
    };
    formation.annotations.push(annotation);
  }
  annotation.text = text;
  annotation.color = elements.annotationColorInput.value;
  annotation.fontSize = Number(elements.annotationFontSizeInput.value);

  state.selectedAnnotationId = annotation.id;
  stage.setFormation(formation);
  stage.setSelectedAnnotation(annotation.id);
  scheduleAnnotationSave(formation.id);
  elements.annotationDialog.close();
  showToast(annotationId ? "文字注解已更新" : "文字注解已新增");
}

function deleteSelectedAnnotation() {
  const formation = selectedFormation();
  const annotationId = elements.annotationIdInput.value;
  if (!formation || !annotationId) return;
  const index = formation.annotations.findIndex((item) => item.id === annotationId);
  if (index < 0) return;
  formation.annotations.splice(index, 1);
  state.selectedAnnotationId = null;
  stage.setFormation(formation);
  stage.setSelectedAnnotation(null);
  scheduleAnnotationSave(formation.id);
  elements.annotationDialog.close();
  showToast("文字注解已刪除");
}

function handleAnnotationPositionChange(annotationId, position) {
  const formation = selectedFormation();
  const annotation = formation?.annotations.find((item) => item.id === annotationId);
  if (!annotation) return;
  annotation.x = position.x;
  annotation.y = position.y;
}

function handleAnnotationPositionCommit(annotationId, position) {
  const formation = selectedFormation();
  const annotation = formation?.annotations.find((item) => item.id === annotationId);
  if (!annotation) return;
  annotation.x = position.x;
  annotation.y = position.y;
  state.selectedAnnotationId = annotationId;
  stage.setSelectedAnnotation(annotationId);
  scheduleAnnotationSave(formation.id);
}

function scheduleAnnotationSave(formationId) {
  if (annotationSaveTimer) window.clearTimeout(annotationSaveTimer);
  setSaveState("saving", "儲存中");
  annotationSaveTimer = window.setTimeout(() => {
    annotationSaveTimer = null;
    persistFormationAnnotations(formationId);
  }, 220);
}

async function persistFormationAnnotations(formationId) {
  const project = state.project;
  const formation = project?.formations.find((item) => item.id === formationId);
  if (!project || !formation) return;
  const snapshot = formation.annotations.map((annotation) => ({ ...annotation }));
  try {
    const payload = await api.updateFormation(project.id, formation.id, {
      annotations: snapshot
    });
    const current = state.project?.formations.find((item) => item.id === formationId);
    if (
      current &&
      JSON.stringify(current.annotations) === JSON.stringify(snapshot)
    ) {
      current.annotations = payload.formation.annotations;
      current.updatedAt = payload.formation.updatedAt;
    }
    if (!annotationSaveTimer) setSaveState("saved", "已儲存");
  } catch (error) {
    setSaveState("error", "儲存失敗");
    showError(error);
  }
}

function createAnnotationId() {
  return globalThis.crypto?.randomUUID?.() ??
    `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function selectFormation(formationId) {
  if (state.isPlaying) return;
  const formation = state.project?.formations.find((item) => item.id === formationId);
  if (!formation) return;
  state.selectedFormationId = formation.id;
  state.selectedDancerId = null;
  state.selectedAnnotationId = null;
  setAnnotationPlacement(false);
  stage.setSelectedDancer(null);
  stage.setFormation(formation);
  stage.setSelectedAnnotation(null);
  renderDancerList();
  renderFormationTrack();
  renderFormationInspector();
  renderDancerInspector();
  renderTransport();
  renderStats();
  updateEmptyState();
}

function stepFormation(direction) {
  const formations = state.project?.formations ?? [];
  if (formations.length <= 1 || state.isPlaying) return;
  const currentIndex = formations.findIndex(
    (formation) => formation.id === state.selectedFormationId
  );
  const nextIndex = (currentIndex + direction + formations.length) % formations.length;
  selectFormation(formations[nextIndex].id);
}

function handlePositionChange(dancerId, position) {
  const formation = selectedFormation();
  if (!formation) return;
  formation.positions[String(dancerId)] = { ...position };
  if (dancerId === state.selectedDancerId) {
    elements.dancerXInput.value = formatNumber(position.x);
    elements.dancerYInput.value = formatNumber(position.y);
  }
  renderDancerList();
}

function saveDancerPosition(dancerId, position) {
  const formation = selectedFormation();
  if (!formation || !state.project || !position) return;
  formation.positions[String(dancerId)] = { ...position };
  scheduleFormationPositionSave(formation.id);
}

function scheduleFormationPositionSave(formationId) {
  if (!state.project || !formationId) return;
  if (formationSaveTimer) clearTimeout(formationSaveTimer);
  pendingFormationSaveId = formationId;
  setSaveState("saving", "儲存中");
  formationSaveTimer = window.setTimeout(() => {
    formationSaveTimer = null;
    persistFormationPositions(formationId);
  }, 220);
}

async function persistFormationPositions(formationId) {
  const project = state.project;
  const formation = project?.formations.find((item) => item.id === formationId);
  if (!project || !formation) return;

  const snapshot = JSON.parse(JSON.stringify(formation.positions));
  try {
    const payload = await api.updateFormation(project.id, formation.id, {
      positions: snapshot
    });
    const current = state.project?.formations.find((item) => item.id === formationId);
    if (
      current &&
      JSON.stringify(current.positions) === JSON.stringify(snapshot)
    ) {
      current.positions = payload.formation.positions;
      current.updatedAt = payload.formation.updatedAt;
    }
    if (!formationSaveTimer && pendingFormationSaveId === formationId) {
      pendingFormationSaveId = null;
      setSaveState("saved", "已儲存");
    }
  } catch (error) {
    setSaveState("error", "儲存失敗");
    showError(error);
  }
}

function updateDancerFromCoordinates() {
  const dancer = selectedDancer();
  const formation = selectedFormation();
  if (!dancer || !formation || !state.project) return;

  const x = Number(elements.dancerXInput.value);
  const y = Number(elements.dancerYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    renderDancerInspector();
    return;
  }

  const position = {
    x: round(Math.min(state.project.stageWidth, Math.max(0, x))),
    y: round(Math.min(state.project.stageHeight, Math.max(0, y)))
  };
  formation.positions[String(dancer.id)] = position;
  stage.updateDancerPosition(dancer.id, position);
  renderDancerInspector();
  renderDancerList();
  scheduleFormationPositionSave(formation.id);
}

async function playCurrentTransition() {
  const formations = state.project?.formations ?? [];
  const index = formations.findIndex((formation) => formation.id === state.selectedFormationId);
  if (index < 0 || formations.length < 2) {
    showToast("需要至少兩個隊形才能播放走位");
    return;
  }
  if (state.project.dancers.length === 0) {
    showToast("請先新增舞者");
    return;
  }

  const current = formations[index];
  const next = formations[(index + 1) % formations.length];
  state.isPlaying = true;
  renderTransport();
  stage.playTransition(current, next, next.transitionSeconds);
}

function finishPlayback(formationId) {
  state.isPlaying = false;
  state.selectedFormationId = formationId;
  stage.setFormation(selectedFormation());
  renderFormationTrack();
  renderFormationInspector();
  renderTransport();
  renderStats();
  updateEmptyState();
}

function openProjectDialog(project = null) {
  elements.projectForm.reset();
  elements.projectIdInput.value = project?.id ?? "";
  elements.projectDialogTitle.textContent = project ? "編輯舞碼專案" : "新增舞碼專案";
  elements.projectNameInput.value = project?.name ?? "";
  elements.projectDescriptionInput.value = project?.description ?? "";
  elements.stageWidthInput.value = project?.stageWidth ?? 100;
  elements.stageHeightInput.value = project?.stageHeight ?? 56.25;
  elements.stageRatioSelect.value = detectRatio(
    Number(elements.stageWidthInput.value),
    Number(elements.stageHeightInput.value)
  );
  elements.projectDialog.showModal();
  elements.projectNameInput.focus();
}

async function submitProjectForm(event) {
  event.preventDefault();
  const projectId = Number(elements.projectIdInput.value) || null;
  const values = {
    name: elements.projectNameInput.value.trim(),
    description: elements.projectDescriptionInput.value.trim(),
    stageWidth: Number(elements.stageWidthInput.value),
    stageHeight: Number(elements.stageHeightInput.value)
  };

  try {
    const payload = projectId
      ? await api.updateProject(projectId, values)
      : await api.createProject(values);
    elements.projectDialog.close();
    await refreshProjects(payload.project.id);
    await loadProject(payload.project.id, projectId ? state.selectedFormationId : null);
    showToast(projectId ? "專案設定已更新" : "專案已建立");
  } catch (error) {
    showError(error);
  }
}

function applyRatioPreset() {
  const ratio = elements.stageRatioSelect.value;
  if (ratio === "custom") return;
  const [widthRatio, heightRatio] = ratio.split(":").map(Number);
  const width = 100;
  elements.stageWidthInput.value = width;
  elements.stageHeightInput.value = round((width * heightRatio) / widthRatio);
}

function detectCustomRatio() {
  const ratio = detectRatio(
    Number(elements.stageWidthInput.value),
    Number(elements.stageHeightInput.value)
  );
  elements.stageRatioSelect.value = ratio;
}

function detectRatio(width, height) {
  if (!width || !height) return "custom";
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.01) return "16:9";
  if (Math.abs(ratio - 4 / 3) < 0.01) return "4:3";
  if (Math.abs(ratio - 1) < 0.01) return "1:1";
  return "custom";
}

async function deleteProject() {
  if (!state.project) return;
  const confirmed = window.confirm(`確定刪除「${state.project.name}」？此動作無法復原。`);
  if (!confirmed) return;
  try {
    await api.deleteProject(state.project.id);
    const deletedId = state.project.id;
    state.project = null;
    state.selectedFormationId = null;
    state.selectedDancerId = null;
    await refreshProjects();
    if (state.projects.length > 0) {
      await loadProject(state.projects[0].id);
    } else {
      renderAll();
      stage.setProject(null);
    }
    showToast(`專案 ${deletedId} 已刪除`);
  } catch (error) {
    showError(error);
  }
}

async function duplicateCurrentProject() {
  if (!state.project) return;
  const sourceId = state.project.id;
  const label = elements.duplicateProjectButton.querySelector("span");
  const previousLabel = label.textContent;
  elements.duplicateProjectButton.disabled = true;
  label.textContent = "複製中...";
  try {
    const payload = await api.duplicateProject(sourceId);
    await refreshProjects(payload.project.id);
    await loadProject(payload.project.id);
    showToast(`已建立「${payload.project.name}」`);
  } catch (error) {
    showError(error);
  } finally {
    label.textContent = previousLabel || "複製專案";
    elements.duplicateProjectButton.disabled = !state.project;
  }
}

function openDancerDialog() {
  if (!state.project) return;
  elements.dancerDialogForm.reset();
  elements.newDancerColor.value = DEFAULT_DANCER_COLOR;
  elements.dancerDialog.showModal();
  elements.newDancerCode.focus();
}

async function submitDancerForm(event) {
  event.preventDefault();
  if (!state.project) return;
  try {
    const payload = await api.createDancer(state.project.id, {
      code: elements.newDancerCode.value.trim(),
      name: elements.newDancerName.value.trim(),
      color: elements.newDancerColor.value
    });
    const formationId = state.selectedFormationId;
    elements.dancerDialog.close();
    await loadProject(state.project.id, formationId, payload.dancer.id);
    await refreshProjects(state.project.id);
    showToast(`舞者 ${payload.dancer.code} 已新增`);
  } catch (error) {
    showError(error);
  }
}

async function submitDancerEdit(event) {
  event.preventDefault();
  const dancer = selectedDancer();
  const formation = selectedFormation();
  if (!dancer || !state.project || !formation) return;
  const x = Number(elements.dancerXInput.value);
  const y = Number(elements.dancerYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    showToast("舞者座標格式不正確", true);
    return;
  }
  const position = {
    x: round(Math.min(state.project.stageWidth, Math.max(0, x))),
    y: round(Math.min(state.project.stageHeight, Math.max(0, y)))
  };
  try {
    const payload = await api.updateDancer(state.project.id, dancer.id, {
      code: elements.dancerCodeInput.value.trim(),
      name: elements.dancerNameInput.value.trim(),
      color: elements.dancerColorInput.value
    });
    Object.assign(dancer, payload.dancer);
    formation.positions[String(dancer.id)] = position;
    stage.updateDancerPosition(dancer.id, position);
    scheduleFormationPositionSave(formation.id);
    stage.setProject(state.project);
    renderDancerList();
    renderDancerInspector();
    setSaveState("saved", "已儲存");
    showToast("舞者資料已更新");
  } catch (error) {
    setSaveState("error", "儲存失敗");
    showError(error);
  }
}

async function deleteSelectedDancer() {
  const dancer = selectedDancer();
  if (!dancer || !state.project) return;
  if (!window.confirm(`確定刪除舞者「${dancer.code}」？`)) return;
  const formationId = state.selectedFormationId;
  try {
    await api.deleteDancer(state.project.id, dancer.id);
    await loadProject(state.project.id, formationId);
    await refreshProjects(state.project.id);
    showToast(`舞者 ${dancer.code} 已刪除`);
  } catch (error) {
    showError(error);
  }
}

async function submitFormationEdit(event) {
  event.preventDefault();
  const formation = selectedFormation();
  if (!formation || !state.project) return;
  try {
    const payload = await api.updateFormation(state.project.id, formation.id, {
      name: elements.formationNameInput.value.trim(),
      transitionSeconds: Number(elements.transitionInput.value)
    });
    replaceFormation(payload.formation);
    stage.setFormation(selectedFormation());
    renderDancerList();
    renderFormationTrack();
    renderFormationInspector();
    renderTransport();
    renderStats();
    setSaveState("saved", "已儲存");
    showToast("隊形設定已更新");
  } catch (error) {
    setSaveState("error", "儲存失敗");
    showError(error);
  }
}

function beginFormationDrag(event) {
  const handle = event.target.closest("[data-drag-formation-id]");
  if (!handle || !state.project) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  const card = handle.closest("[data-formation-id]");
  if (!card) return;
  event.preventDefault();
  event.stopPropagation();

  formationDragState = {
    pointerId: event.pointerId,
    formationId: Number(handle.dataset.dragFormationId),
    card,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startOrder: state.project.formations.map((formation) => formation.id),
    moved: false
  };
  handle.setPointerCapture(event.pointerId);
  elements.formationTrack.classList.add("is-sorting");
  card.classList.add("is-dragging");
}

function moveFormationDrag(event) {
  if (!formationDragState || formationDragState.pointerId !== event.pointerId) return;
  const distance = Math.hypot(
    event.clientX - formationDragState.startX,
    event.clientY - formationDragState.startY
  );
  if (!formationDragState.moved && distance < 4) return;

  event.preventDefault();
  formationDragState.moved = true;
  autoScrollFormationTrack(event.clientX);
  const cards = [...elements.formationTrack.querySelectorAll(".formation-card:not(.is-dragging)")];
  const reference = cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2;
  });
  if (reference) {
    elements.formationTrack.insertBefore(formationDragState.card, reference);
  } else {
    elements.formationTrack.append(formationDragState.card);
  }
}

function endFormationDrag(event) {
  if (!formationDragState || formationDragState.pointerId !== event.pointerId) return;
  const drag = formationDragState;
  formationDragState = null;
  event.preventDefault();
  event.stopPropagation();
  elements.formationTrack.classList.remove("is-sorting");
  drag.card.classList.remove("is-dragging");
  if (drag.handle.hasPointerCapture(event.pointerId)) {
    drag.handle.releasePointerCapture(event.pointerId);
  }
  if (!drag.moved) return;

  const orderedIds = [...elements.formationTrack.querySelectorAll("[data-formation-id]")].map(
    (card) => Number(card.dataset.formationId)
  );
  if (orderedIds.every((id, index) => id === drag.startOrder[index])) return;
  applyFormationOrder(orderedIds);
  persistFormationOrder(orderedIds);
}

function cancelFormationDrag(event) {
  if (!formationDragState || formationDragState.pointerId !== event.pointerId) return;
  const drag = formationDragState;
  formationDragState = null;
  elements.formationTrack.classList.remove("is-sorting");
  drag.card.classList.remove("is-dragging");
  if (drag.handle.hasPointerCapture(event.pointerId)) {
    drag.handle.releasePointerCapture(event.pointerId);
  }
  applyFormationOrder(drag.startOrder);
}

function autoScrollFormationTrack(pointerX) {
  const rect = elements.formationTrack.getBoundingClientRect();
  const edgeSize = 52;
  if (pointerX < rect.left + edgeSize) {
    elements.formationTrack.scrollLeft -= 14;
  } else if (pointerX > rect.right - edgeSize) {
    elements.formationTrack.scrollLeft += 14;
  }
}

function applyFormationOrder(formationIds) {
  if (!state.project) return;
  const byId = new Map(state.project.formations.map((formation) => [formation.id, formation]));
  state.project.formations = formationIds.map((formationId, index) => ({
    ...byId.get(formationId),
    sequenceIndex: index
  }));
  renderFormationTrack();
  renderFormationInspector();
  renderTransport();
  renderStats();
}

async function persistFormationOrder(formationIds) {
  if (!state.project) return;
  const projectId = state.project.id;
  const selectedFormationId = state.selectedFormationId;
  setSaveState("saving", "排序中");
  try {
    const payload = await api.reorderFormations(projectId, formationIds);
    if (state.project?.id === projectId) {
      state.project.formations = payload.formations;
      state.selectedFormationId = selectedFormationId;
      renderFormationTrack();
      renderFormationInspector();
      renderTransport();
      renderStats();
      setSaveState("saved", "已儲存");
    }
  } catch (error) {
    setSaveState("error", "排序失敗");
    showError(error);
    await loadProject(projectId, selectedFormationId);
  }
}

async function createFormationFromCurrent() {
  const current = selectedFormation();
  if (!state.project || !current) {
    showToast("請先選擇一個隊形");
    return;
  }

  const nextNumber = state.project.formations.length + 1;
  try {
    const payload = await api.createFormation(state.project.id, {
      name: `隊形 ${nextNumber}`,
      transitionSeconds: current.transitionSeconds,
      positions: { ...current.positions }
    });
    state.project.formations.push(payload.formation);
    state.project.formations.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    state.selectedFormationId = payload.formation.id;
    state.selectedDancerId = null;
    stage.setFormation(payload.formation);
    stage.setSelectedDancer(null);
    renderAll();
    setSaveState("saved", "已儲存");
    showToast("已從目前隊形建立新隊形");
  } catch (error) {
    showError(error);
  }
}

async function deleteSelectedFormation() {
  const formation = selectedFormation();
  if (!formation || !state.project) return;
  if (state.project.formations.length <= 1) {
    showToast("專案至少需要保留一個隊形");
    return;
  }
  if (!window.confirm(`確定刪除隊形「${formation.name}」？`)) return;

  const index = state.project.formations.findIndex((item) => item.id === formation.id);
  const preferredFormationId =
    state.project.formations[index - 1]?.id ??
    state.project.formations[index + 1]?.id ??
    null;
  try {
    await api.deleteFormation(state.project.id, formation.id);
    await loadProject(state.project.id, preferredFormationId);
    await refreshProjects(state.project.id);
    showToast("隊形已刪除");
  } catch (error) {
    showError(error);
  }
}

function replaceFormation(updated) {
  if (!state.project) return;
  const index = state.project.formations.findIndex((formation) => formation.id === updated.id);
  if (index >= 0) {
    state.project.formations[index] = updated;
    state.project.formations.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  }
}

function setSaveState(mode, label) {
  elements.saveState.classList.toggle("is-saving", mode === "saving");
  elements.saveState.classList.toggle("is-error", mode === "error");
  elements.saveState.querySelector("span").textContent = label;
}

function showError(error) {
  console.error(error);
  showToast(error.message || "操作失敗，請稍後再試", true);
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function initializeMobilePanels() {
  const expanded = !mobileLayout.matches;
  setMobilePanelExpanded("inspector", expanded);
  setMobilePanelExpanded("timeline", expanded);
}

function toggleMobilePanel(panelName) {
  if (!mobileLayout.matches) return;
  const panel = panelName === "inspector"
    ? elements.inspectorPanel
    : elements.timelinePanel;
  const isExpanded = !panel.classList.contains("is-collapsed");
  if (isExpanded) {
    setMobilePanelExpanded(panelName, false);
    return;
  }

  setMobilePanelExpanded(panelName, true);
  setMobilePanelExpanded(
    panelName === "inspector" ? "timeline" : "inspector",
    false
  );
}

function setMobilePanelExpanded(panelName, expanded) {
  const panel = panelName === "inspector"
    ? elements.inspectorPanel
    : elements.timelinePanel;
  const toggle = panelName === "inspector"
    ? elements.inspectorToggle
    : elements.timelineToggle;
  panel.classList.toggle("is-collapsed", !expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
}

function toggleStageTheme() {
  state.stageTheme = state.stageTheme === "dark" ? "light" : "dark";
  writePreference(STAGE_THEME_KEY, state.stageTheme);
  applyStageAppearance();
}

function toggleStageGrid() {
  state.gridVisible = !state.gridVisible;
  writePreference(STAGE_GRID_KEY, String(state.gridVisible));
  applyStageAppearance();
}

function applyStageAppearance() {
  const isDark = state.stageTheme === "dark";
  elements.canvasFrame.classList.toggle("is-dark", isDark);
  elements.stagePanel.classList.toggle("is-dark", isDark);
  elements.stageThemeIcon.setAttribute("href", isDark ? "#icon-sun" : "#icon-moon");
  elements.stageThemeButton.setAttribute("aria-pressed", String(isDark));
  elements.stageThemeButton.title = isDark ? "使用淺色舞台" : "使用深色舞台";
  elements.stageThemeButton.setAttribute(
    "aria-label",
    isDark ? "使用淺色舞台" : "使用深色舞台"
  );
  elements.stageGridButton.classList.toggle("is-active", state.gridVisible);
  elements.stageGridButton.setAttribute("aria-pressed", String(state.gridVisible));
  elements.stageGridButton.title = state.gridVisible ? "隱藏網格" : "顯示網格";
  elements.stageGridButton.setAttribute(
    "aria-label",
    state.gridVisible ? "隱藏網格" : "顯示網格"
  );
  stage.setTheme(state.stageTheme);
  stage.setGridVisible(state.gridVisible);
}

function beginStageResize(event) {
  if (event.button !== 0 || !state.project) return;
  event.preventDefault();
  const rect = elements.canvasFrame.getBoundingClientRect();
  const bounds = getStageResizeBounds();
  stageResizeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
    bounds,
    moved: false
  };
  elements.canvasFrame.classList.add("is-resizing");
  elements.stageResizeHandle.setPointerCapture(event.pointerId);
}

function moveStageResize(event) {
  if (!stageResizeState || stageResizeState.pointerId !== event.pointerId) return;
  event.preventDefault();
  const width = clamp(
    stageResizeState.startWidth + event.clientX - stageResizeState.startX,
    stageResizeState.bounds.minWidth,
    stageResizeState.bounds.maxWidth
  );
  const height = clamp(
    stageResizeState.startHeight + event.clientY - stageResizeState.startY,
    stageResizeState.bounds.minHeight,
    stageResizeState.bounds.maxHeight
  );
  stageResizeState.moved = true;
  setStageFrameSize(width, height);
}

function handleMobileStageGesture({ scale, deltaX, deltaY }) {
  const rect = elements.canvasFrame.getBoundingClientRect();
  const bounds = getStageResizeBounds();
  const scaleFactor = Math.abs(scale - 1) < 0.002 ? 1 : scale;
  const width = clamp(rect.width * scaleFactor, bounds.minWidth, bounds.maxWidth);
  const height = clamp(rect.height * scaleFactor, bounds.minHeight, bounds.maxHeight);
  if (scaleFactor !== 1 || width !== rect.width || height !== rect.height) {
    setStageFrameSize(width, height);
  }
  elements.canvasStageArea.scrollLeft -= deltaX;
  elements.canvasStageArea.scrollTop -= deltaY;
}

function finishMobileStageGesture() {
  elements.canvasStageArea.classList.remove("is-panning");
  persistStageFrameSize();
}

function endStageResize(event) {
  if (!stageResizeState) return;
  const resizeState = stageResizeState;
  stageResizeState = null;
  elements.canvasFrame.classList.remove("is-resizing");
  if (
    event.pointerId === resizeState.pointerId &&
    elements.stageResizeHandle.hasPointerCapture(event.pointerId)
  ) {
    elements.stageResizeHandle.releasePointerCapture(event.pointerId);
  }
  if (resizeState.moved) {
    persistStageFrameSize();
  }
}

function persistStageFrameSize() {
  if (!elements.canvasFrame.style.width) return;
  const rect = elements.canvasFrame.getBoundingClientRect();
  writePreference(
    STAGE_SIZE_KEY,
    JSON.stringify({ width: Math.round(rect.width), height: Math.round(rect.height) })
  );
}

function setStageFrameSize(width, height) {
  elements.canvasFrame.style.flex = "0 0 auto";
  elements.canvasFrame.style.width = `${Math.round(width)}px`;
  elements.canvasFrame.style.height = `${Math.round(height)}px`;
}

function getStageResizeBounds() {
  const area = elements.canvasStageArea;
  const maxWidth = Math.max(1800, area.clientWidth * 3);
  const maxHeight = Math.max(1200, area.clientHeight * 3);
  return {
    minWidth: Math.min(260, maxWidth),
    minHeight: Math.min(180, maxHeight),
    maxWidth,
    maxHeight
  };
}

function restoreStageSize() {
  const saved = readJsonPreference(STAGE_SIZE_KEY);
  if (
    !saved ||
    !Number.isFinite(saved.width) ||
    !Number.isFinite(saved.height)
  ) {
    return;
  }
  window.requestAnimationFrame(() => {
    const bounds = getStageResizeBounds();
    setStageFrameSize(
      clamp(saved.width, bounds.minWidth, bounds.maxWidth),
      clamp(saved.height, bounds.minHeight, bounds.maxHeight)
    );
  });
}

function clampStageFrame() {
  if (!elements.canvasFrame.style.width || stageResizeState) return;
  const rect = elements.canvasFrame.getBoundingClientRect();
  const bounds = getStageResizeBounds();
  setStageFrameSize(
    clamp(rect.width, bounds.minWidth, bounds.maxWidth),
    clamp(rect.height, bounds.minHeight, bounds.maxHeight)
  );
}

function resetStageSize() {
  elements.canvasFrame.style.removeProperty("flex");
  elements.canvasFrame.style.removeProperty("width");
  elements.canvasFrame.style.removeProperty("height");
  try {
    window.localStorage.removeItem(STAGE_SIZE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  showToast("舞台顯示大小已重設");
}

function openExportDialog() {
  if (!state.project) return;
  elements.exportDialog.showModal();
}

function submitExportForm(event) {
  event.preventDefault();
  const formData = new FormData(elements.exportForm);
  const mode = formData.get("exportMode") === "simple" ? "simple" : "full";
  elements.exportDialog.close();
  exportProjectPdf(mode);
}

async function exportProjectPdf(mode = "full") {
  if (!state.project) return;
  const label = elements.exportPdfButton.querySelector("span");
  const previousLabel = label.textContent;
  const modeSuffix = mode === "simple" ? "-simple" : "";
  const exportUrl = `/api/projects/${state.project.id}/export.pdf?theme=${state.stageTheme}&mode=${mode}`;
  const downloadName = `${sanitizeFilename(state.project.name)}${modeSuffix}.pdf`;
  if (mobileLayout.matches) {
    const link = document.createElement("a");
    link.href = exportUrl;
    link.download = downloadName;
    document.body.append(link);
    link.click();
    link.remove();
    showToast("PDF 已開始下載");
    return;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);
  elements.exportPdfButton.disabled = true;
  label.textContent = "產生中...";
  try {
    const response = await fetch(
      exportUrl,
      {
        headers: { Accept: "application/pdf" },
        signal: controller.signal
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `PDF 產生失敗 (${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/pdf")) {
      throw new Error("伺服器回傳的檔案格式不是 PDF");
    }

    const blob = await response.blob();
    if (blob.size < 5) throw new Error("PDF 檔案內容為空");
    const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") throw new Error("PDF 檔案格式不完整");

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = downloadName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    showToast("PDF 已開始下載");
  } catch (error) {
    if (error.name === "AbortError") {
      showToast("PDF 產生逾時，請稍後再試", true);
    } else {
      showError(error);
    }
  } finally {
    window.clearTimeout(timeoutId);
    label.textContent = previousLabel || "匯出 PDF";
    elements.exportPdfButton.disabled = false;
  }
}

function sanitizeFilename(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 80) || "formation-project";
}

function readPreference(key, fallback) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function readJsonPreference(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The stage remains usable when browser storage is blocked.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#f97316";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

init();
