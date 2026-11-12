const TAU = Math.PI * 2;

export class StageCanvas {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.callbacks = callbacks;
    this.project = null;
    this.dancers = [];
    this.formation = null;
    this.displayPositions = {};
    this.selectedDancerId = null;
    this.draggingDancerId = null;
    this.hoveredDancerId = null;
    this.animation = null;
    this.animationFrame = null;
    this.layout = null;
    this.theme = "light";
    this.gridVisible = true;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);

    canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    canvas.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
    canvas.addEventListener("pointerleave", () => {
      if (!this.draggingDancerId) {
        this.hoveredDancerId = null;
        this.canvas.style.cursor = "default";
        this.draw();
      }
    });
  }

  setProject(project) {
    this.project = project;
    this.dancers = project?.dancers ?? [];
    this.draw();
  }

  setFormation(formation) {
    this.cancelAnimation();
    this.formation = formation;
    this.displayPositions = clonePositions(formation?.positions ?? {});
    this.draw();
  }

  updateDancerPosition(dancerId, position) {
    if (!this.displayPositions[dancerId]) return;
    this.displayPositions[dancerId] = { ...position };
    this.draw();
  }

  setSelectedDancer(dancerId) {
    this.selectedDancerId = dancerId;
    this.draw();
  }

  setTheme(theme) {
    this.theme = theme === "dark" ? "dark" : "light";
    this.draw();
  }

  setGridVisible(visible) {
    this.gridVisible = Boolean(visible);
    this.draw();
  }

  playTransition(fromFormation, toFormation, durationSeconds) {
    this.cancelAnimation();
    this.formation = fromFormation;
    this.displayPositions = clonePositions(fromFormation.positions);
    this.animation = {
      from: clonePositions(fromFormation.positions),
      to: clonePositions(toFormation.positions),
      fromFormationId: fromFormation.id,
      toFormationId: toFormation.id,
      startedAt: performance.now(),
      duration: Math.max(100, durationSeconds * 1000),
      progress: 0
    };
    this.runAnimationFrame();
  }

  cancelAnimation() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.animation = null;
  }

  runAnimationFrame() {
    if (!this.animation) return;
    const elapsed = performance.now() - this.animation.startedAt;
    const rawProgress = Math.min(1, elapsed / this.animation.duration);
    const progress = easeInOutCubic(rawProgress);
    this.animation.progress = progress;
    this.displayPositions = interpolatePositions(
      this.animation.from,
      this.animation.to,
      progress
    );
    this.draw();

    if (rawProgress < 1) {
      this.animationFrame = requestAnimationFrame(() => this.runAnimationFrame());
      return;
    }

    const completed = this.animation;
    this.animationFrame = null;
    this.animation = null;
    this.formation = this.dancers ? { id: completed.toFormationId, positions: completed.to } : null;
    this.displayPositions = clonePositions(completed.to);
    this.draw();
    this.callbacks.onAnimationComplete?.(completed.toFormationId);
  }

  handlePointerDown(event) {
    if (this.animation || !this.project) return;
    const point = this.eventToStage(event);
    const hit = this.findDancerAt(point.x, point.y);
    if (!hit) {
      this.callbacks.onSelect?.(null);
      return;
    }

    event.preventDefault();
    this.draggingDancerId = hit.id;
    this.selectedDancerId = hit.id;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    this.callbacks.onSelect?.(hit.id);
  }

  handlePointerMove(event) {
    if (this.animation || !this.project) return;
    const point = this.eventToStage(event);

    if (this.draggingDancerId) {
      event.preventDefault();
      const position = {
        x: round(Math.min(this.project.stageWidth, Math.max(0, point.x))),
        y: round(Math.min(this.project.stageHeight, Math.max(0, point.y)))
      };
      this.displayPositions[this.draggingDancerId] = position;
      this.callbacks.onPositionChange?.(this.draggingDancerId, position);
      this.draw();
      return;
    }

    const hit = this.findDancerAt(point.x, point.y);
    const hoveredId = hit?.id ?? null;
    if (hoveredId !== this.hoveredDancerId) {
      this.hoveredDancerId = hoveredId;
      this.canvas.style.cursor = hoveredId ? "grab" : "default";
      this.draw();
    }
  }

  handlePointerUp(event) {
    if (!this.draggingDancerId) return;
    const dancerId = this.draggingDancerId;
    this.draggingDancerId = null;
    this.canvas.style.cursor = this.hoveredDancerId ? "grab" : "default";
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.callbacks.onPositionCommit?.(dancerId, this.displayPositions[dancerId]);
  }

  eventToStage(event) {
    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    if (!this.layout || !this.project) return { x: 0, y: 0 };
    return {
      x: ((point.x - this.layout.x) / this.layout.width) * this.project.stageWidth,
      y: ((point.y - this.layout.y) / this.layout.height) * this.project.stageHeight
    };
  }

  findDancerAt(x, y) {
    if (!this.project) return null;
    const threshold = this.dancerRadius() + 9;
    let closest = null;
    let closestDistance = Infinity;

    for (const dancer of this.dancers) {
      const position = this.displayPositions[String(dancer.id)];
      if (!position) continue;
      const screen = this.stageToScreen(position.x, position.y);
      const distance = Math.hypot(screen.x - (this.layout.x + (x / this.project.stageWidth) * this.layout.width), screen.y - (this.layout.y + (y / this.project.stageHeight) * this.layout.height));
      if (distance <= threshold && distance < closestDistance) {
        closest = dancer;
        closestDistance = distance;
      }
    }
    return closest;
  }

  dancerRadius() {
    if (!this.layout) return 15;
    return Math.max(10, Math.min(21, Math.min(this.layout.width, this.layout.height) / 22));
  }

  stageToScreen(x, y) {
    return {
      x: this.layout.x + (x / this.project.stageWidth) * this.layout.width,
      y: this.layout.y + (y / this.project.stageHeight) * this.layout.height
    };
  }

  prepareCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
  }

  updateLayout() {
    const size = this.prepareCanvas();
    if (!this.project) return size;

    const horizontalPadding = Math.max(22, Math.min(48, size.width * 0.05));
    const topPadding = 60;
    const bottomPadding = 66;
    const availableWidth = Math.max(40, size.width - horizontalPadding * 2);
    const availableHeight = Math.max(40, size.height - topPadding - bottomPadding);
    const ratio = this.project.stageWidth / this.project.stageHeight;
    let width = availableWidth;
    let height = width / ratio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }

    this.layout = {
      x: (size.width - width) / 2,
      y: topPadding + (availableHeight - height) / 2,
      width,
      height
    };
    return size;
  }

  draw() {
    const size = this.updateLayout();
    const context = this.context;
    context.clearRect(0, 0, size.width, size.height);
    if (!this.project || !this.layout) return;

    this.drawFloor();
    this.drawTransition();
    this.drawDancers();
  }

  drawFloor() {
    const context = this.context;
    const { x, y, width, height } = this.layout;
    const isDark = this.theme === "dark";

    context.save();
    context.shadowColor = isDark ? "rgba(0, 0, 0, 0.38)" : "rgba(29, 30, 27, 0.13)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 5;
    const floor = context.createLinearGradient(x, y, x, y + height);
    floor.addColorStop(0, isDark ? "#1b2529" : "#fcfbf7");
    floor.addColorStop(1, isDark ? "#121a1e" : "#eeece5");
    context.fillStyle = floor;
    roundedRect(context, x, y, width, height, 5);
    context.fill();
    context.restore();

    context.save();
    roundedRect(context, x, y, width, height, 5);
    context.clip();

    if (this.gridVisible) {
      context.strokeStyle = isDark ? "rgba(212, 230, 232, 0.19)" : "rgba(52, 60, 56, 0.16)";
      context.lineWidth = isDark ? 1.1 : 1;
      context.setLineDash([2, 4]);
      for (let index = 1; index < 10; index += 1) {
        const gridX = x + (width * index) / 10;
        context.beginPath();
        context.moveTo(gridX, y);
        context.lineTo(gridX, y + height);
        context.stroke();
      }
      for (let index = 1; index < 6; index += 1) {
        const gridY = y + (height * index) / 6;
        context.beginPath();
        context.moveTo(x, gridY);
        context.lineTo(x + width, gridY);
        context.stroke();
      }
      context.setLineDash([]);

      const centerX = x + width / 2;
      const centerY = y + height / 2;
      context.strokeStyle = isDark ? "rgba(235, 112, 75, 0.34)" : "rgba(235, 94, 53, 0.24)";
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(centerX, y);
      context.lineTo(centerX, y + height);
      context.moveTo(x, centerY);
      context.lineTo(x + width, centerY);
      context.stroke();
    }
    context.restore();

    context.save();
    context.strokeStyle = isDark ? "#415057" : "#c9c5bb";
    context.lineWidth = 1;
    roundedRect(context, x + 0.5, y + 0.5, width - 1, height - 1, 5);
    context.stroke();
    context.restore();
  }

  drawTransition() {
    if (!this.animation) return;
    const context = this.context;
    const { from, to, progress } = this.animation;

    context.save();
    context.setLineDash([4, 5]);
    context.lineWidth = 1;
    for (const dancer of this.dancers) {
      const key = String(dancer.id);
      const start = from[key];
      const end = to[key];
      if (!start || !end) continue;
      const startPoint = this.stageToScreen(start.x, start.y);
      const endPoint = this.stageToScreen(end.x, end.y);
      context.strokeStyle = hexToRgba(dancer.color, 0.3);
      context.beginPath();
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
      context.stroke();

      context.setLineDash([]);
      context.strokeStyle = hexToRgba(dancer.color, 0.38);
      context.beginPath();
      context.arc(endPoint.x, endPoint.y, this.dancerRadius() + 4, 0, TAU);
      context.stroke();
      context.setLineDash([4, 5]);
    }
    context.restore();

    const badgeWidth = 72;
    const badgeX = this.layout.x + this.layout.width - badgeWidth - 12;
    const badgeY = this.layout.y + 12;
    context.save();
    context.fillStyle = "rgba(23, 27, 31, 0.88)";
    roundedRect(context, badgeX, badgeY, badgeWidth, 26, 4);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = '600 10px "Cascadia Mono", Consolas, monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${Math.round(progress * 100)}%`, badgeX + badgeWidth / 2, badgeY + 13);
    context.restore();
  }

  drawDancers() {
    const radius = this.dancerRadius();
    for (const dancer of this.dancers) {
      if (dancer.id === this.selectedDancerId) continue;
      this.drawDancer(dancer, radius, false);
    }
    const selected = this.dancers.find((dancer) => dancer.id === this.selectedDancerId);
    if (selected) this.drawDancer(selected, radius, true);
  }

  drawDancer(dancer, radius, selected) {
    const position = this.displayPositions[String(dancer.id)];
    if (!position) return;
    const point = this.stageToScreen(position.x, position.y);
    const context = this.context;
    const isHovered = dancer.id === this.hoveredDancerId || dancer.id === this.draggingDancerId;

    context.save();
    if (selected || isHovered) {
      context.fillStyle = hexToRgba(dancer.color, selected ? 0.18 : 0.1);
      context.beginPath();
      context.arc(point.x, point.y, radius + (selected ? 9 : 6), 0, TAU);
      context.fill();
    }

    context.shadowColor = "rgba(25, 27, 24, 0.2)";
    context.shadowBlur = 9;
    context.shadowOffsetY = 3;
    context.fillStyle = dancer.color;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, TAU);
    context.fill();
    context.shadowColor = "transparent";

    context.lineWidth = selected ? 3 : 2;
    context.strokeStyle = selected
      ? this.theme === "dark"
        ? "#ffffff"
        : "#171b1f"
      : "rgba(255, 255, 255, 0.9)";
    context.beginPath();
    context.arc(point.x, point.y, radius - (selected ? 1 : 0), 0, TAU);
    context.stroke();

    const textColor = contrastColor(dancer.color);
    let fontSize = Math.max(8, radius * 0.58);
    context.fillStyle = textColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `750 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
    while (context.measureText(dancer.code).width > radius * 1.5 && fontSize > 6) {
      fontSize -= 0.5;
      context.font = `750 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
    }
    context.fillText(truncateLabel(dancer.code, 8), point.x, point.y + 0.5);

    if (isHovered && dancer.name) {
      this.drawTooltip(dancer.name, point.x, point.y - radius - 12);
    }
    context.restore();
  }

  drawTooltip(text, x, y) {
    const context = this.context;
    context.save();
    context.font = '600 10px "Aptos", "Segoe UI", sans-serif';
    const width = Math.min(180, context.measureText(text).width + 18);
    context.fillStyle = "rgba(23, 27, 31, 0.9)";
    roundedRect(context, x - width / 2, y - 23, width, 21, 4);
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y - 12.5, width - 12);
    context.restore();
  }
}

function interpolatePositions(from, to, progress) {
  return Object.fromEntries(
    Object.keys(from).map((key) => {
      const start = from[key];
      const end = to[key] ?? start;
      return [
        key,
        {
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress
        }
      ];
    })
  );
}

function clonePositions(positions) {
  return Object.fromEntries(
    Object.entries(positions ?? {}).map(([key, position]) => [
      key,
      { x: Number(position.x), y: Number(position.y) }
    ])
  );
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function contrastColor(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.62 ? "#171b1f" : "#ffffff";
}

function truncateLabel(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
