export const usd = (n, digits = 2) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return "$" + (n / 1e12).toFixed(digits) + "T";
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(digits) + "B";
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(digits) + "M";
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(digits) + "K";
  return "$" + n.toFixed(digits);
};
export const price = (p) => {
  p = Number(p);
  if (!isFinite(p)) return "—";
  if (p >= 1) return "$" + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + p.toPrecision(3);
};
export const pct = (n) => {
  if (n == null || !isFinite(n)) return '<span class="muted">—</span>';
  const cls = n >= 0 ? "up" : "down";
  return `<span class="${cls}">${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(2)}%</span>`;
};
export const short = (h) => (h ? h.slice(0, 6) + "…" + h.slice(-4) : "—");
export const ago = (ts) => {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  return Math.floor(s / 3600) + "h ago";
};
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const hex = (h) => parseInt(h, 16);
export const weiToEth = (h) => Number(BigInt(h)) / 1e18;
export const dateStr = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
