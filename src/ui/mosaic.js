import { reduceMotion } from "../lib/dom.js";

// Pixel-grid mosaic panels (pink globe, lime volume terrain, blue meme blob).
// Each panel is a canvas grid of square cells; a cell's value picks its colour.

const CELL = 10; // css px per cell
const GAP = 2;   // gap between squares

const PALETTES = {
  globe:   { 1: "#ffffff", 2: "#ffd3e8", 3: "#fff4c2", hover: "#ffffff" },
  terrain: { 1: "#3f7f0c", 2: "#4f9214", 3: "#ffffff", hover: "#ffffff" },
  blob:    { 1: "#a8cbff", 2: "#dbe9ff", 3: "#0a1a4f", hover: "#ffffff" },
};

// ---------- deterministic value noise ----------
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
const fbm = (x, y, seed) => noise(x, y, seed) * 0.6 + noise(x * 2, y * 2, seed + 7) * 0.28 + noise(x * 4, y * 4, seed + 13) * 0.12;

// ---------- shape generators: (cols, rows) -> Uint8Array of cell values ----------
function globe(cols, rows) {
  const g = new Uint8Array(cols * rows);
  const cx = cols * 0.42, cy = rows * 0.46, R = Math.min(cols * 0.62, rows * 0.5);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = Math.hypot(c - cx, (r - cy) * 1.02);
    if (d > R) continue;
    const n = fbm(c * 0.11, r * 0.11, 3);
    let v = 0;
    if (d > R - 1.2) v = 1;
    else if (n > 0.53) v = hash(c, r, 9) < 0.05 ? 3 : 1;
    else if (n > 0.46) v = 2;
    g[r * cols + c] = v;
  }
  return g;
}

let terrainData = null;
function terrain(cols, rows) {
  const g = new Uint8Array(cols * rows);
  const src = terrainData && terrainData.length > 4 ? terrainData : Array.from({ length: 60 }, (_, i) => fbm(i * 0.15, 0, 5));
  const min = Math.min(...src), max = Math.max(...src);
  const h = (c) => {
    const f = (c / Math.max(1, cols - 1)) * (src.length - 1), i = Math.floor(f), k = f - i;
    const v = src[i] + ((src[Math.min(i + 1, src.length - 1)] ?? src[i]) - src[i]) * k;
    return max > min ? (v - min) / (max - min) : 0.5;
  };
  for (let c = 0; c < cols; c++) {
    const low = Math.round(rows - (0.18 + h(c) * 0.5) * rows);          // main ridge: real volume
    const high = Math.round(rows * 0.42 - (0.1 + h((c + cols * 0.35) % cols) * 0.22) * rows); // echo ridge
    for (let r = 0; r < rows; r++) {
      let v = 0;
      if (r >= low) v = r - low < 3 || fbm(c * 0.2, r * 0.2, 11) > 0.62 ? 1 : hash(c, r, 4) < 0.7 ? 2 : 0;
      else if (r >= high && r < high + 4) v = 1;
      else if (r >= high + 4 && r < rows * 0.46) v = hash(c, r, 6) < 0.35 ? 2 : 0;
      if (v === 0 && hash(c, r, 21) < 0.006) v = 3;
      g[r * cols + c] = v;
    }
  }
  return g;
}

function blob(cols, rows) {
  const g = new Uint8Array(cols * rows);
  const on = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && fbm(c * 0.16, r * 0.1, 17) + (c / cols) * 0.38 > 0.72;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!on(c, r)) continue;
    const edge = !on(c - 1, r) || !on(c + 1, r) || !on(c, r - 1) || !on(c, r + 1);
    g[r * cols + c] = edge && hash(c, r, 2) < 0.55 ? 3 : (c + r) % 2 ? 1 : 2;
  }
  return g;
}

const SHAPES = { globe, terrain, blob };

// ---------- renderer ----------
const panels = [];

