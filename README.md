# Permanent Underclass

The website for [dfin](https://github.com/ethan03805/dfin), served at
[permanentunderclass.me](https://permanentunderclass.me), and the server that takes Monero
donations.

dfin itself (the network, its design, what works) lives in its own repository. This one
describes it and links to it; it does not keep its own copy of dfin's facts.

## What's here

| Path | What |
|---|---|
| `site/` | The website. Astro, built to static files. No cookies, no analytics, no third-party requests. |
| `pay/` | The donation server: a small Node service in front of a view-only `monero-wallet-rpc`. |
| `docs/donations.md` | How donations work, setting up the wallet and the server, testing, the API. |
| `docs/hosting.md` | Where everything runs today and how to move it off Vercel. |
| `AGENTS.md` | Rules for coding agents working in this repository. |

## Run it locally

The site needs Node 22.12 or later.

```bash
cd site && npm install && npm run dev
```

It opens on http://localhost:4321. Without `PUBLIC_PAY_URL` the donate page says donations
aren't connected yet.

To try the donate page without Monero, run the donation server against a fake wallet that
receives a payment a few seconds after each new address:

```bash
cd pay && npm run demo
```

Then start the site pointed at it (in PowerShell: `$env:PUBLIC_PAY_URL="http://localhost:8787"; npm run dev`):

```bash
cd site && PUBLIC_PAY_URL=http://localhost:8787 npm run dev
```

## Checks

```bash
cd pay && npm test
```

```bash
cd site && npm run build
```

## Deploy

The site deploys to Vercel from `main` (`docs/hosting.md`). The donation server runs with
Docker Compose on a separate server (`docs/donations.md`).
