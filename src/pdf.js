const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

async function buildProjectPdf(project, options = {}) {
  const theme = options.theme === "dark" ? "dark" : "light";
  const regularFont = findFont([
    process.env.PDF_CJK_FONT,
    path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "Deng.ttf"),
    path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "simhei.ttf"),
    path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "simfang.ttf"),
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttf",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttf"
  ]);
  const boldFont = findFont([
    process.env.PDF_CJK_FONT_BOLD,
    path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "Dengb.ttf"),
    path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "simhei.ttf"),
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttf"
  ]);

  if (!regularFont) {
    const error = new Error("找不到可嵌入的中文字型，請設定 PDF_CJK_FONT");
    error.status = 500;
    throw error;
  }

  const document = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${project.name} - 舞碼隊形`,
      Author: "Hanabi Stage",
      Subject: "舞碼隊形編排匯出"
    }
  });

  document.registerFont("Body", regularFont);
  document.registerFont("Bold", boldFont || regularFont);

  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  drawCover(document, project);
  project.formations.forEach((formation, index) => {
    drawFormation(document, project, formation, index, theme);
  });
  drawFooters(document, project);
  document.end();

  return completed;
}

function drawCover(document, project) {
  document.rect(0, 0, PAGE_WIDTH, 184).fill("#171b1f");
  document.roundedRect(MARGIN, 38, 42, 42, 6).fill("#eb5e35");
  setFont(document, 24, true).fillColor("#171b1f").text("H", MARGIN, 45, {
    width: 42,
    align: "center",
    lineBreak: false
  });

  setFont(document, 10, true)
    .fillColor("#f4f1e9")
    .text("HANABI STAGE", MARGIN + 55, 42, { characterSpacing: 1.1 });
  setFont(document, 8)
    .fillColor("#9da4a2")
    .text("FORMATION EXPORT", MARGIN + 55, 58, { characterSpacing: 0.6 });

  setFont(document, 25, true)
    .fillColor("#ffffff")
    .text(project.name, MARGIN, 96, {
      width: CONTENT_WIDTH,
      height: 34,
      ellipsis: true
    });
  setFont(document, 9)
    .fillColor("#b7bdbb")
    .text(project.description || "未填寫專案說明", MARGIN, 135, {
      width: CONTENT_WIDTH,
      height: 28,
      ellipsis: true
    });

  let y = 211;
  setFont(document, 14, true).fillColor("#171b1f").text("專案摘要", MARGIN, y);
  y += 24;
  const totalDuration = project.formations.reduce(
    (total, formation) => total + formation.transitionSeconds,
    0
  );
  const cards = [
    ["舞台尺寸", `${formatNumber(project.stageWidth)} × ${formatNumber(project.stageHeight)}`],
    ["舞者人數", `${project.dancers.length} 人`],
    ["隊形數量", `${project.formations.length} 個`],
    ["演出總長", `${totalDuration.toFixed(1)} 秒`]
  ];
  const cardGap = 8;
  const cardWidth = (CONTENT_WIDTH - cardGap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    document.roundedRect(x, y, cardWidth, 56, 5).fill("#f0eee8");
    setFont(document, 8).fillColor("#7b7f7c").text(label, x + 10, y + 10, {
      width: cardWidth - 20
    });
    setFont(document, 13, true)
      .fillColor("#242925")
      .text(value, x + 10, y + 28, { width: cardWidth - 20, lineBreak: false });
  });

  y += 82;
  y = drawDancerDirectory(document, project, y);
  y += 18;
  drawFormationDirectory(document, project, y);
}

function drawDancerDirectory(document, project, startY) {
  let y = startY;
  let column = 0;
  const columnWidth = (CONTENT_WIDTH - 20) / 2;
  setFont(document, 13, true).fillColor("#171b1f").text("舞者名單", MARGIN, y);
  y += 23;

  if (project.dancers.length === 0) {
    setFont(document, 9).fillColor("#7c807c").text("尚未新增舞者", MARGIN, y);
    return y + 22;
  }

  for (const dancer of project.dancers) {
    if (y > PAGE_HEIGHT - 86) {
      document.addPage();
      y = MARGIN;
      setFont(document, 13, true).fillColor("#171b1f").text("舞者名單（續）", MARGIN, y);
      y += 24;
      column = 0;
    }

    const x = MARGIN + column * (columnWidth + 20);
    document.circle(x + 5, y + 7, 4.5).fill(safeColor(dancer.color));
    setFont(document, 9, true)
      .fillColor("#303431")
      .text(dancer.code, x + 16, y, { width: 54, lineBreak: false });
    setFont(document, 8.5)
      .fillColor("#737772")
      .text(dancer.name || "未命名舞者", x + 68, y + 0.5, {
        width: columnWidth - 68,
        ellipsis: true,
        lineBreak: false
      });

    if (column === 1) {
      y += 22;
      column = 0;
    } else {
      column = 1;
    }
  }

  return column === 1 ? y + 22 : y;
}

function drawFormationDirectory(document, project, startY) {
  let y = startY;
  if (y > PAGE_HEIGHT - 110) {
    document.addPage();
    y = MARGIN;
  }

  setFont(document, 13, true).fillColor("#171b1f").text("隊形時間軸", MARGIN, y);
  y += 23;
  for (const [index, formation] of project.formations.entries()) {
    if (y > PAGE_HEIGHT - 74) {
      document.addPage();
      y = MARGIN;
      setFont(document, 13, true).fillColor("#171b1f").text("隊形時間軸（續）", MARGIN, y);
      y += 23;
    }
    document.roundedRect(MARGIN, y, CONTENT_WIDTH, 27, 3).fill(index % 2 === 0 ? "#f3f1eb" : "#faf9f5");
    setFont(document, 8, true)
      .fillColor("#eb5e35")
      .text(String(index + 1).padStart(2, "0"), MARGIN + 10, y + 8, {
        width: 24
      });
    setFont(document, 9, true)
      .fillColor("#303431")
      .text(formation.name, MARGIN + 42, y + 7, {
        width: 310,
        ellipsis: true,
        lineBreak: false
      });
    setFont(document, 8)
      .fillColor("#737772")
      .text(`${formation.transitionSeconds.toFixed(1)} 秒`, MARGIN + CONTENT_WIDTH - 74, y + 8, {
        width: 62,
        align: "right",
        lineBreak: false
      });
    y += 31;
  }
}

function drawFormation(document, project, formation, index, theme) {
  document.addPage();
  drawPageTitle(
    document,
    `FORMATION ${String(index + 1).padStart(2, "0")}`,
    formation.name,
    `進場過渡 ${formation.transitionSeconds.toFixed(1)} 秒`
  );

  const stage = fitRect(CONTENT_WIDTH, 310, project.stageWidth / project.stageHeight);
  const stageX = MARGIN + (CONTENT_WIDTH - stage.width) / 2;
  const stageY = 128;
  drawStageDiagram(document, project, formation, {
    x: stageX,
    y: stageY,
    width: stage.width,
    height: stage.height,
    theme
  });
  drawPositionDetails(document, project, formation, stageY + stage.height + 26);
}

function drawPageTitle(document, eyebrow, title, meta) {
  document.rect(0, 0, PAGE_WIDTH, 12).fill("#eb5e35");
  setFont(document, 8, true)
    .fillColor("#8a8d89")
    .text(eyebrow, MARGIN, 40, { characterSpacing: 1.2 });
  setFont(document, 22, true)
    .fillColor("#171b1f")
    .text(title, MARGIN, 58, {
      width: CONTENT_WIDTH - 120,
      height: 30,
      ellipsis: true
    });
  setFont(document, 9)
    .fillColor("#747873")
    .text(meta, PAGE_WIDTH - MARGIN - 112, 64, {
      width: 112,
      align: "right",
      lineBreak: false
    });
  document
    .moveTo(MARGIN, 102)
    .lineTo(PAGE_WIDTH - MARGIN, 102)
    .lineWidth(1)
    .strokeColor("#d8d4ca")
    .stroke();
}

function drawStageDiagram(document, project, formation, frame) {
  const isDark = frame.theme === "dark";
  document.roundedRect(frame.x, frame.y, frame.width, frame.height, 5).fill(isDark ? "#182226" : "#f4f2ec");
  document
    .roundedRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1, 5)
    .lineWidth(1)
    .strokeColor(isDark ? "#45545a" : "#cac6bc")
    .stroke();

  document.save();
  document.roundedRect(frame.x, frame.y, frame.width, frame.height, 5).clip();
  document.lineWidth(0.75).strokeColor(isDark ? "#617278" : "#c9c5ba");
  for (let column = 1; column < 10; column += 1) {
    const x = frame.x + (frame.width * column) / 10;
    document.moveTo(x, frame.y).lineTo(x, frame.y + frame.height).stroke();
  }
  for (let row = 1; row < 6; row += 1) {
    const y = frame.y + (frame.height * row) / 6;
    document.moveTo(frame.x, y).lineTo(frame.x + frame.width, y).stroke();
  }
  document
    .lineWidth(1)
    .strokeColor(isDark ? "#9a6758" : "#e0a493")
    .moveTo(frame.x + frame.width / 2, frame.y)
    .lineTo(frame.x + frame.width / 2, frame.y + frame.height)
    .moveTo(frame.x, frame.y + frame.height / 2)
    .lineTo(frame.x + frame.width, frame.y + frame.height / 2)
    .stroke();
  document.restore();

  setFont(document, 6.5, true)
    .fillColor(isDark ? "#91a0a4" : "#9a9992")
    .text("BACK", frame.x + 10, frame.y + 8, { characterSpacing: 0.8 });
  setFont(document, 6.5, true)
    .fillColor(isDark ? "#91a0a4" : "#9a9992")
    .text("AUDIENCE", frame.x + frame.width - 62, frame.y + frame.height - 15, {
      width: 52,
      align: "right",
      characterSpacing: 0.5
    });

  const radius = Math.max(6, Math.min(14, Math.min(frame.width, frame.height) / 24));
  for (const dancer of project.dancers) {
    const position = formation.positions[String(dancer.id)];
    if (!position) continue;
    const x = frame.x + (position.x / project.stageWidth) * frame.width;
    const y = frame.y + (position.y / project.stageHeight) * frame.height;
    document.circle(x, y, radius).fill(safeColor(dancer.color));
    document
      .circle(x, y, radius)
      .lineWidth(1.5)
      .strokeColor("#ffffff")
      .stroke();

    let textSize = Math.max(5.5, radius * 0.62);
    setFont(document, textSize, true);
    while (document.widthOfString(dancer.code) > radius * 1.5 && textSize > 4) {
      textSize -= 0.4;
      setFont(document, textSize, true);
    }
    document
      .fillColor(contrastColor(dancer.color))
      .text(truncate(dancer.code, 8), x - radius, y - textSize * 0.52, {
        width: radius * 2,
        align: "center",
        lineBreak: false
      });
  }
}

function drawPositionDetails(document, project, formation, startY) {
  let y = startY;
  let pageCount = 0;
  const columnGap = 14;
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2;
  const rowHeight = 19;

  const drawHeading = () => {
    setFont(document, 12, true)
      .fillColor("#171b1f")
      .text(pageCount === 0 ? "舞者座標" : "舞者座標（續）", MARGIN, y);
    y += 21;
  };
  drawHeading();

  if (project.dancers.length === 0) {
    setFont(document, 8.5).fillColor("#7b7f7a").text("尚未新增舞者", MARGIN, y);
    return;
  }

  let column = 0;
  project.dancers.forEach((dancer, index) => {
    if (y > PAGE_HEIGHT - 66) {
      document.addPage();
      pageCount += 1;
      y = MARGIN;
      setFont(document, 15, true)
        .fillColor("#171b1f")
        .text(`${formation.name} · 座標明細`, MARGIN, y);
      y += 31;
      drawHeading();
      column = 0;
    }

    const x = MARGIN + column * (columnWidth + columnGap);
    const position = formation.positions[String(dancer.id)] ?? { x: 0, y: 0 };
    if (index % 2 === 0) {
      document.rect(x, y - 3, columnWidth, rowHeight).fill("#f3f1eb");
    }
    document.circle(x + 5, y + 5.5, 3.5).fill(safeColor(dancer.color));
    setFont(document, 7.5, true)
      .fillColor("#333834")
      .text(dancer.code, x + 13, y, { width: 48, lineBreak: false });
    setFont(document, 7.5)
      .fillColor("#777b77")
      .text(dancer.name || "未命名", x + 60, y, {
        width: columnWidth - 116,
        ellipsis: true,
        lineBreak: false
      });
    setFont(document, 7.2)
      .fillColor("#555a55")
      .text(
        `X ${formatNumber(position.x)}   Y ${formatNumber(position.y)}`,
        x + columnWidth - 58,
        y,
        { width: 56, align: "right", lineBreak: false }
      );

    if (column === 1) {
      y += rowHeight;
      column = 0;
    } else {
      column = 1;
    }
  });
}

function drawFooters(document, project) {
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index);
    const originalBottom = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document
      .moveTo(MARGIN, PAGE_HEIGHT - 38)
      .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 38)
      .lineWidth(0.7)
      .strokeColor("#ddd9cf")
      .stroke();
    setFont(document, 7)
      .fillColor("#8a8e89")
      .text(`Hanabi Stage · ${truncate(project.name, 44)}`, MARGIN, PAGE_HEIGHT - 29, {
        width: 390,
        lineBreak: false
      });
    setFont(document, 7)
      .fillColor("#8a8e89")
      .text(`${index + 1} / ${range.count}`, PAGE_WIDTH - MARGIN - 70, PAGE_HEIGHT - 29, {
        width: 70,
        align: "right",
        lineBreak: false
      });
    document.page.margins.bottom = originalBottom;
  }
}

function setFont(document, size, bold = false) {
  return document.font(bold ? "Bold" : "Body").fontSize(size);
}

function findFont(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function fitRect(maxWidth, maxHeight, ratio) {
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#f97316";
}

function contrastColor(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.62 ? "#171b1f" : "#ffffff";
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function truncate(value, length) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

module.exports = { buildProjectPdf };
