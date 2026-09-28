import { reduceMotion } from "./dom.js";

// Smoothly count a number up/down to its new value, flashing green/red on change.
export function countTo(el, value, fmt, { flash = true } = {}) {
  if (value == null || !isFinite(value)) { el.textContent = "—"; return; }
  const from = typeof el._v === "number" ? el._v : 0;
  const first = typeof el._v !== "number";
  el._v = value;
  if (flash && !first && value !== from) {
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth;
    el.classList.add(value > from ? "flash-up" : "flash-down");
  }
  if (reduceMotion || from === value) { el.textContent = fmt(value); return; }
  const dur = first ? 1400 : 700, t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (value - from) * e);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}