function setup(canvas) {
  const kind = canvas.dataset.mosaic;
  const p = { canvas, kind, ctx: canvas.getContext("2d"), grid: null, cols: 0, rows: 0, start: 0, visible: false, revealed: false, pointer: null, twinkle: new Map() };
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.cols = Math.ceil(width / CELL);
    p.rows = Math.ceil(height / CELL);
    p.grid = SHAPES[kind](p.cols, p.rows);
    draw(p, performance.now());
  };
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    p.visible = e.isIntersecting;
    if (p.visible && !p.revealed) { p.revealed = true; p.start = performance.now(); }
    if (p.visible) loop();
  }, { threshold: 0.15 }).observe(canvas);
  canvas.parentElement.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    p.pointer = [e.clientX - r.left, e.clientY - r.top];
    loop();
  });
  canvas.parentElement.addEventListener("pointerleave", () => { p.pointer = null; p.dirty = true; loop(); });
  panels.push(p);
  p.resize = resize;
}

const REVEAL_MS = 1300;

function draw(p, now) {
  const { ctx, grid, cols, rows } = p;
  if (!grid) return false;
  const pal = PALETTES[p.kind];
  const w = cols * CELL, h = rows * CELL;
  ctx.clearRect(0, 0, w, h);
  const t = !p.revealed ? 0 : reduceMotion ? Infinity : now - p.start;
  const spread = cols + rows;
  let animating = t < REVEAL_MS + 400;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let v = grid[r * cols + c];
    const x = c * CELL, y = r * CELL;
    let hover = false;
    if (p.pointer) {
      const d = Math.hypot(x + CELL / 2 - p.pointer[0], y + CELL / 2 - p.pointer[1]);
      if (d < 46) { hover = true; if (!v) v = d < 30 ? 2 : 0; }
    }
    if (!v) continue;
    // Diagonal reveal: each cell grows in after a delay based on its position.
    const k = Math.max(0, Math.min(1, (t - ((c + r) / spread) * REVEAL_MS) / 260));
    if (k <= 0) continue;
    const tw = p.twinkle.get(r * cols + c);
    ctx.fillStyle = hover ? pal.hover : tw ? pal[tw] : pal[v];
    if (p.kind === "terrain" && v === 2 && !hover) {
      ctx.fillRect(x + 3, y, 2, Math.round(CELL * k)); // vertical line texture
    } else {
      const s = Math.round((CELL - GAP) * (k < 1 ? 0.4 + 0.6 * k : 1));
      const o = Math.round((CELL - GAP - s) / 2);
      ctx.fillRect(x + o, y + o, s, s);
    }
  }
  return animating;
}

let raf = 0, lastTwinkle = 0;
function loop() {
  if (raf) return;
  raf = requestAnimationFrame(function frame(now) {
    raf = 0;
    let again = false, ticked = false;
    if (!reduceMotion && now - lastTwinkle > 140) {
      ticked = true;
      lastTwinkle = now;
      panels.forEach((p) => {
        if (!p.visible || !p.grid) return;
        p.twinkle.clear();
        for (let i = 0; i < 6; i++) {
          const idx = Math.floor(Math.random() * p.grid.length);
          if (p.grid[idx]) p.twinkle.set(idx, p.grid[idx] === 1 ? 2 : 1);
        }
      });
    }
    panels.forEach((p) => {
      if (!p.visible) return;
      const busy = p.pointer || now - p.start < REVEAL_MS + 400;
      if (!busy && !ticked && !p.dirty) return; // nothing changed since the last paint
      p.dirty = false;
      if (draw(p, now) || p.pointer) again = true;
    });
    // Keep the gentle twinkle running while any panel is on screen.
    if (again || (!reduceMotion && panels.some((p) => p.visible))) raf = requestAnimationFrame(frame);
  });
}

export function initMosaics() {
  document.querySelectorAll("canvas[data-mosaic]").forEach(setup);
}

// Redraw the lime panel's ridge line from real daily DEX volume.
export function setVolumeTerrain(values) {
  terrainData = values;
  panels.filter((p) => p.kind === "terrain").forEach((p) => p.resize());
}
