import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createApp } from '../src/app.ts';
import type { AppOptions } from '../src/app.ts';
import { Donations, formatXmr } from '../src/donations.ts';
import type { DonationsOptions } from '../src/donations.ts';
import { RateLimiter } from '../src/ratelimit.ts';
import { WalletRpc } from '../src/wallet.ts';
import { startFakeWallet } from './fake-wallet.ts';
import type { FakeWallet } from './fake-wallet.ts';

const XMR = 1_000_000_000_000;
const KEYS = { address: '4PrimaryAddressForTests', viewKey: 'a'.repeat(64), restoreHeight: 3_400_000 };
const ORIGIN = 'https://permanentunderclass.me';

let wallet: FakeWallet;
let server: Server | undefined;

function donationsFor(w: FakeWallet, extra: Partial<DonationsOptions> = {}) {
  return new Donations(new WalletRpc(w.url), {
    walletFile: 'donations',
    walletPassword: '',
    requiredConfirmations: 10,
    keys: KEYS,
    ...extra,
  });
}

async function serve(donations: Donations, extra: Partial<AppOptions> = {}) {
  server = createApp(donations, {
    allowedOrigins: [ORIGIN],
    createsPerIpPerHour: 10,
    createsPerHour: 200,
    trustProxy: false,
    ...extra,
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

beforeEach(async () => {
  wallet = await startFakeWallet();
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  await wallet.close();
});

describe('wallet setup', () => {
  test('creates a view-only wallet from the keys when none exists', async () => {
    await donationsFor(wallet).init();
    const created = wallet.calls.find((c) => c.method === 'generate_from_keys');
    assert.ok(created);
    assert.equal(created.params.viewkey, KEYS.viewKey);
    assert.equal(created.params.restore_height, KEYS.restoreHeight);
    assert.equal(wallet.files.get('donations')?.spendKeyGiven, false);
  });

  test('opens an existing wallet without the keys', async () => {
    await donationsFor(wallet).init();
    const again = donationsFor(wallet, { keys: undefined });
    await again.init();
    assert.equal(again.ready, true);
  });

  test('says what is missing when there is no wallet and no keys', async () => {
    await assert.rejects(donationsFor(wallet, { keys: undefined }).init(), /MONERO_ADDRESS\/MONERO_VIEW_KEY/);
  });
});

describe('donation status', () => {
  test('goes waiting, seen, confirmed', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const { id, address } = await donations.create();
    const index = donations.entries.get(id)!.index;

    let s = await donations.status(id);
    assert.deepEqual(s, { id, address, required: 10, state: 'waiting', amount: '0', confirmations: null });

    wallet.pay(index, 0.05 * XMR, { pool: true });
    s = await donations.status(id);
    assert.equal(s?.state, 'seen');
    assert.equal(s?.amount, '0.05');
    assert.equal(s?.confirmations, 0);

    wallet.confirm(index, 3);
    s = await donations.status(id);
    assert.equal(s?.state, 'seen');
    assert.equal(s?.confirmations, 3);

    wallet.confirm(index, 25);
    s = await donations.status(id);
    assert.equal(s?.state, 'confirmed');
    assert.equal(s?.confirmations, 10);
  });

  test('adds up several payments and waits for the newest', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const { id } = await donations.create();
    const index = donations.entries.get(id)!.index;
    wallet.pay(index, 0.1 * XMR, { confirmations: 30 });
    wallet.pay(index, 0.025 * XMR, { confirmations: 2 });
    const s = await donations.status(id);
    assert.equal(s?.amount, '0.125');
    assert.equal(s?.state, 'seen');
    assert.equal(s?.confirmations, 2);
  });

  test('remembers donations across restarts from the wallet labels', async () => {
    const first = donationsFor(wallet);
    await first.init();
    const { id, address } = await first.create();

    const restarted = donationsFor(wallet, { keys: undefined });
    await restarted.init();
    assert.equal((await restarted.status(id))?.address, address);
  });

  test('does not answer for unknown or malformed ids', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    assert.equal(await donations.status('AAAAAAAAAAAAAAAA'), null);
    assert.equal(await donations.status('../../etc/passwd'), null);
    assert.equal(await donations.status('1'), null);
  });
});

describe('HTTP API', () => {
  test('creates a donation and reports its status', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const base = await serve(donations);

    const created = await fetch(`${base}/v1/donations`, { method: 'POST', headers: { origin: ORIGIN } });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    const body = (await created.json()) as { id: string; address: string; state: string; required: number };
    const { id, address } = body;
    assert.match(id, /^[A-Za-z0-9_-]{16}$/);
    assert.equal(address.length, 95);
    assert.equal(body.state, 'waiting');
    assert.equal(body.required, 10);

    const status = await fetch(`${base}/v1/donations/${id}`);
    assert.equal(status.status, 200);
    assert.equal(((await status.json()) as { state: string }).state, 'waiting');
  });

  test('gives other origins no CORS header', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const base = await serve(donations);
    const res = await fetch(`${base}/v1/health`, { headers: { origin: 'https://example.com' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('returns 404 for unknown donations and paths', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const base = await serve(donations);
    assert.equal((await fetch(`${base}/v1/donations/AAAAAAAAAAAAAAAA`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });

  test('returns 503 until the wallet is ready', async () => {
    const base = await serve(donationsFor(wallet));
    assert.equal((await fetch(`${base}/v1/health`)).status, 503);
    assert.equal((await fetch(`${base}/v1/donations`, { method: 'POST' })).status, 503);
  });

  test('limits new addresses per client', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const base = await serve(donations, { createsPerIpPerHour: 2 });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(`${base}/v1/donations`, { method: 'POST' })).status);
    assert.deepEqual(codes, [201, 201, 429]);
  });

  test('behind a proxy, limits by the address the proxy added', async () => {
    const donations = donationsFor(wallet);
    await donations.init();
    const base = await serve(donations, { createsPerIpPerHour: 1, trustProxy: true });
    const post = (xff: string) =>
      fetch(`${base}/v1/donations`, { method: 'POST', headers: { 'x-forwarded-for': xff } }).then((r) => r.status);
    assert.equal(await post('9.9.9.9, 1.1.1.1'), 201);
    // Same real client, forged first entry: still limited.
    assert.equal(await post('8.8.8.8, 1.1.1.1'), 429);
    assert.equal(await post('2.2.2.2'), 201);
  });
});

describe('helpers', () => {
  test('formatXmr', () => {
    assert.equal(formatXmr(0n), '0');
    assert.equal(formatXmr(1n), '0.000000000001');
    assert.equal(formatXmr(50_000_000_000n), '0.05');
    assert.equal(formatXmr(12_340_000_000_000n), '12.34');
    assert.equal(formatXmr(3_000_000_000_000n), '3');
  });

  test('RateLimiter forgets old hits', () => {
    const limiter = new RateLimiter(1, 1000);
    assert.equal(limiter.take('a', 0), true);
    assert.equal(limiter.take('a', 500), false);
    assert.equal(limiter.take('a', 1500), true);
  });
});
