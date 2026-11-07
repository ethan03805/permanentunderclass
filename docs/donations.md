# Donations

Donations are Monero only. Every visit to `/donate` gets a new subaddress, so separate
donations can't be linked to each other on the chain. Nothing about donors is stored.

## How it works

```
browser /donate ──POST /v1/donations──────▶ pay ──create_address──▶ monero-wallet-rpc ──▶ Monero node
                ◀──── { id, address, … } ──                         (view-only wallet)
                ──GET /v1/donations/:id──▶ pay ──get_transfers───▶      "
                  every 15 s
```

1. The page asks `pay` for an address. `pay` creates a subaddress labelled `donation:<id>`
   and returns the id and address. The page puts the id in the URL fragment
   (`/donate#<id>`), so a bookmark returns to the same address. Browsers never send the
   fragment to the server, so the site's host doesn't see it.
2. The page shows the address, a QR code and a `monero:` link. If the donor types an amount,
   the link and QR code carry it.
3. The page checks the status until the payment is final: **waiting**, then **seen** (in the
   mempool or in a block, with a confirmation count), then **confirmed** at 10 confirmations,
   about 20 minutes.

All state lives in the wallet file: the subaddress labels map ids to addresses. There is no
database.

## What the server holds

- The wallet's primary address and **secret view key**. That is enough to make subaddresses
  and see incoming payments, not to spend. Anyone with the view key can see every payment
  the wallet receives.
- **Never the seed or spend key.** Spending happens in your own wallet on your own computer.
- No request logs. Client IP addresses are held in memory only, for the rate limit
  (10 new addresses per IP per hour, 200 overall).
- The Monero node the wallet connects to sees the server's IP address and which blocks it
  downloads. It never sees the view key.

## Set up the wallet (once)

1. On your own computer, install [Feather Wallet](https://featherwallet.org) or the official
   [Monero GUI](https://www.getmonero.org/downloads/).
2. Create a new wallet used only for donations. Write the seed on paper. It never goes on the
   server or into this repository.
3. From the wallet's keys screen, note the **primary address** (starts with `4`), the
   **secret view key**, and the **restore height** (the block height when the wallet was
   created).

For testing, make a separate **stagenet** wallet the same way (both wallets can switch
network in their settings) and get free stagenet coins from a faucet.

## Run the server

You need a Linux server with Docker, 2 GB of RAM and ports 80 and 443 open.

1. Point `pay.permanentunderclass.me` at the server. With Vercel DNS:
   `vercel dns add permanentunderclass.me pay A <server IP>`.
2. On the server, clone this repository, then `cd pay && cp .env.example .env` and fill in
   `.env`. Each setting is explained there.
3. Start it: `docker compose up -d --build`. On first start `pay` creates the view-only
   wallet from the keys and the wallet scans from the restore height, which takes a few
   minutes for a new wallet.
4. Check it: `curl https://pay.permanentunderclass.me/v1/health` answers `{"ready":true}`.

After the first start the wallet file holds the keys, encrypted with `WALLET_PASSWORD`. You
can then delete `MONERO_VIEW_KEY` from `.env`.

**Choosing a Monero node.** Your own pruned node (`monerod --prune-blockchain`, around
100 GB of disk) is the most private and reliable. A public remote node works for a start;
use one that offers restricted RPC (usually port 18089).

## Connect the site

In Vercel, set `PUBLIC_PAY_URL=https://pay.permanentunderclass.me` for Production and
redeploy. The Content-Security-Policy in `site/vercel.json` already allows that host. If the
server moves to another host, update `connect-src` there too.

## Test it

Without any server: `cd pay && npm run demo` runs the API against a fake wallet (see the
README).

On **stagenet**, with free coins:

1. In `.env`: `MONERO_NETWORK=stagenet`, `WALLET_FILE=donations-stagenet`, the stagenet
   wallet's keys, and a stagenet node.
2. Add `http://localhost:4321` to `ALLOWED_ORIGINS` and run the site locally with
   `PUBLIC_PAY_URL=https://pay.permanentunderclass.me`, so the public site never shows a
   stagenet address.
3. Send coins from another stagenet wallet and watch the page go from waiting to confirmed.

On **mainnet**, with real XMR: set `MONERO_NETWORK=mainnet`, `WALLET_FILE=donations` and the
donation wallet's keys, remove `localhost` from `ALLOWED_ORIGINS`, run
`docker compose up -d`, and send a small amount (0.001 XMR) to the live page.

## Spending donations

Open the donation wallet from its seed in Feather or the Monero GUI on your own computer.
Every donation subaddress belongs to account 0 of that wallet.

## API

| Request | Answer |
|---|---|
| `POST /v1/donations` | `201` with a new donation in the same shape as below, `state: "waiting"`. `429` when rate limited, `503` while the wallet isn't ready. |
| `GET /v1/donations/:id` | `200 { id, address, state, amount, confirmations, required }`. `state` is `waiting`, `seen` or `confirmed`; `amount` is XMR as a string (`"0.05"`); `confirmations` is `null` while waiting. `404` for an unknown id. |
| `GET /v1/health` | `200 { ready: true }`, or `503` while the wallet isn't ready. |

Only origins listed in `ALLOWED_ORIGINS` get CORS headers.

## Upgrading Monero

Change `MONERO_VERSION` and `MONERO_SHA256` in `pay/wallet-rpc.Dockerfile` to the new
release's linux-x64 line from [hashes.txt](https://www.getmonero.org/downloads/hashes.txt),
after checking that file's GPG signature. Then run `docker compose up -d --build`.
