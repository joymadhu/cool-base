import { RPCS } from "../config.js";

const TIMEOUT_MS = 8000;
const BATCH = 4; // public Base RPCs rate-limit big batches; keep them small

async function fetchWithTimeout(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getJSON(url) {
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(url + " → " + r.status);
  return r.json();
}

let rpcIndex = 0;

// Send one small batch to one endpoint. Returns results by index; failed items are undefined.
async function send(url, calls) {
  const body = calls.map(([method, params], i) => ({ jsonrpc: "2.0", id: i, method, params }));
  const r = await fetchWithTimeout(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(url + " → " + r.status);
  const out = await r.json();
  const res = new Array(calls.length);
  (Array.isArray(out) ? out : [out]).forEach((x) => { if (x && !x.error && x.id != null) res[x.id] = x.result; });
  return res;
}

// JSON-RPC with small batches and endpoint fallback. Any call that still fails
// after every endpoint comes back as undefined, so callers use what they got.
export async function rpc(calls) {
  const results = new Array(calls.length);
  let pending = calls.map((_, i) => i);
  for (let attempt = 0; attempt < RPCS.length && pending.length; attempt++) {
    const url = RPCS[rpcIndex];
    let failed = false;
    for (let i = 0; i < pending.length; i += BATCH) {
      const idx = pending.slice(i, i + BATCH);
      try {
        const res = await send(url, idx.map((k) => calls[k]));
        idx.forEach((k, j) => { if (res[j] != null) results[k] = res[j]; });
      } catch (e) {
        failed = true;
      }
    }
    pending = pending.filter((k) => results[k] == null);
    if (pending.length || failed) rpcIndex = (rpcIndex + 1) % RPCS.length; // try the next endpoint for what's left
  }
  if (results.every((x) => x == null)) throw new Error("All Base RPC endpoints failed");
  return results;
}
