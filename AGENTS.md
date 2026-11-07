# Agent guide

This repository is the Permanent Underclass website (`site/`) and its Monero donation server
(`pay/`). Read `README.md` first.

## dfin is somewhere else

The network itself is [dfin](https://github.com/ethan03805/dfin). Another agent works on it.
Don't edit dfin from here. When the site needs a fact about dfin, link to dfin's `STATUS.md`
or design document (`site/src/links.ts`) rather than restating it. If the site's short
summary of dfin's status goes stale, fix it to match dfin's `STATUS.md`.

## Docs

- `README.md` plus one file per topic in `docs/`. Each topic lives in exactly one file.
- When something changes, update the file that owns it and fix anything that contradicts it.
  No "v2" copies, no phase-by-phase histories, no notes about how things used to be.
- Short and plain. Write for a person reading it once.

## Design and copy

- The format is the one from voxtts.space: one 600px column, dark, Inter at 14px, plain text
  links. The tokens are in `site/src/styles/global.css`. Reuse them; don't add colors or
  fonts.
- Copy is plain and specific: what something is or does, in sentence case. No marketing
  language, no superlatives, no exclamation marks.

## Privacy rules

- The site makes no third-party requests (fonts are self-hosted), sets no cookies and has no
  analytics.
- No inline scripts or styles. The Content-Security-Policy in `site/vercel.json` forbids
  them, and the Astro config keeps CSS and JS in files.
- `pay` keeps no request logs, holds client IPs in memory only, and never receives a seed or
  spend key.

## Before committing

```bash
cd pay && npm test
```

```bash
cd site && npm run build
```
