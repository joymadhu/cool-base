import { LLAMA_DEX, LLAMA_CHAINS } from "../config.js";
import { $ } from "../lib/dom.js";
import { getJSON } from "../lib/api.js";
import { countTo } from "../lib/countTo.js";
import { usd, pct, esc, dateStr } from "../lib/format.js";

let volSeries = [];
let rangeDays = 90;
let dexFirst = true;

export async function loadVolume() {
  try {
    const d = await getJSON(LLAMA_DEX);
    countTo($("statVol24"), d.total24h, (v) => usd(v));
    countTo($("statVol7"), d.total7d, (v) => usd(v));
    $("statVolChange").innerHTML = d.change_1d != null ? pct(d.change_1d) + " vs yesterday" : "all Base DEXs";
    const hadSeries = volSeries.length > 0;
    volSeries = (d.totalDataChart || []).map(([t, v]) => [Number(t), Number(v)]).filter(([, v]) => isFinite(v));
    if (volSeries.length) {
      const ath = volSeries.reduce((m, p) => (p[1] > m[1] ? p : m));
      countTo($("statAth"), ath[1], (v) => usd(v));
      $("statAthDate").textContent = "set " + dateStr(ath[0]);
    }
    drawChart(!hadSeries);

    const protos = (d.protocols || []).filter((p) => p.total24h > 0).sort((a, b) => b.total24h - a.total24h).slice(0, 10);
    const total = d.total24h || protos.reduce((s, p) => s + p.total24h, 0);
    $("dexRows").innerHTML = protos.map((p, i) => {
      const share = total ? (p.total24h / total) * 100 : 0;
      return `<tr class="${dexFirst ? "in" : ""}" style="animation-delay:${i * 50}ms">
        <td class="muted">${i + 1}</td>
        <td><div class="tok">${p.logo ? `<img src="${esc(p.logo)}" alt="" loading="lazy">` : `<span class="avatar">${esc((p.displayName || p.name)[0])}</span>`}${esc(p.displayName || p.name)}</div></td>
        <td class="r"><b>${usd(p.total24h)}</b></td>
        <td class="r"><span class="share"><span class="track"><span class="fill" style="width:${share}%;animation-delay:${i * 60 + 200}ms"></span></span>${share.toFixed(1)}%</span></td>
      </tr>`;
    }).join("") || '<tr><td colspan="4" class="muted">No data</td></tr>';
    dexFirst = false;
  } catch (e) {
    console.warn(e);
    if (!volSeries.length) $("volChart").innerHTML = '<p class="muted">Volume data unavailable right now.</p>';
    $("dexRows").innerHTML = '<tr><td colspan="4" class="muted">Unavailable</td></tr>';
    ["statVol24", "statVol7", "statAth"].forEach((id) => { if ($(id).querySelector(".sk")) $(id).textContent = "—"; });
  }
  try {
    const chains = await getJSON(LLAMA_CHAINS);
    const base = chains.find((c) => c.name === "Base");
    if (base) countTo($("statTvl"), base.tvl, (v) => usd(v));
  } catch (e) {
    console.warn(e);
    if ($("statTvl").querySelector(".sk")) $("statTvl").textContent = "—";
  }
}

function drawChart(animate = true) {
  const el = $("volChart");
  if (!volSeries.length) return;
  const data = rangeDays ? volSeries.slice(-rangeDays) : volSeries;
  const W = el.clientWidth || 800, H = el.clientHeight || 280, pad = { l: 58, r: 12, t: 26, b: 26 };
  const max = Math.max(...data.map((d) => d[1])) * 1.05;
  const athAll = Math.max(...volSeries.map((d) => d[1]));
  const x = (i) => pad.l + ((i + 0.5) / data.length) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(1, slot * (data.length > 120 ? 0.9 : 0.72));
  const athIdx = data.findIndex((d) => d[1] === athAll);
  const stagger = Math.min(12, 900 / data.length);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = (max / 1.05) * f, yy = y(v);
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-dasharray="${f ? "3 5" : ""}"/>
      <text x="${pad.l - 10}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${usd(v, 1)}</text>`;
  }).join("");
  const labelEvery = Math.ceil(data.length / 6);
  const yr = rangeDays === 0 || rangeDays > 90 ? "2-digit" : undefined;
  const xl = data.map((d, i) => (i % labelEvery === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${new Date(d[0] * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: yr })}</text>` : "")).join("");
  const bars = data.map((d, i) => {
    const yy = y(d[1]);
    return `<rect class="bar" x="${x(i) - bw / 2}" y="${yy}" width="${bw}" height="${Math.max(0, H - pad.b - yy)}" rx="${Math.min(4, bw / 2)}" fill="url(#${i === athIdx ? "gGold" : "gBlue"})" style="animation-delay:${animate ? i * stagger : 0}ms;${animate ? "" : "animation:none"}" data-i="${i}"/>`;
  }).join("");
  const athMark = athIdx >= 0 ? `<g class="ath-label" style="${animate ? "" : "animation:none"}"><rect x="${x(athIdx) - 20}" y="${y(data[athIdx][1]) - 24}" width="40" height="18" rx="9" fill="var(--gold)"/><text x="${x(athIdx)}" y="${y(data[athIdx][1]) - 11}" text-anchor="middle" font-size="10" font-weight="700" fill="#1a1200">ATH</text></g>` : "";

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily DEX volume on Base">
    <defs>
      <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4d8dff"/><stop offset="1" stop-color="#0052ff" stop-opacity=".55"/></linearGradient>
      <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd966"/><stop offset="1" stop-color="#ff9f1a"/></linearGradient>
    </defs>${ticks}${bars}${athMark}${xl}</svg><div class="tip"></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
  let hot = null;
  svg.addEventListener("pointermove", (ev) => {
    const r = el.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - pad.l) / slot);
    if (i < 0 || i >= data.length) { tip.classList.remove("show"); return; }
    const d = data[i];
    if (hot) hot.classList.remove("hot");
    hot = svg.querySelector(`.bar[data-i="${i}"]`);
    hot?.classList.add("hot");
    tip.innerHTML = `<b>${usd(d[1])}</b>${i === athIdx ? ' <span style="color:var(--gold)">★ ATH</span>' : ""}<br><span class="muted">${dateStr(d[0])}</span>`;
    tip.style.left = (x(i) / W) * r.width + "px";
    tip.style.top = (y(d[1]) / H) * r.height + "px";
    tip.classList.add("show");
  });
  svg.addEventListener("pointerleave", () => { tip.classList.remove("show"); hot?.classList.remove("hot"); });
}

// Range switcher (30D / 90D / 1Y / All) with a sliding highlight.
export function initVolume() {
  const seg = $("rangeSeg"), segInk = seg.querySelector(".seg-ink");
  const moveSeg = (b) => { segInk.style.width = b.offsetWidth + "px"; segInk.style.transform = `translateX(${b.offsetLeft}px)`; };
  moveSeg(seg.querySelector("button.on"));
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    rangeDays = +b.dataset.days;
    seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    moveSeg(b);
    drawChart(true);
  });
  let resizeT;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { drawChart(false); moveSeg(seg.querySelector("button.on")); }, 150);
  });
  document.fonts?.ready.then(() => moveSeg(seg.querySelector("button.on")));
}
