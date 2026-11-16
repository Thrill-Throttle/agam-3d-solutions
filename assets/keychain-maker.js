(() => {
  "use strict";

  const WIDTH = 75;
  const HEIGHT = 20;
  const CORNER_RADIUS = 4;
  const HOLE_RADIUS = 2.5;
  const HOLE_X = -WIDTH / 2 + 8;
  const BASE_THICKNESS = 3;
  const LETTER_HEIGHT = 1.2;
  const TEXT_SAFE_WIDTH = 58;
  const TEXT_CENTER_X = 5;
  const MIN_MODULE = 0.8;
  const MAX_MODULE = 1.45;
  const MAX_CHARACTERS = 32;
  const FONT = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    5: ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  };
  const elements = {
    canvas: document.getElementById("preview"),
    input: document.getElementById("keychain-text"),
    count: document.getElementById("char-count"),
    message: document.getElementById("validation-message"),
    download: document.getElementById("download-stl"),
    downloadLabel: document.getElementById("download-label"),
    reset: document.getElementById("reset-view"),
    menuToggle: document.getElementById("menu-toggle"),
    siteNav: document.getElementById("site-nav"),
    year: document.getElementById("year"),
  };
  const context = elements.canvas.getContext("2d");
  const pointer = { yaw: -0.22, pitch: 0.82, active: false, lastX: 0, lastY: 0 };
  let latestLayout = null;
  let validForExport = false;
  let generating = false;

  function getLayout(text) {
    if (!text.length) return { text, module: 0, glyphs: [], width: 0, supported: true };
    if ([...text].some((character) => !FONT[character] && character !== " ")) {
      return { text, module: 0, glyphs: [], width: 0, supported: false };
    }

    const unitsWide = text.length * 5 + Math.max(0, text.length - 1);
    const module = Math.min(MAX_MODULE, TEXT_SAFE_WIDTH / unitsWide);
    const width = unitsWide * module;
    const left = TEXT_CENTER_X - width / 2;
    const glyphs = [];

    [...text].forEach((character, characterIndex) => {
      const rows = FONT[character];
      if (!rows) return;
      const characterLeft = left + characterIndex * 6 * module;
      rows.forEach((row, rowIndex) => {
        for (let column = 0; column < 5; column += 1) {
          if (row[column] !== "1") continue;
          const x0 = characterLeft + column * module;
          const y0 = (2.5 - rowIndex) * module;
          glyphs.push({
            x0,
            y0,
            x1: x0 + module,
            y1: y0 + module,
          });
        }
      });
      for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
        for (let column = 0; column < 4; column += 1) {
          if (rows[rowIndex][column] === "1" && rows[rowIndex + 1][column + 1] === "1" &&
              rows[rowIndex][column + 1] === "0" && rows[rowIndex + 1][column] === "0") {
            const centerX = characterLeft + (column + 1) * module;
            const centerY = (2.5 - rowIndex) * module;
            const bridgeSize = module * 0.5;
            glyphs.push({
              x0: centerX - bridgeSize / 2,
              y0: centerY - bridgeSize / 2,
              x1: centerX + bridgeSize / 2,
              y1: centerY + bridgeSize / 2,
            });
          } else if (rows[rowIndex][column + 1] === "1" && rows[rowIndex + 1][column] === "1" &&
              rows[rowIndex][column] === "0" && rows[rowIndex + 1][column + 1] === "0") {
            const centerX = characterLeft + (column + 1) * module;
            const centerY = (2.5 - rowIndex) * module;
            const bridgeSize = module * 0.5;
            glyphs.push({
              x0: centerX - bridgeSize / 2,
              y0: centerY - bridgeSize / 2,
              x1: centerX + bridgeSize / 2,
              y1: centerY + bridgeSize / 2,
            });
          }
        }
      }
    });

    return { text, module, glyphs, width, supported: true };
  }

  function roundedOutline() {
    const points = [];
    const halfWidth = WIDTH / 2;
    const halfHeight = HEIGHT / 2;
    const corners = [
      [halfWidth - CORNER_RADIUS, -halfHeight + CORNER_RADIUS, -90],
      [halfWidth - CORNER_RADIUS, halfHeight - CORNER_RADIUS, 0],
      [-halfWidth + CORNER_RADIUS, halfHeight - CORNER_RADIUS, 90],
      [-halfWidth + CORNER_RADIUS, -halfHeight + CORNER_RADIUS, 180],
    ];
    for (const [centerX, centerY, startAngle] of corners) {
      for (let step = 0; step <= 8; step += 1) {
        const angle = (startAngle + step * 90 / 8) * Math.PI / 180;
        points.push([
          centerX + CORNER_RADIUS * Math.cos(angle),
          centerY + CORNER_RADIUS * Math.sin(angle),
        ]);
      }
    }
    return points;
  }

  const OUTLINE = roundedOutline();
  const HOLE_OUTLINE = Array.from({ length: 64 }, (_, index) => {
    const angle = -2 * Math.PI * index / 64;
    return [HOLE_X + HOLE_RADIUS * Math.cos(angle), HOLE_RADIUS * Math.sin(angle)];
  });

  function project(x, y, z, scale, centerX, centerY) {
    const cosYaw = Math.cos(pointer.yaw);
    const sinYaw = Math.sin(pointer.yaw);
    const cosPitch = Math.cos(pointer.pitch);
    const sinPitch = Math.sin(pointer.pitch);
    const rotatedX = x * cosYaw - y * sinYaw;
    const rotatedY = x * sinYaw + y * cosYaw;
    return [
      centerX + rotatedX * scale,
      centerY - (rotatedY * cosPitch - z * sinPitch) * scale,
    ];
  }

  function pathAt(points, z, scale, centerX, centerY, close = true, begin = true) {
    const projected = points.map(([x, y]) => project(x, y, z, scale, centerX, centerY));
    if (begin) context.beginPath();
    context.moveTo(projected[0][0], projected[0][1]);
    for (let index = 1; index < projected.length; index += 1) {
      context.lineTo(projected[index][0], projected[index][1]);
    }
    if (close) context.closePath();
    return projected;
  }

  function paintSides(points, scale, centerX, centerY, topZ, bottomZ, color, visibleOnly = true) {
    for (let index = 0; index < points.length; index += 1) {
      paintSideSegment(points[index], points[(index + 1) % points.length], scale, centerX, centerY, topZ, bottomZ, color, visibleOnly);
    }
  }

  function paintSideSegment(start, end, scale, centerX, centerY, topZ, bottomZ, color, visibleOnly = true) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const outwardX = dy;
    const outwardY = -dx;
    if (visibleOnly && outwardX * Math.sin(pointer.yaw) + outwardY * Math.cos(pointer.yaw) <= 0) return;
    const firstBottom = project(start[0], start[1], bottomZ, scale, centerX, centerY);
    const secondBottom = project(end[0], end[1], bottomZ, scale, centerX, centerY);
    const secondTop = project(end[0], end[1], topZ, scale, centerX, centerY);
    const firstTop = project(start[0], start[1], topZ, scale, centerX, centerY);
    context.beginPath();
    context.moveTo(...firstBottom);
    context.lineTo(...secondBottom);
    context.lineTo(...secondTop);
    context.lineTo(...firstTop);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = "rgba(0, 0, 0, .24)";
    context.lineWidth = 0.55;
    context.stroke();
  }

  function paintTopSurface(scale, centerX, centerY) {
    pathAt(OUTLINE, BASE_THICKNESS, scale, centerX, centerY);
    pathAt(HOLE_OUTLINE, BASE_THICKNESS, scale, centerX, centerY, true, false);
    context.fillStyle = "#1687ff";
    context.fill("evenodd");
  }

  function glyphNeighbours(cell, module, glyphs) {
    return [
      { x: cell.x0 - module, y: (cell.y0 + cell.y1) / 2, start: [cell.x0, cell.y1], end: [cell.x0, cell.y0] },
      { x: cell.x1 + module, y: (cell.y0 + cell.y1) / 2, start: [cell.x1, cell.y0], end: [cell.x1, cell.y1] },
      { x: (cell.x0 + cell.x1) / 2, y: cell.y0 - module, start: [cell.x1, cell.y0], end: [cell.x0, cell.y0] },
      { x: (cell.x0 + cell.x1) / 2, y: cell.y1 + module, start: [cell.x0, cell.y1], end: [cell.x1, cell.y1] },
    ].filter((edge) => !glyphs.some((other) =>
      edge.x >= other.x0 - 0.001 && edge.x <= other.x1 + 0.001 &&
      edge.y >= other.y0 - 0.001 && edge.y <= other.y1 + 0.001));
  }

  function drawRaisedText(scale, centerX, centerY) {
    if (!latestLayout?.supported || !latestLayout.glyphs.length) return;
    const glyphs = latestLayout.glyphs;
    for (const cell of glyphs) {
      for (const edge of glyphNeighbours(cell, latestLayout.module, glyphs)) {
        paintSideSegment(edge.start, edge.end, scale, centerX, centerY, BASE_THICKNESS + LETTER_HEIGHT, BASE_THICKNESS, "#090c12", false);
      }
    }
    for (const cell of glyphs) drawCellTop(cell, scale, centerX, centerY, "#11151d");
  }

  function drawCellTop(cell, scale, centerX, centerY, color) {
    pathAt([
      [cell.x0, cell.y0],
      [cell.x1, cell.y0],
      [cell.x1, cell.y1],
      [cell.x0, cell.y1],
    ], BASE_THICKNESS + LETTER_HEIGHT, scale, centerX, centerY);
    context.fillStyle = color;
    context.fill();
  }

  function render() {
    const bounds = elements.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    elements.canvas.width = Math.round(bounds.width * ratio);
    elements.canvas.height = Math.round(bounds.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const widthExtent = WIDTH * Math.abs(Math.cos(pointer.yaw)) + HEIGHT * Math.abs(Math.sin(pointer.yaw));
    const heightExtent = (WIDTH * Math.abs(Math.sin(pointer.yaw)) + HEIGHT * Math.abs(Math.cos(pointer.yaw))) *
      Math.cos(pointer.pitch) + (BASE_THICKNESS + LETTER_HEIGHT) * Math.sin(pointer.pitch);
    const scale = Math.min((bounds.width - 55) / widthExtent, (bounds.height - 70) / heightExtent);
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2 + 1;

    paintSides(OUTLINE, scale, centerX, centerY, BASE_THICKNESS, 0, "#09111c");
    paintSides(HOLE_OUTLINE, scale, centerX, centerY, BASE_THICKNESS, 0, "#090d14");

    paintTopSurface(scale, centerX, centerY);
    drawRaisedText(scale, centerX, centerY);

    pathAt(OUTLINE, BASE_THICKNESS + 0.015, scale, centerX, centerY);
    context.strokeStyle = "rgba(5, 9, 15, .78)";
    context.lineWidth = Math.max(1, scale * 0.22);
    context.stroke();

    pathAt(HOLE_OUTLINE, BASE_THICKNESS, scale, centerX, centerY);
    context.strokeStyle = "#08111c";
    context.lineWidth = Math.max(1, scale * 0.2);
    context.stroke();
    context.fillStyle = "rgba(225, 238, 255, .63)";
    context.font = "10px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(pointer.active ? "Release to finish rotating" : "Click and drag to rotate", centerX, bounds.height - 27);
  }

  function setMessage(message, state) {
    elements.message.textContent = message;
    if (state) elements.message.dataset.state = state;
    else delete elements.message.dataset.state;
  }

  function updateDesign() {
    const input = elements.input.value.toUpperCase();
    if (input !== elements.input.value) {
      const selectionStart = elements.input.selectionStart;
      const selectionEnd = elements.input.selectionEnd;
      elements.input.value = input;
      elements.input.setSelectionRange(selectionStart, selectionEnd);
    }

    const text = elements.input.value;
    elements.count.textContent = `${text.length} / ${MAX_CHARACTERS}`;
    latestLayout = getLayout(text);
    validForExport = false;

    if (!text.trim()) {
      setMessage("Enter at least one letter or number to make your keychain.", "error");
    } else if (!/^[A-Z0-9 -]+$/.test(text)) {
      setMessage("Use uppercase letters, numbers, spaces, and hyphens only. Remove any other characters.", "error");
    } else if (!latestLayout.supported) {
      setMessage("This text contains a character that does not have a printable letter shape.", "error");
    } else if (latestLayout.module < MIN_MODULE) {
      setMessage(`This text needs ${latestLayout.module.toFixed(2)} mm lettering to fit. Shorten it until each letter is at least ${MIN_MODULE.toFixed(1)} mm for a 0.4 mm nozzle.`, "warning");
    } else {
      validForExport = true;
      setMessage(`Looks printable. Letter modules are ${latestLayout.module.toFixed(2)} mm; text is centered in the safe area clear of the keyring hole.`, "success");
    }

    elements.download.disabled = !validForExport || generating;
    render();
  }

  function setRoundedFootprint(mask, columns, rows, xCoordinates, yCoordinates, layout) {
    let occupied = 0;
    for (let row = 0; row < rows; row += 1) {
      const y = (yCoordinates[row] + yCoordinates[row + 1]) / 2;
      for (let column = 0; column < columns; column += 1) {
        const x = (xCoordinates[column] + xCoordinates[column + 1]) / 2;
        const cornerX = Math.max(Math.abs(x) - (WIDTH / 2 - CORNER_RADIUS), 0);
        const cornerY = Math.max(Math.abs(y) - (HEIGHT / 2 - CORNER_RADIUS), 0);
        if (
          cornerX * cornerX + cornerY * cornerY <= CORNER_RADIUS * CORNER_RADIUS &&
          (x - HOLE_X) * (x - HOLE_X) + y * y >= HOLE_RADIUS * HOLE_RADIUS
        ) {
          mask[row * columns + column] = 1;
          occupied += 1;
        }
      }
    }

    if (!layout.glyphs.length) return occupied;
    for (const glyph of layout.glyphs) {
      let firstColumn = Math.max(0, Math.floor((glyph.x0 + WIDTH / 2) / ((xCoordinates[columns] - xCoordinates[0]) / columns)));
      let lastColumn = Math.min(columns - 1, Math.floor((glyph.x1 + WIDTH / 2) / ((xCoordinates[columns] - xCoordinates[0]) / columns)));
      let firstRow = Math.max(0, Math.floor((glyph.y0 + HEIGHT / 2) / ((yCoordinates[rows] - yCoordinates[0]) / rows)));
      let lastRow = Math.min(rows - 1, Math.floor((glyph.y1 + HEIGHT / 2) / ((yCoordinates[rows] - yCoordinates[0]) / rows)));
      while (firstColumn <= lastColumn && xCoordinates[firstColumn + 1] <= glyph.x0) firstColumn += 1;
      while (lastColumn >= firstColumn && xCoordinates[lastColumn] >= glyph.x1) lastColumn -= 1;
      while (firstRow <= lastRow && yCoordinates[firstRow + 1] <= glyph.y0) firstRow += 1;
      while (lastRow >= firstRow && yCoordinates[lastRow] >= glyph.y1) lastRow -= 1;
      for (let row = firstRow; row <= lastRow; row += 1) {
        const y = (yCoordinates[row] + yCoordinates[row + 1]) / 2;
        if (y < glyph.y0 || y >= glyph.y1) continue;
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const x = (xCoordinates[column] + xCoordinates[column + 1]) / 2;
          const index = row * columns + column;
          if (x >= glyph.x0 && x < glyph.x1 && mask[index] === 1) mask[index] = 2;
        }
      }
    }
    return occupied;
  }

  function buildBinaryStl(layout) {
    const pitch = 0.15;
    const columns = Math.ceil(WIDTH / pitch);
    const rows = Math.ceil(HEIGHT / pitch);
    const deltaX = WIDTH / columns;
    const deltaY = HEIGHT / rows;
    const xCoordinates = Float64Array.from({ length: columns + 1 }, (_, index) => -WIDTH / 2 + index * deltaX);
    const yCoordinates = Float64Array.from({ length: rows + 1 }, (_, index) => -HEIGHT / 2 + index * deltaY);
    const mask = new Uint8Array(columns * rows);
    setRoundedFootprint(mask, columns, rows, xCoordinates, yCoordinates, layout);

    let triangleCount = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if (!mask[index]) continue;
        triangleCount += 4;
        const neighbours = [
          row === 0 ? 0 : mask[index - columns],
          column === columns - 1 ? 0 : mask[index + 1],
          row === rows - 1 ? 0 : mask[index + columns],
          column === 0 ? 0 : mask[index - 1],
        ];
        for (const neighbour of neighbours) {
          if (!neighbour || (mask[index] === 2 && neighbour === 1)) triangleCount += 2;
        }
      }
    }

    const buffer = new ArrayBuffer(84 + triangleCount * 50);
    const view = new DataView(buffer);
    const header = new TextEncoder().encode("AGAM 3D SOLUTIONS | millimetres | geometry only");
    new Uint8Array(buffer, 0, header.length).set(header);
    view.setUint32(80, triangleCount, true);
    let offset = 84;

    function triangle(a, b, c) {
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const abz = b[2] - a[2];
      const acx = c[0] - a[0];
      const acy = c[1] - a[1];
      const acz = c[2] - a[2];
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const magnitude = Math.hypot(nx, ny, nz) || 1;
      view.setFloat32(offset, nx / magnitude, true);
      view.setFloat32(offset + 4, ny / magnitude, true);
      view.setFloat32(offset + 8, nz / magnitude, true);
      offset += 12;
      for (const point of [a, b, c]) {
        view.setFloat32(offset, point[0], true);
        view.setFloat32(offset + 4, point[1], true);
        view.setFloat32(offset + 8, point[2], true);
        offset += 12;
      }
      offset += 2;
    }

    function quad(a, b, c, d) {
      triangle(a, b, c);
      triangle(a, c, d);
    }

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const cell = mask[index];
        if (!cell) continue;
        const x0 = xCoordinates[column];
        const x1 = xCoordinates[column + 1];
        const y0 = yCoordinates[row];
        const y1 = yCoordinates[row + 1];
        const z = cell === 2 ? BASE_THICKNESS + LETTER_HEIGHT : BASE_THICKNESS;
        const bottomLeft = [x0, y0, 0];
        const bottomRight = [x1, y0, 0];
        const topRight = [x1, y1, 0];
        const topLeft = [x0, y1, 0];
        const topBottomLeft = [x0, y0, z];
        const topBottomRight = [x1, y0, z];
        const topTopRight = [x1, y1, z];
        const topTopLeft = [x0, y1, z];

        triangle(topBottomLeft, topBottomRight, topTopRight);
        triangle(topBottomLeft, topTopRight, topTopLeft);
        triangle(bottomLeft, topRight, bottomRight);
        triangle(bottomLeft, topLeft, topRight);

        const neighbours = [
          row === 0 ? 0 : mask[index - columns],
          column === columns - 1 ? 0 : mask[index + 1],
          row === rows - 1 ? 0 : mask[index + columns],
          column === 0 ? 0 : mask[index - 1],
        ];
        const sides = [
          [[x0, y0], [x1, y0]],
          [[x1, y0], [x1, y1]],
          [[x1, y1], [x0, y1]],
          [[x0, y1], [x0, y0]],
        ];
        for (let side = 0; side < 4; side += 1) {
          const neighbour = neighbours[side];
          const [start, end] = sides[side];
          if (!neighbour) {
            quad(
              [start[0], start[1], 0],
              [end[0], end[1], 0],
              [end[0], end[1], z],
              [start[0], start[1], z],
            );
          } else if (cell === 2 && neighbour === 1) {
            quad(
              [start[0], start[1], BASE_THICKNESS],
              [end[0], end[1], BASE_THICKNESS],
              [end[0], end[1], z],
              [start[0], start[1], z],
            );
          }
        }
      }
    }

    if (offset !== buffer.byteLength) {
      throw new Error("STL triangle count did not match the generated mesh.");
    }
    return buffer;
  }

  function downloadStl() {
    if (!validForExport || generating) return;
    generating = true;
    elements.download.disabled = true;
    elements.downloadLabel.textContent = "Building your STL…";
    setMessage("Building a watertight, print-ready mesh in your browser. This may take a few seconds.", "success");

    window.setTimeout(() => {
      try {
        const buffer = buildBinaryStl(latestLayout);
        const fileNameText = latestLayout.text.trim().replace(/ +/g, "-").replace(/-+/g, "-");
        const blob = new Blob([buffer], { type: "model/stl" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `keychain-${fileNameText}.stl`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage(`Downloaded keychain-${fileNameText}.stl. Its dimensions are 75 × 20 × 4.2 mm.`, "success");
      } catch (error) {
        console.error("Could not build the keychain STL:", error);
        setMessage("The STL could not be generated. Please try again; no file was downloaded.", "error");
      } finally {
        generating = false;
        elements.downloadLabel.textContent = "Download STL";
        elements.download.disabled = !validForExport;
      }
    }, 40);
  }

  elements.input.addEventListener("input", updateDesign);
  elements.download.addEventListener("click", downloadStl);
  elements.reset.addEventListener("click", () => {
    pointer.yaw = -0.22;
    pointer.pitch = 0.82;
    render();
  });
  elements.menuToggle.addEventListener("click", () => {
    const expanded = elements.menuToggle.getAttribute("aria-expanded") === "true";
    elements.menuToggle.setAttribute("aria-expanded", String(!expanded));
    elements.menuToggle.setAttribute("aria-label", expanded ? "Open navigation menu" : "Close navigation menu");
    elements.siteNav.classList.toggle("open", !expanded);
  });
  elements.siteNav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      elements.siteNav.classList.remove("open");
      elements.menuToggle.setAttribute("aria-expanded", "false");
      elements.menuToggle.setAttribute("aria-label", "Open navigation menu");
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) {
      elements.siteNav.classList.remove("open");
      elements.menuToggle.setAttribute("aria-expanded", "false");
      elements.menuToggle.setAttribute("aria-label", "Open navigation menu");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      elements.siteNav.classList.remove("open");
      elements.menuToggle.setAttribute("aria-expanded", "false");
      elements.menuToggle.setAttribute("aria-label", "Open navigation menu");
    }
  });
  elements.canvas.addEventListener("pointerdown", (event) => {
    pointer.active = true;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    elements.canvas.setPointerCapture(event.pointerId);
    render();
  });
  elements.canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active) return;
    pointer.yaw += (event.clientX - pointer.lastX) * 0.012;
    pointer.pitch = Math.max(0.22, Math.min(1.42, pointer.pitch + (event.clientY - pointer.lastY) * 0.009));
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    render();
  });
  elements.canvas.addEventListener("pointerup", () => {
    pointer.active = false;
    render();
  });
  elements.canvas.addEventListener("pointercancel", () => {
    pointer.active = false;
    render();
  });
  window.addEventListener("resize", render);

  elements.year.textContent = new Date().getFullYear();
  updateDesign();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./assets/keychain-service-worker.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        console.info("The AGAM keychain maker is ready to use offline.");
      })
      .catch((error) => {
        console.warn("The keychain maker could not be saved for offline use:", error);
      });
  }
})();
