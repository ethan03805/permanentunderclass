# Hosting

Vercel hosts the site for now because the domain is already there. The plan is to move off
it; the steps are below.

## Today

| Piece | Where |
|---|---|
| Domain | `permanentunderclass.me`, registered at Vercel, renews 23 March 2027. Vercel DNS. |
| Site | Vercel project `permanentunderclass`, root directory `site`, deploys every push to `main`. `www` redirects to the bare domain (`site/vercel.json`). |
| Site settings | Vercel environment variables: `PUBLIC_PAY_URL` (once the donation server runs) and `ASTRO_TELEMETRY_DISABLED=1`. |
| Security headers | `site/vercel.json`: Content-Security-Policy, no referrer, no inline scripts or styles. |
| Donation server | Not running yet. It goes on a separate server at `pay.permanentunderclass.me` (`docs/donations.md`). |

## Moving off Vercel

The site is static files (`site/dist` after `npm run build`), so it can run anywhere.

1. **Serve the site from the donation server.** Add a block for `permanentunderclass.me` to
   `pay/Caddyfile` that serves the built files, and copy the headers and the `www` redirect
   from `site/vercel.json`, which only Vercel reads.
2. **Add a Tor onion address** on that server, so the site stays reachable if the domain is
   taken away. dfin's design asks the same of the network.
3. **Move the domain** to a registrar that accepts Monero and keeps the owner private (for
   example Njalla), then point DNS at the server. Montenegro's registry runs `.me` and can
   suspend a domain whichever registrar holds it, which is why the onion address matters.
4. **Delete the Vercel project** once the new server answers on the domain.

### Choosing a host

- Mainstream hosts (Hetzner, OVH, Vultr): cheap and reliable, but they verify identity and
  can drop a customer.
- Privacy-focused hosts that accept Monero: harder to take down, smaller and less reliable.
- dfin's design puts the project's own servers in the US. Decide whether that applies to
  the website before choosing.
