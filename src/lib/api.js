import { RPCS } from "../config.js";

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " → " + r.status);
  return r.json();
}

let rpcIndex = 0;
export async function rpc(calls) {
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
