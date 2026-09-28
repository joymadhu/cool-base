import { reduceMotion } from "../lib/dom.js";

// Live pixel-grid mosaic panels, animated around the clock and driven by chain data:
//   globe   — spinning pixel Earth; every new block sends a ripple, its txns sparkle
//   terrain — scrolling activity strip; one column per block, height = txns in it,
//             with the 120-day DEX volume ridge drifting behind
//   blob    — flowing meme field; flow speed follows 24h meme trading activity

const CELL = 10; // css px per cell
const GAP = 2;   // gap between squares
const TICK_MS = 1000 / 20; // the pixel field updates 20x/s; cells fade smoothly between updates
// Panels always animate at full speed, whatever the OS motion setting.
const SPEED = 1;

const PALETTES = {
  globe:   { 1: "#ffffff", 2: "#ffd3e8", 3: "#fff4c2", 4: "#ff5fa8", hover: "#ffffff" },
  terrain: { 1: "#3f7f0c", 2: "#4f9214", 3: "#ffffff", 4: "#1b4300", hover: "#ffffff" },
  blob:    { 1: "#a8cbff", 2: "#dbe9ff", 3: "#0a1a4f", 4: "#ffffff", hover: "#ffffff" },
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

// ---------- live data fed in from the sections ----------
const live = {
  blockTxs: [],      // tx count per block, oldest → newest
  lastBlockAt: 0,    // seconds (animation clock) of the newest block
  pings: [],         // globe ripples { c, r, born }
  sparks: [],        // globe sparkles { i, born, life }
  volume: null,      // daily DEX volume history
  memeFlow: 1,       // blob flow multiplier
};

// ---------- shape generators: (panel, t seconds) -> Uint8Array of cell values ----------
function globe(p, t) {
  const { cols, rows } = p;
  const g = new Uint8Array(cols * rows);
  const cx = cols * 0.42, cy = rows * 0.46, R = Math.min(cols * 0.62, rows * 0.5);
  const spin = t * 1.6 * SPEED; // cells per second of longitude
  for (let r = 0; r < rows; r++) {
    const ny = (r - cy) / R;
    if (Math.abs(ny) >= 1) continue;
    const s = Math.sqrt(1 - ny * ny);
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot(c - cx, r - cy);
      if (d > R) continue;
      // Map the flat grid onto a sphere so continents curve as they rotate.
      const lon = Math.asin(Math.max(-1, Math.min(1, (c - cx) / (R * s))));
      const u = (lon / Math.PI) * R * 2.2 + spin;
      const n = fbm(u * 0.11, r * 0.11, 3);
      let v = 0;
      if (d > R - 1.2) v = 1;
      else if (n > 0.53) v = 1;
      else if (n > 0.46) v = 2;
      g[r * cols + c] = v;
    }
  }
  // Block ripples: a ring expanding from where the block "landed".
  live.pings = live.pings.filter((k) => t - k.born < 2.6);
  for (const k of live.pings) {
    const rad = (t - k.born) * 9;
    for (let r = Math.max(0, Math.floor(k.r - rad - 1)); r <= Math.min(rows - 1, k.r + rad + 1); r++)
      for (let c = Math.max(0, Math.floor(k.c - rad - 1)); c <= Math.min(cols - 1, k.c + rad + 1); c++) {
        const dd = Math.abs(Math.hypot(c - k.c, r - k.r) - rad);
        if (dd < 0.75 && Math.hypot(c - cx, r - cy) <= R) g[r * cols + c] = 3;
      }
  }
  // Transaction sparkles.
  live.sparks = live.sparks.filter((k) => t - k.born < k.life);
  for (const k of live.sparks) if (k.i < g.length && g[k.i]) g[k.i] = 3;
  // A satellite orbits the globe with a short pixel trail.
  for (let k = 0; k < 6; k++) {
    const a = t * 0.45 * SPEED - k * 0.05;
    const sc = Math.round(cx + Math.cos(a) * (R + 3)), sr = Math.round(cy + Math.sin(a) * (R * 0.45 + 2));
    const behind = Math.sin(a) < 0 && Math.hypot(sc - cx, sr - cy) < R;
    if (!behind && sc >= 0 && sr >= 0 && sc < cols && sr < rows) g[sr * cols + sc] = k === 0 ? 4 : 3;
  }
  p.geom = { cx, cy, R };
  return g;
}

