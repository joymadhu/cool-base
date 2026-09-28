// Page-wide pixel hover: a cluster of squares lights up around the pointer,
// leaves a fading trail as it moves, and bursts into a pixel ring on click.
// Drawn on one fixed canvas above the page (multiply blend, so text stays readable).

const CELL = 12;       // grid pitch in css px
const SIZE = 9;        // square size inside a cell
const RADIUS = 34;     // px radius of the lit cluster around the pointer
const FADE = 2.6;      // intensity decay per second (higher = shorter trail)

const BLUE = [0, 0, 255], LILAC = [213, 143, 245], GREEN = [18, 161, 80];

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function initPixelCursor() {
  // Mouse / trackpad only; phones and tablets keep a clean page.
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "pixel-cursor";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);

  const cells = new Map(); // "c,r" -> { c, r, a (0..1), pop (0..1) }
  const ripples = [];      // { x, y, born }
  let last = null, raf = 0, prev = 0;

  function light(x, y, strength = 1) {
    const c0 = Math.floor((x - RADIUS) / CELL), c1 = Math.floor((x + RADIUS) / CELL);
    const r0 = Math.floor((y - RADIUS) / CELL), r1 = Math.floor((y + RADIUS) / CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot(c * CELL + CELL / 2 - x, r * CELL + CELL / 2 - y);
      if (d > RADIUS) continue;
      // Solid core, softer rim — the same pixel "blob" as the mosaic panels.
      const a = (d < RADIUS * 0.72 ? 1 : 0.45) * strength;
      const key = c + "," + r;
      const cell = cells.get(key);
      if (cell) { if (a > cell.a) { cell.a = a; } }
      else cells.set(key, { c, r, a, pop: 0 });
    }
  }

  // Only react over the page itself; the mosaic panels already have their own hover.
  const skip = (el) => el && el.closest && el.closest(".mosaic, .masthead");

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || skip(e.target)) { last = null; return; }
    const p = [e.clientX, e.clientY];
    if (last) {
      // Fill the gap between events so fast moves leave a continuous trail.
      const dist = Math.hypot(p[0] - last[0], p[1] - last[1]);
      const steps = Math.min(24, Math.ceil(dist / (CELL * 0.8)));
      for (let i = 1; i < steps; i++) light(last[0] + ((p[0] - last[0]) * i) / steps, last[1] + ((p[1] - last[1]) * i) / steps, 0.8);
    }
    light(p[0], p[1]);
    last = p;
    start();
  }, { passive: true });
  document.addEventListener("pointerleave", () => (last = null));
  addEventListener("scroll", () => (last = null), { passive: true });

  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || skip(e.target)) return;
    ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
    start();
  });

  function start() {
    if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    ctx.clearRect(0, 0, w, h);

    // Click bursts: a pixel ring that grows and fades.
    for (let i = ripples.length - 1; i >= 0; i--) {
      const k = (now - ripples[i].born) / 700;
      if (k >= 1) { ripples.splice(i, 1); continue; }
      const rad = 12 + k * 110, { x, y } = ripples[i];
      const steps = Math.ceil((rad * Math.PI * 2) / CELL);
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const c = Math.floor((x + Math.cos(a) * rad) / CELL), r = Math.floor((y + Math.sin(a) * rad) / CELL);
        const key = c + "," + r, v = 1 - k;
        const cell = cells.get(key);
        if (cell) cell.a = Math.max(cell.a, v); else cells.set(key, { c, r, a: v, pop: 0 });
      }
    }

    const decay = Math.exp(-dt * FADE);
    for (const [key, cell] of cells) {
      cell.a *= decay;
      cell.pop = Math.min(1, cell.pop + dt * 9); // squares pop in, then fade
      if (cell.a < 0.02) { cells.delete(key); continue; }
      const n = hash(cell.c, cell.r);
      const [R, G, B] = n < 0.12 ? LILAC : n < 0.16 ? GREEN : BLUE;
      const s = SIZE * (0.55 + 0.45 * (1 - Math.pow(1 - cell.pop, 3)));
      const o = (CELL - s) / 2;
      ctx.fillStyle = `rgba(${R},${G},${B},${(cell.a * 0.28).toFixed(3)})`;
      ctx.fillRect(Math.round(cell.c * CELL + o), Math.round(cell.r * CELL + o), Math.round(s), Math.round(s));
    }

    raf = cells.size || ripples.length ? requestAnimationFrame(frame) : 0; // idle when nothing is lit
  }
}
