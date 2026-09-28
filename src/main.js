// Base Cool — live Base chain dashboard.
import "./style.css";
import { BLOCK_POLL_MS, MARKET_POLL_MS } from "./config.js";
import { stamp } from "./lib/dom.js";
import { initMosaics } from "./ui/mosaic.js";
import { initPixelCursor } from "./ui/pixelCursor.js";
import { initMotion } from "./ui/motion.js";
import { pollBlocks, renderBlockAges } from "./sections/blocks.js";
import { initVolume, loadVolume } from "./sections/volume.js";
import { loadTokens, loadMemes, renderTicker } from "./sections/markets.js";

async function loadMarkets() {
  await Promise.allSettled([loadVolume(), loadTokens(), loadMemes()]);
  renderTicker();
  stamp();
}

initMosaics();
initPixelCursor();
initMotion();
initVolume();

pollBlocks();
setInterval(pollBlocks, BLOCK_POLL_MS);
setInterval(renderBlockAges, 1000);
loadMarkets();
setInterval(loadMarkets, MARKET_POLL_MS);