function terrain(p, t) {
  const { cols, rows } = p;
  const g = new Uint8Array(cols * rows);

  // Far ridge: the 120-day DEX volume history, drifting slowly left forever.
  const vol = live.volume && live.volume.length > 4 ? live.volume : Array.from({ length: 60 }, (_, i) => fbm(i * 0.15, 0, 5));
  const vMin = Math.min(...vol), vMax = Math.max(...vol);
  const drift = t * 1 * SPEED;
  const volAt = (c) => {
    const f = ((((c + drift) / cols) * vol.length) % vol.length + vol.length) % vol.length;
    const i = Math.floor(f), k = f - i, a = vol[i], b = vol[(i + 1) % vol.length];
    return vMax > vMin ? (a + (b - a) * k - vMin) / (vMax - vMin) : 0.5;
  };

  // Near ridge: live txns per block, newest block at the right edge.
  const txs = live.blockTxs.length ? live.blockTxs : Array.from({ length: cols }, (_, i) => 60 + fbm(i * 0.2, t * 0.3, 8) * 120);
  const window = txs.slice(-cols);
  const tMax = Math.max(...window, 1), tMin = Math.min(...window);
  const offset = cols - window.length;
  const sinceBlock = t - live.lastBlockAt;

  for (let c = 0; c < cols; c++) {
    const hi = Math.round(rows * 0.44 - (0.08 + volAt(c) * 0.24) * rows);
    const j = c - offset;
    const txn = j >= 0 ? window[j] : tMin;
    const base = tMax > tMin ? (txn - tMin) / (tMax - tMin) : 0.5;
    // Bars pulse like a live equalizer on top of the real per-block values.
    const norm = Math.max(0, Math.min(1, base * 0.75 + 0.12 + Math.sin(t * 1.1 * SPEED + c * 0.35) * 0.07 + Math.sin(t * 1.7 * SPEED + c * 0.9) * 0.035));
    const low = Math.round(rows - (0.14 + norm * 0.46) * rows);
    const newest = j === window.length - 1;
    for (let r = 0; r < rows; r++) {
      let v = 0;
      if (r >= low) {
        if (newest && r === low && sinceBlock < 1.2) v = 3;        // the block that just landed
        else if (r - low < 2) v = newest ? 4 : 1;
        else v = fbm(c * 0.2, r * 0.2, 11) > 0.62 ? 1 : hash(c + Math.floor(t * 1.2 * SPEED), r, 4) < 0.68 ? 2 : 0; // shimmering texture
      } else if (r >= hi && r < hi + 3) v = 1;
      else if (r >= hi + 3 && r < rows * 0.46) v = hash(c, r, 6) < 0.3 ? 2 : 0;
      if (v === 0 && hash(c, r + Math.floor(t * 1 * SPEED), 21) < 0.005) v = 3; // drifting specks
      g[r * cols + c] = v;
    }
  }
  return g;
}

function blob(p, t) {
  const { cols, rows } = p;
  const g = new Uint8Array(cols * rows);
  const flow = t * 0.25 * live.memeFlow * SPEED;
  const on = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && fbm(c * 0.16 + flow * 0.3, r * 0.1 + flow, 17) + (c / cols) * 0.38 > 0.72;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!on(c, r)) continue;
    const edge = !on(c - 1, r) || !on(c + 1, r) || !on(c, r - 1) || !on(c, r + 1);
    g[r * cols + c] = edge && hash(c, r, 2) < 0.55 ? 3 : (c + r + Math.floor(t * 1.2 * SPEED)) % 2 ? 1 : 2;
  }
  return g;
}

const SHAPES = { globe, terrain, blob };

// A bright diagonal shimmer sweeps across every panel every few seconds.
function glint(p, t) {
  const { grid, cols, rows } = p;
  const span = cols + rows, period = 7 / SPEED;
  const phase = ((t + (p.kind === "terrain" ? 1 : p.kind === "blob" ? 2 : 0)) % period) / period;
  const pos = phase * (span + 20) - 10;
  for (let r = 0; r < rows; r++) {
    const c0 = Math.max(0, Math.floor(pos - r - 1)), c1 = Math.min(cols - 1, Math.ceil(pos - r + 1));
    for (let c = c0; c <= c1; c++) { const i = r * cols + c; if (grid[i]) grid[i] = p.kind === "terrain" ? 3 : 4; }
  }
}

// ---------- renderer ----------
const panels = [];
const clock = () => performance.now() / 1000;

function setup(canvas) {
  const kind = canvas.dataset.mosaic;
  const p = { canvas, kind, ctx: canvas.getContext("2d"), grid: null, cols: 0, rows: 0, start: 0, visible: false, revealed: false, pointer: null, twinkle: new Map() };
  p.resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.cols = Math.ceil(width / CELL);
    p.rows = Math.ceil(height / CELL);
    p.grid = SHAPES[kind](p, clock());
    draw(p, performance.now(), 1);
  };
  new ResizeObserver(p.resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    p.visible = e.isIntersecting;
    if (p.visible && !p.revealed) { p.revealed = true; p.start = performance.now(); }
    if (p.visible) loop();
  }, { threshold: 0.05 }).observe(canvas);
  canvas.parentElement.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    p.pointer = [e.clientX - r.left, e.clientY - r.top];
    loop();
  });
  canvas.parentElement.addEventListener("pointerleave", () => { p.pointer = null; loop(); });
  panels.push(p);
}

const REVEAL_MS = 1300;

const FADE = 5; // how fast a cell eases toward on/off, per second (higher = snappier)

