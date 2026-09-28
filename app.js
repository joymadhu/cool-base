// Base School — live Base chain dashboard. No build step, no dependencies.
(() => {
  "use strict";

  const RPCS = ["https://mainnet.base.org", "https://base-rpc.publicnode.com", "https://base.llamarpc.com"];
  const LLAMA_DEX = "https://api.llama.fi/overview/dexs/base?excludeTotalDataChartBreakdown=true";
  const LLAMA_CHAINS = "https://api.llama.fi/v2/chains";
  const DEXSCREENER = "https://api.dexscreener.com/latest/dex/search?q=";
  const EXPLORER = "https://basescan.org";

  const TOKENS = ["WETH", "USDC", "cbBTC", "AERO", "VIRTUAL", "ZORA", "cbETH", "WELL"];
  const MEMES = ["BRETT", "DEGEN", "TOSHI", "MIGGLES", "KEYCAT", "SKI", "DOGINME", "BENJI", "MOCHI", "NORMIE", "BALD", "HIGHER"];

  const BLOCK_POLL_MS = 4000;
  const MARKET_POLL_MS = 60000;
  const MAX_BLOCKS = 12;

  const $ = (id) => document.getElementById(id);

  // ---------- theme ----------
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("bs-theme");
    if (saved) root.dataset.theme = saved;
  } catch (_) {}
  $("themeToggle").addEventListener("click", () => {
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("bs-theme", root.dataset.theme); } catch (_) {}
  });

  // ---------- formatting ----------
  const usd = (n, digits = 2) => {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e12) return "$" + (n / 1e12).toFixed(digits) + "T";
    if (a >= 1e9) return "$" + (n / 1e9).toFixed(digits) + "B";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(digits) + "M";
    if (a >= 1e3) return "$" + (n / 1e3).toFixed(digits) + "K";
    return "$" + n.toFixed(digits);
  };
  const price = (p) => {
    p = Number(p);
    if (!isFinite(p)) return "—";
    if (p >= 1) return "$" + p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 0.01) return "$" + p.toFixed(4);
    return "$" + p.toPrecision(3);
  };
  const pct = (n) => {
    if (n == null || !isFinite(n)) return '<span class="muted">—</span>';
    const cls = n >= 0 ? "up" : "down";
    return `<span class="${cls}">${n >= 0 ? "▲" : "▼"} ${Math.abs(n).toFixed(2)}%</span>`;
  };
  const short = (h) => (h ? h.slice(0, 6) + "…" + h.slice(-4) : "—");
  const ago = (ts) => {
    const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    return Math.floor(s / 3600) + "h ago";
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hex = (h) => parseInt(h, 16);
  const weiToEth = (h) => Number(BigInt(h)) / 1e18;
  const dateStr = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }

  // ---------- RPC ----------
  let rpcIndex = 0;
  async function rpc(calls) {
    const body = calls.map(([method, params], i) => ({ jsonrpc: "2.0", id: i, method, params }));
    for (let attempt = 0; attempt < RPCS.length; attempt++) {
      const url = RPCS[rpcIndex];
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(String(r.status));
        const out = await r.json();
        const arr = Array.isArray(out) ? out : [out];
        arr.sort((a, b) => a.id - b.id);
        if (arr.some((x) => x.error)) throw new Error("rpc error");
        return arr.map((x) => x.result);
      } catch (e) {
        rpcIndex = (rpcIndex + 1) % RPCS.length;
      }
    }
    throw new Error("All Base RPC endpoints failed");
  }

  // ---------- blocks & activity ----------
  const blocks = new Map(); // number -> block (header only)
  let latest = 0;

  async function pollBlocks() {
    try {
      const [head, gas] = await rpc([["eth_blockNumber", []], ["eth_gasPrice", []]]);
      const headNum = hex(head);
      $("statGas").textContent = (hex(gas) / 1e9).toFixed(4);
      if (headNum === latest) return renderBlockAges();

      const from = Math.max(headNum - MAX_BLOCKS + 1, latest + 1);
      const nums = [];
      for (let n = from; n <= headNum; n++) if (!blocks.has(n)) nums.push(n);
      const calls = nums.map((n) => ["eth_getBlockByNumber", ["0x" + n.toString(16), n === headNum]]);
      const res = await rpc(calls);
      res.forEach((b) => {
        if (!b) return;
        const n = hex(b.number);
        blocks.set(n, {
          number: n,
          hash: b.hash,
          ts: hex(b.timestamp),
          txCount: b.transactions.length,
          gasUsed: hex(b.gasUsed),
          gasLimit: hex(b.gasLimit),
          fresh: latest !== 0,
        });
        if (n === headNum) renderTxs(b);
      });
      latest = headNum;
      [...blocks.keys()].sort((a, b) => a - b).slice(0, Math.max(0, blocks.size - MAX_BLOCKS)).forEach((k) => blocks.delete(k));
      renderBlocks();
      stamp();
    } catch (e) {
      console.warn(e);
      $("statBlockAge").textContent = "RPC unavailable — retrying";
    }
  }

  function renderBlocks() {
    const list = [...blocks.values()].sort((a, b) => b.number - a.number);
    if (!list.length) return;
    const top = list[0];
    $("statBlock").textContent = "#" + top.number.toLocaleString();
    if (list.length > 1) {
      const span = list[0].ts - list[list.length - 1].ts;
      const txs = list.slice(0, -1).reduce((s, b) => s + b.txCount, 0);
      const bt = span / (list.length - 1);
      $("statBlockTime").textContent = bt.toFixed(2) + "s";
      $("statTps").textContent = span > 0 ? (txs / span).toFixed(1) : "—";
    }
    $("blockList").innerHTML = list.map((b) => {
      const used = b.gasLimit ? ((b.gasUsed / b.gasLimit) * 100).toFixed(1) : "0";
      return `<li class="${b.fresh ? "new" : ""}">
        <span class="icon">Bk</span>
        <div class="main">
          <div><a class="mono" href="${EXPLORER}/block/${b.number}" target="_blank" rel="noopener">#${b.number.toLocaleString()}</a></div>
          <div class="sub">${b.txCount} txns · gas ${used}% used</div>
        </div>
        <span class="meta" data-ts="${b.ts}">${ago(b.ts)}</span>
      </li>`;
    }).join("");
    list.forEach((b) => (b.fresh = false));
    renderBlockAges();
  }

  function renderBlockAges() {
    document.querySelectorAll("[data-ts]").forEach((el) => (el.textContent = ago(+el.dataset.ts)));
    const top = blocks.get(latest);
    if (top) $("statBlockAge").textContent = ago(top.ts);
  }

  function renderTxs(block) {
    const txs = block.transactions.slice(0, 25);
    $("activityBlock").textContent = "block #" + hex(block.number).toLocaleString() + " · " + block.transactions.length + " txns";
    $("txList").innerHTML = txs.map((t) => {
      const eth = weiToEth(t.value || "0x0");
      const kind = !t.to ? "Deploy" : t.input && t.input !== "0x" ? "Call" : "Send";
      return `<li class="new">
        <span class="icon">${kind === "Send" ? "Tx" : kind === "Call" ? "Fn" : "+"}</span>
        <div class="main">
          <div><a class="mono" href="${EXPLORER}/tx/${t.hash}" target="_blank" rel="noopener">${short(t.hash)}</a> <span class="sub">${kind}</span></div>
          <div class="sub mono">${short(t.from)} → ${t.to ? short(t.to) : "new contract"}</div>
        </div>
        <span class="meta mono">${eth > 0 ? eth.toFixed(eth < 0.001 ? 6 : 4) + " ETH" : "0 ETH"}</span>
      </li>`;
    }).join("") || '<li class="muted">No transactions in this block.</li>';
  }

  // ---------- volume ----------
  let volSeries = [];
  let rangeDays = 90;

  async function loadVolume() {
    try {
      const d = await getJSON(LLAMA_DEX);
      $("statVol24").textContent = usd(d.total24h);
      $("statVol7").textContent = usd(d.total7d);
      $("statVolChange").innerHTML = d.change_1d != null ? pct(d.change_1d) + " vs yesterday" : "all Base DEXs";
      volSeries = (d.totalDataChart || []).map(([t, v]) => [Number(t), Number(v)]).filter(([, v]) => isFinite(v));
      if (volSeries.length) {
        const ath = volSeries.reduce((m, p) => (p[1] > m[1] ? p : m));
        $("statAth").textContent = usd(ath[1]);
        $("statAthDate").textContent = "set " + dateStr(ath[0]);
      }
      drawChart();

      const protos = (d.protocols || []).filter((p) => p.total24h > 0).sort((a, b) => b.total24h - a.total24h).slice(0, 10);
      const total = d.total24h || protos.reduce((s, p) => s + p.total24h, 0);
      $("dexRows").innerHTML = protos.map((p, i) => `<tr>
        <td class="muted">${i + 1}</td>
        <td><div class="tok">${p.logo ? `<img src="${esc(p.logo)}" alt="" loading="lazy">` : `<span class="avatar">${esc((p.displayName || p.name)[0])}</span>`}${esc(p.displayName || p.name)}</div></td>
        <td class="r">${usd(p.total24h)}</td>
        <td class="r">${total ? ((p.total24h / total) * 100).toFixed(1) + "%" : "—"}</td>
      </tr>`).join("") || '<tr><td colspan="4" class="muted">No data</td></tr>';
    } catch (e) {
      console.warn(e);
      $("volChart").innerHTML = '<p class="muted">Volume data unavailable right now.</p>';
      $("dexRows").innerHTML = '<tr><td colspan="4" class="muted">Unavailable</td></tr>';
    }
    try {
      const chains = await getJSON(LLAMA_CHAINS);
      const base = chains.find((c) => c.name === "Base");
      if (base) $("statTvl").textContent = usd(base.tvl);
    } catch (e) { console.warn(e); }
  }

  function drawChart() {
    const el = $("volChart");
    if (!volSeries.length) return;
    const data = rangeDays ? volSeries.slice(-rangeDays) : volSeries;
    const W = el.clientWidth || 800, H = el.clientHeight || 260, pad = { l: 56, r: 12, t: 16, b: 26 };
    const max = Math.max(...data.map((d) => d[1]));
    const athAll = Math.max(...volSeries.map((d) => d[1]));
    const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const bw = Math.max(1, (W - pad.l - pad.r) / data.length - 1);
    const athIdx = data.findIndex((d) => d[1] === athAll);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = max * f, yy = y(v);
      return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" stroke="var(--border)"/>
        <text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${usd(v, 1)}</text>`;
    }).join("");
    const labelEvery = Math.ceil(data.length / 6);
    const xl = data.map((d, i) => (i % labelEvery === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${new Date(d[0] * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: rangeDays === 0 || rangeDays > 90 ? "2-digit" : undefined })}</text>` : "")).join("");
    const bars = data.map((d, i) => `<rect x="${x(i) - bw / 2}" y="${y(d[1])}" width="${bw}" height="${Math.max(0, H - pad.b - y(d[1]))}" rx="${Math.min(3, bw / 2)}" fill="${i === athIdx ? "var(--gold)" : "var(--base)"}" opacity="${i === athIdx ? 1 : 0.85}" data-i="${i}"/>`).join("");
    const athMark = athIdx >= 0 ? `<text x="${x(athIdx)}" y="${y(data[athIdx][1]) - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--gold)">ATH</text>` : "";

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily DEX volume on Base">${ticks}${bars}${athMark}${xl}</svg><div class="tip"></div>`;
    const tip = el.querySelector(".tip");
    el.querySelector("svg").addEventListener("mousemove", (ev) => {
      const r = el.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
      if (i < 0 || i >= data.length) return (tip.style.display = "none");
      const d = data[i];
      tip.innerHTML = `<b>${usd(d[1])}</b><br><span class="muted">${dateStr(d[0])}</span>`;
      tip.style.left = (x(i) / W) * r.width + "px";
      tip.style.top = (y(d[1]) / H) * r.height + "px";
      tip.style.display = "block";
    });
    el.querySelector("svg").addEventListener("mouseleave", () => (tip.style.display = "none"));
  }

  $("rangeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    rangeDays = +b.dataset.days;
    $("rangeSeg").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    drawChart();
  });
  let resizeT;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(drawChart, 150); });

  // ---------- tokens & memes (DexScreener) ----------
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
      address: best.baseToken.address,
      price: best.priceUsd,
      change: best.priceChange?.h24,
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

  async function loadTokens() {
    const list = await lookupAll(TOKENS);
    $("tokenRows").innerHTML = list.map((t) => `<tr>
      <td><a class="tok" href="${esc(t.url)}" target="_blank" rel="noopener" style="color:inherit">${avatar(t)}<span><b>${esc(t.symbol)}</b><small>${esc(t.name)}</small></span></a></td>
      <td class="r">${price(t.price)}</td>
      <td class="r">${pct(t.change)}</td>
      <td class="r"><b>${usd(t.volume)}</b></td>
      <td class="r">${usd(t.liquidity)}</td>
      <td class="r hide-sm">${t.txns.toLocaleString()}</td>
    </tr>`).join("") || '<tr><td colspan="6" class="muted">Token data unavailable right now.</td></tr>';
  }

  async function loadMemes() {
    const list = await lookupAll(MEMES);
    $("memeGrid").innerHTML = list.map((t, i) => `<a class="meme" href="${esc(t.url)}" target="_blank" rel="noopener">
      <div class="tok">${avatar(t)}<span><b>${esc(t.symbol)}</b><small>${esc(t.name)}</small></span><span class="rank" style="margin-left:auto">#${i + 1}</span></div>
      <div><span class="price">${price(t.price)}</span> ${pct(t.change)}</div>
      <div class="row"><span>24h volume</span><b>${usd(t.volume)}</b></div>
      <div class="row"><span>Market cap</span><span>${usd(t.mcap)}</span></div>
      <div class="row"><span>Txns 24h</span><span>${t.txns.toLocaleString()}</span></div>
    </a>`).join("") || '<p class="muted">Meme data unavailable right now.</p>';
  }

  function stamp() {
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
  }

  async function loadMarkets() {
    await Promise.allSettled([loadVolume(), loadTokens(), loadMemes()]);
    stamp();
  }

  pollBlocks();
  setInterval(pollBlocks, BLOCK_POLL_MS);
  setInterval(renderBlockAges, 1000);
  loadMarkets();
  setInterval(loadMarkets, MARKET_POLL_MS);
})();
