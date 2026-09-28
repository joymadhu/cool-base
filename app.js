// Base Cool — live Base chain dashboard. No build step, no dependencies.
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
  const CHAIN_LEN = 6;

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- theme ----------
  const sysDark = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : sysDark.matches);
  const syncTheme = () => root.classList.toggle("is-dark", isDark());
  try {
    const saved = localStorage.getItem("bc-theme");
    if (saved) root.dataset.theme = saved;
  } catch (_) {}
  syncTheme();
  sysDark.addEventListener?.("change", syncTheme);
  $("themeToggle").addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    syncTheme();
    try { localStorage.setItem("bc-theme", root.dataset.theme); } catch (_) {}
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
    if (p >= 1) return "$" + p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // Smoothly count a number up/down to its new value, flashing green/red on change.
  function countTo(el, value, fmt, { flash = true } = {}) {
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

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + " → " + r.status);
    return r.json();
  }

  // ---------- UI motion: reveal, nav ink, scroll progress, pointer glow ----------
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("shown");
      revealIO.unobserve(e.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    el.style.setProperty("--d", Math.min(sibs.indexOf(el), 8) * 0.07 + "s");
    revealIO.observe(el);
  });

  const nav = $("nav"), ink = $("navInk");
  const links = [...nav.querySelectorAll("a")];
  function moveInk(a) {
    if (!a) { ink.style.opacity = 0; return; }
    ink.style.opacity = 1;
    ink.style.width = a.offsetWidth + "px";
    ink.style.transform = `translateX(${a.offsetLeft}px)`;
    links.forEach((l) => l.classList.toggle("active", l === a));
  }
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && scrollY >= 200) moveInk(links.find((l) => l.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((l) => { const s = document.querySelector(l.getAttribute("href")); if (s) sectionIO.observe(s); });

  const topbar = $("topbar"), progress = $("progress");
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      topbar.classList.toggle("scrolled", scrollY > 10);
      if (scrollY < 200) moveInk(null);
    });
  }, { passive: true });

  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(".card, .meme");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty("--mx", x + "px");
    el.style.setProperty("--my", y + "px");
    if (el.classList.contains("meme") && !reduceMotion) {
      const rx = (y / r.height - 0.5) * -10, ry = (x / r.width - 0.5) * 12;
      el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    }
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest?.(".meme");
    if (el && !el.contains(e.relatedTarget)) el.style.transform = "";
  });

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
  const blocks = new Map();
  let latest = 0;

  async function pollBlocks() {
    try {
      const [head, gas] = await rpc([["eth_blockNumber", []], ["eth_gasPrice", []]]);
      const headNum = hex(head);
      countTo($("statGas"), hex(gas) / 1e9, (v) => v.toFixed(4), { flash: false });
      if (headNum === latest) return renderBlockAges();

      const from = Math.max(headNum - MAX_BLOCKS + 1, latest + 1);
      const nums = [];
      for (let n = from; n <= headNum; n++) if (!blocks.has(n)) nums.push(n);
      const res = await rpc(nums.map((n) => ["eth_getBlockByNumber", ["0x" + n.toString(16), n === headNum]]));
      res.forEach((b) => {
        if (!b) return;
        const n = hex(b.number);
        blocks.set(n, {
          number: n, hash: b.hash, ts: hex(b.timestamp), txCount: b.transactions.length,
          gasUsed: hex(b.gasUsed), gasLimit: hex(b.gasLimit), fresh: latest !== 0,
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
    countTo($("statBlock"), top.number, (v) => "#" + Math.round(v).toLocaleString(), { flash: false });
    $("heroBlock").textContent = "#" + top.number.toLocaleString();
    if (list.length > 1) {
      const span = list[0].ts - list[list.length - 1].ts;
      const txs = list.slice(0, -1).reduce((s, b) => s + b.txCount, 0);
      countTo($("statBlockTime"), span / (list.length - 1), (v) => v.toFixed(2) + "s", { flash: false });
      if (span > 0) countTo($("statTps"), txs / span, (v) => v.toFixed(1));
    }
    $("blockList").innerHTML = list.map((b) => {
      const used = b.gasLimit ? (b.gasUsed / b.gasLimit) * 100 : 0;
      return `<li class="${b.fresh ? "new" : ""}">
        <span class="icon">Bk</span>
        <div class="main">
          <div><a class="mono" href="${EXPLORER}/block/${b.number}" target="_blank" rel="noopener">#${b.number.toLocaleString()}</a></div>
          <div class="sub">${b.txCount} txns · gas ${used.toFixed(1)}% <span class="gasbar"><i style="width:${Math.min(100, used)}%"></i></span></div>
        </div>
        <span class="meta" data-ts="${b.ts}">${ago(b.ts)}</span>
      </li>`;
    }).join("");
    renderChain(list.slice(0, CHAIN_LEN).reverse());
    list.forEach((b) => (b.fresh = false));
    renderBlockAges();
  }

  // Horizontal "chain" of the newest blocks; new blocks slide in on the right.
  function renderChain(list) {
    const chain = $("chain");
    const have = new Set([...chain.children].map((c) => +c.dataset.n));
    [...chain.children].forEach((c) => { if (!list.some((b) => b.number === +c.dataset.n)) c.remove(); });
    list.forEach((b) => {
      if (have.has(b.number)) return;
      const el = document.createElement("div");
      el.className = "link";
      el.dataset.n = b.number;
      el.innerHTML = `<a class="blk" href="${EXPLORER}/block/${b.number}" target="_blank" rel="noopener"><b>#${b.number.toLocaleString()}</b><span>${b.txCount} txns</span></a>`;
      chain.appendChild(el);
    });
    [...chain.children].forEach((c, i, a) => c.classList.toggle("head", i === a.length - 1));
  }

  function renderBlockAges() {
    document.querySelectorAll("[data-ts]").forEach((el) => (el.textContent = ago(+el.dataset.ts)));
    const top = blocks.get(latest);
    if (top) $("statBlockAge").textContent = ago(top.ts);
  }

  function renderTxs(block) {
    const txs = block.transactions.slice(0, 25);
    $("activityBlock").textContent = "block #" + hex(block.number).toLocaleString() + " · " + block.transactions.length + " txns";
    $("txList").innerHTML = txs.map((t, i) => {
      const eth = weiToEth(t.value || "0x0");
      const kind = !t.to ? "Deploy" : t.input && t.input !== "0x" ? "Call" : "Send";
      const cls = kind === "Call" ? "call" : kind === "Deploy" ? "deploy" : "";
      return `<li class="new" style="animation-delay:${Math.min(i, 12) * 35}ms">
        <span class="icon ${cls}">${kind === "Send" ? "Tx" : kind === "Call" ? "Fn" : "+"}</span>
        <div class="main">
          <div><a class="mono" href="${EXPLORER}/tx/${t.hash}" target="_blank" rel="noopener">${short(t.hash)}</a> <span class="sub">${kind}</span></div>
          <div class="sub mono">${short(t.from)} → ${t.to ? short(t.to) : "new contract"}</div>
        </div>
        <span class="meta mono">${eth > 0 ? eth.toFixed(eth < 0.001 ? 6 : 4) : "0"} ETH</span>
      </li>`;
    }).join("") || '<li class="muted">No transactions in this block.</li>';
  }

  // ---------- volume ----------
  let volSeries = [];
  let rangeDays = 90;
  let dexFirst = true;

  async function loadVolume() {
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
    const line = xy.map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)).join(" ");
    const color = (t.change ?? 0) >= 0 ? "var(--up)" : "var(--down)";
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="sp${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${W} ${H} L0 ${H} Z" fill="url(#sp${id})"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" to="0" dur="1.2s" fill="freeze" calcMode="spline" keySplines=".22 1 .36 1"/></path>
    </svg>`;
  }

  let tokFirst = true, memeFirst = true;
  let tickerTokens = [], tickerMemes = [];

  async function loadTokens() {
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

  async function loadMemes() {
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

  function renderTicker() {
    const all = [...tickerTokens, ...tickerMemes];
    if (!all.length) { $("ticker").innerHTML = '<span class="tick muted">Live prices unavailable right now.</span>'; return; }
    const items = all.map((t) => `<span class="tick">${t.image ? `<img src="${esc(t.image)}" alt="">` : ""}<b>${esc(t.symbol)}</b> ${price(t.price)} ${pct(t.change)}</span>`).join("");
    $("ticker").innerHTML = items + items; // duplicated for a seamless loop
  }

  function stamp() {
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
  }

  async function loadMarkets() {
    await Promise.allSettled([loadVolume(), loadTokens(), loadMemes()]);
    renderTicker();
    stamp();
  }

  pollBlocks();
  setInterval(pollBlocks, BLOCK_POLL_MS);
  setInterval(renderBlockAges, 1000);
  loadMarkets();
  setInterval(loadMarkets, MARKET_POLL_MS);
})();