function draw(p, now, dt) {
  const { ctx, grid, cols, rows } = p;
  if (!grid) return;
  const n = cols * rows;
  if (!p.alpha || p.alpha.length !== n) { p.alpha = new Float32Array(n); p.shown = new Uint8Array(n); }
  const { alpha, shown } = p;
  const pal = PALETTES[p.kind];
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);
  const t = !p.revealed ? 0 : reduceMotion ? Infinity : now - p.start;
  const spread = cols + rows;
  const ease = 1 - Math.exp(-dt * FADE);
  const tNow = clock();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    let v = grid[i];
    const x = c * CELL, y = r * CELL;
    if (p.pointer) {
      const d = Math.hypot(x + CELL / 2 - p.pointer[0], y + CELL / 2 - p.pointer[1]);
      if (d < 46) v = v || d < 30 ? 5 : 0;
    }
    const tw = p.twinkle.get(i);
    if (tw && tw > tNow && v !== 5) v = 0; // twinkle: briefly fade a cell out and back
    // Ease every cell toward its target so changes fade instead of snapping.
    if (v) shown[i] = v;
    alpha[i] += ((v ? 1 : 0) - alpha[i]) * ease;
    if (alpha[i] < 0.03) continue;
    // Diagonal reveal the first time the panel scrolls into view.
    const k = Math.max(0, Math.min(1, (t - ((c + r) / spread) * REVEAL_MS) / 260));
    if (k <= 0) continue;
    const sv = shown[i];
    ctx.globalAlpha = alpha[i];
    ctx.fillStyle = sv === 5 ? pal.hover : pal[sv];
    if (p.kind === "terrain" && sv === 2) {
      ctx.fillRect(x + 3, y, 2, Math.round(CELL * k)); // vertical line texture
    } else {
      const sz = Math.round((CELL - GAP) * (k < 1 ? 0.4 + 0.6 * k : 1));
      const o = Math.round((CELL - GAP - sz) / 2);
      ctx.fillRect(x + o, y + o, sz, sz);
    }
  }
  ctx.globalAlpha = 1;
}

let raf = 0, lastTick = 0, lastFrame = 0;
function loop() {
  if (raf) return;
  raf = requestAnimationFrame(function frame(now) {
    raf = 0;
    const visible = panels.filter((p) => p.visible && p.grid);
    if (!visible.length) { lastFrame = 0; return; } // sleeps until a panel scrolls back into view
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
    lastFrame = now;
    const tick = now - lastTick >= TICK_MS;
    if (tick) lastTick = now;
    const t = clock();
    visible.forEach((p) => {
      if (tick) {
        p.grid = SHAPES[p.kind](p, t);
        glint(p, t);
        if (Math.random() < 0.35) {
          const idx = Math.floor(Math.random() * p.grid.length);
          if (p.grid[idx]) p.twinkle.set(idx, t + 0.5 + Math.random() * 0.6);
        }
        for (const [k, until] of p.twinkle) if (until < t) p.twinkle.delete(k);
      }
      draw(p, now, dt); // every frame, so fades stay smooth at the display's refresh rate
    });
    raf = requestAnimationFrame(frame); // runs 24/7 while visible; the browser pauses it in background tabs
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) {
    el.textContent = text;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
}

export function initMosaics() {
  document.querySelectorAll("canvas[data-mosaic]").forEach(setup);
}

// A new block arrived: ripple on the globe, sparkles for its txns, a new column on the strip.
export function pushBlock({ number, txCount }) {
  const t = clock();
  live.blockTxs.push(txCount);
  if (live.blockTxs.length > 400) live.blockTxs.shift();
  live.lastBlockAt = t;
  const g = panels.find((p) => p.kind === "globe");
  if (g && g.geom) {
    const { cx, cy, R } = g.geom;
    const a = Math.random() * Math.PI * 2, d = Math.random() * R * 0.7;
    live.pings.push({ c: cx + Math.cos(a) * d, r: cy + Math.sin(a) * d, born: t });
    const n = Math.min(60, Math.round(txCount / 4));
    for (let i = 0; i < n; i++) live.sparks.push({ i: Math.floor(Math.random() * g.cols * g.rows), born: t + Math.random() * 2, life: 0.7 + Math.random() * 1.2 });
  }
  setText("mGlobe", `#${number.toLocaleString()} · ${txCount} txns`);
  const recent = live.blockTxs.slice(-30);
  setText("mTerrain", `${Math.round(recent.reduce((s, x) => s + x, 0) / recent.length)} txns per block, live`);
}

// Blob flows faster when memes trade more; label shows their combined 24h volume.
export function setMemeStats({ count, volume, txns }) {
  live.memeFlow = Math.max(0.7, Math.min(1.8, 0.7 + txns / 60000));
  const v = volume >= 1e9 ? (volume / 1e9).toFixed(2) + "B" : volume >= 1e6 ? (volume / 1e6).toFixed(1) + "M" : (volume / 1e3).toFixed(0) + "K";
  setText("mBlob", `$${v} 24h vol`);
  setText("mBlobTag", `${count} memes · live`);
}

// Daily DEX volume history for the far ridge on the lime panel.
export function setVolumeTerrain(values) {
  live.volume = values;
}
