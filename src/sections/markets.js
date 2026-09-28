import { DEXSCREENER, TOKENS, MEMES } from "../config.js";
import { $ } from "../lib/dom.js";
import { getJSON } from "../lib/api.js";
import { usd, price, pct, esc } from "../lib/format.js";

async function lookup(symbol) {
  const d = await getJSON(DEXSCREENER + encodeURIComponent(symbol));
  const pairs = (d.pairs || []).filter((p) => p.chainId === "base" && p.baseToken && p.baseToken.symbol.toLowerCase() === symbol.toLowerCase());
  if (!pairs.length) return null;
  const best = pairs.reduce((m, p) => ((p.liquidity?.usd || 0) > (m.liquidity?.usd || 0) ? p : m));
  const same = pairs.filter((p) => p.baseToken.address.toLowerCase() === best.baseToken.address.toLowerCase());
  const sum = (f) => same.reduce((s, p) => s + (f(p) || 0), 0);
  return {
    symbol: best.baseToken.symbol,
    name: best.baseToken.name,
    price: Number(best.priceUsd),
    change: best.priceChange?.h24,
    changes: best.priceChange || {},
    volume: sum((p) => p.volume?.h24),
    liquidity: sum((p) => p.liquidity?.usd),
    txns: sum((p) => (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0)),
    mcap: best.marketCap || best.fdv,
    image: best.info?.imageUrl,
    url: best.url,
  };
}

async function lookupAll(symbols) {
  const out = await Promise.allSettled(symbols.map(lookup));
  return out.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value).sort((a, b) => b.volume - a.volume);
}

const avatar = (t) => (t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy">` : `<span class="avatar">${esc(t.symbol[0])}</span>`);

// Sparkline reconstructed from DexScreener's 24h / 6h / 1h / 5m price changes.
function spark(t, id) {
  const c = t.changes, p = t.price;
  const pts = [c.h24, c.h6, c.h1, c.m5, 0].map((ch) => (isFinite(ch) ? p / (1 + ch / 100) : p));
  const min = Math.min(...pts), max = Math.max(...pts), W = 200, H = 36;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6)]);
  // Stepped (pixel) line: hold each value, then jump.
  const line = xy.map(([x, y], i) => (i ? `H${x.toFixed(1)} V${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`)).join(" ");
  const color = (t.change ?? 0) >= 0 ? "var(--green)" : "var(--red)";
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="sp${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#sp${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" to="0" dur="1.2s" fill="freeze" calcMode="spline" keySplines=".22 1 .36 1"/></path>
  </svg>`;
}

let tokFirst = true, memeFirst = true;
let tickerTokens = [], tickerMemes = [];

export async function loadTokens() {
  const list = await lookupAll(TOKENS);
  tickerTokens = list;
  $("tokenRows").innerHTML = list.map((t, i) => `<tr class="${tokFirst ? "in" : ""}" style="animation-delay:${i * 50}ms">
    <td><a class="tok" href="${esc(t.url)}" target="_blank" rel="noopener">${avatar(t)}<span><b>${esc(t.symbol)}</b><small>${esc(t.name)}</small></span></a></td>
    <td class="r">${price(t.price)}</td>
    <td class="r">${pct(t.change)}</td>
    <td class="r"><b>${usd(t.volume)}</b></td>
    <td class="r hide-sm">${usd(t.liquidity)}</td>
    <td class="r hide-sm">${t.txns.toLocaleString()}</td>
  </tr>`).join("") || '<tr><td colspan="6" class="muted">Token data unavailable right now.</td></tr>';
  if (list.length) tokFirst = false;
}

export async function loadMemes() {
  const list = await lookupAll(MEMES);
  tickerMemes = list;
  $("memeGrid").innerHTML = list.map((t, i) => `<a class="meme ${memeFirst ? "in" : ""}" style="animation-delay:${i * 60}ms" href="${esc(t.url)}" target="_blank" rel="noopener">
    <div class="tok">${avatar(t)}<span><b>${esc(t.symbol)}</b><small>${esc(t.name)}</small></span><span class="rank ${i < 3 ? "top" : ""}" style="margin-left:auto">#${i + 1}</span></div>
    <div><span class="price">${price(t.price)}</span> ${pct(t.change)}</div>
    ${spark(t, i)}
    <div class="row"><span>24h volume</span><b>${usd(t.volume)}</b></div>
    <div class="row"><span>Market cap</span><span>${usd(t.mcap)}</span></div>
    <div class="row"><span>Txns 24h</span><span>${t.txns.toLocaleString()}</span></div>
  </a>`).join("") || '<p class="muted">Meme data unavailable right now.</p>';
  if (list.length) memeFirst = false;
}

export function renderTicker() {
  const all = [...tickerTokens, ...tickerMemes];
  if (!all.length) { $("ticker").innerHTML = '<span class="tick muted">Live prices unavailable right now.</span>'; return; }
  const items = all.map((t) => `<span class="tick">${t.image ? `<img src="${esc(t.image)}" alt="">` : ""}<b>${esc(t.symbol)}</b> ${price(t.price)} ${pct(t.change)}</span>`).join("");
  $("ticker").innerHTML = items + items; // duplicated for a seamless loop
}
