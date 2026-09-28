import { EXPLORER, MAX_BLOCKS, CHAIN_LEN } from "../config.js";
import { $, stamp } from "../lib/dom.js";
import { rpc } from "../lib/api.js";
import { countTo } from "../lib/countTo.js";
import { short, ago, hex, weiToEth } from "../lib/format.js";
import { pushBlock } from "../ui/mosaic.js";

const blocks = new Map();
let latest = 0;

export async function pollBlocks() {
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
    // Feed new blocks, oldest first, into the live mosaics.
    [...blocks.values()].filter((b) => b.number > latest).sort((a, b) => a.number - b.number).forEach((b) => pushBlock(b));
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

export function renderBlockAges() {
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
