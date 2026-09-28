# Base School

A live dashboard for the [Base](https://base.org) chain. It shows:

- **Overview**: latest block, average block time, transactions per second, gas price
- **Volume**: 24h and 7d DEX volume, the **all-time-high** daily volume (with its date), TVL, a daily volume chart (30D / 90D / 1Y / All) with the ATH highlighted, and the top DEXs by 24h volume
- **Blocks**: the latest blocks, refreshed every 4 seconds
- **Activity**: live transactions from the newest block
- **Tokens**: top Base tokens by 24h volume (price, change, volume, liquidity, txns)
- **Memes**: a meme board of Base memecoins ranked by 24h volume

It comes with dark and light themes in Base blue. It follows the system theme by default, and the ◐ button toggles it.

## Run it

It's a static site with no build step. Open `index.html` directly, or serve the folder:

```sh
npx serve .
# or
python3 -m http.server 8080
```

Works on any static host (Vercel, Netlify, GitHub Pages).

## Data sources

- Base public RPC (`mainnet.base.org`, with publicnode and llamarpc fallbacks): blocks, transactions, gas
- [DefiLlama](https://defillama.com): DEX volume history, ATH, TVL
- [DexScreener](https://dexscreener.com): token and meme prices and volumes

To change which tokens or memes appear, edit the `TOKENS` and `MEMES` arrays at the top of `app.js`.
