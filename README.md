# Base Cool

A live dashboard for the [Base](https://base.org) chain. It shows:

- **Overview**: latest block, average block time, transactions per second, gas price
- **Volume**: 24h and 7d DEX volume, the **all-time-high** daily volume (with its date), TVL, a daily volume chart (30D / 90D / 1Y / All) with the ATH highlighted, and the top DEXs by 24h volume
- **Blocks**: the latest blocks, refreshed every 4 seconds
- **Activity**: live transactions from the newest block
- **Tokens**: top Base tokens by 24h volume (price, change, volume, liquidity, txns)
- **Memes**: a meme board of Base memecoins ranked by 24h volume

The look is white and pixel-art: pure Base blue with vertical-line hatching, airmail-dashed borders, a swinging crane sign in the hero, and pink / lime / blue pixel-mosaic panels (the lime one is drawn from real daily volume).

## Run it

Built with [Vite](https://vite.dev). Needs Node 20.19+ or 22.12+.

```sh
npm install
npm run dev       # dev server with hot reload at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

Deploy `dist/` to any static host. Vercel and Netlify detect Vite automatically: the build command is `npm run build` and the output folder is `dist`.

## Project structure

```
index.html              page markup (Vite entry)
src/main.js             app bootstrap and polling loops
src/style.css           themes, layout and animations
src/config.js           API endpoints, token and meme lists, poll intervals
src/lib/                DOM helpers, API/RPC client, formatters, count-up animation
src/ui/                 motion (scroll reveal, nav, progress) and pixel mosaics
src/sections/           blocks & activity, volume chart, tokens/memes/ticker
```

## Data sources

- Base public RPC (`mainnet.base.org`, with publicnode and llamarpc fallbacks): blocks, transactions, gas
- [DefiLlama](https://defillama.com): DEX volume history, ATH, TVL
- [DexScreener](https://dexscreener.com): token and meme prices and volumes

To change which tokens or memes appear, edit the `TOKENS` and `MEMES` arrays in `src/config.js`.
