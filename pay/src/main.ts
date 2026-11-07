// Entry point. All settings come from the environment; see pay/.env.example.

import { createApp } from './app.ts';
import { Donations, errorText } from './donations.ts';
import type { WalletKeys } from './donations.ts';
import { WalletRpc } from './wallet.ts';

const env = process.env;

function number(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return value;
}

function walletKeys(): WalletKeys | undefined {
  const address = env.MONERO_ADDRESS;
  const viewKey = env.MONERO_VIEW_KEY;
  if (!address && !viewKey) return undefined;
  if (!address || !viewKey) throw new Error('set both MONERO_ADDRESS and MONERO_VIEW_KEY, or neither');
  if (!env.MONERO_RESTORE_HEIGHT) {
    throw new Error('MONERO_RESTORE_HEIGHT is required with the keys, or the wallet scans the whole chain');
  }
  return { address, viewKey, restoreHeight: number('MONERO_RESTORE_HEIGHT', 0) };
}

const donations = new Donations(new WalletRpc(env.WALLET_RPC_URL ?? 'http://127.0.0.1:18083/json_rpc'), {
  walletFile: env.WALLET_FILE ?? 'donations',
  walletPassword: env.WALLET_PASSWORD ?? '',
  requiredConfirmations: number('REQUIRED_CONFIRMATIONS', 10),
  keys: walletKeys(),
});

const app = createApp(donations, {
  allowedOrigins: (env.ALLOWED_ORIGINS ?? 'https://permanentunderclass.me').split(',').map((o) => o.trim()),
  createsPerIpPerHour: number('CREATES_PER_IP_PER_HOUR', 10),
  createsPerHour: number('CREATES_PER_HOUR', 200),
  trustProxy: env.TRUST_PROXY === 'true',
});

const port = number('PORT', 8080);
const host = env.HOST ?? '127.0.0.1';
app.listen(port, host, () => console.log(`listening on ${host}:${port}`));

// wallet-rpc may start after us, or the wallet may still be syncing: keep trying.
async function connectWallet() {
  for (;;) {
    try {
      await donations.init();
      console.log(`wallet ready, ${donations.entries.size} donation addresses`);
      return;
    } catch (err) {
      console.error(`wallet not ready: ${errorText(err)}. Retrying in 10 s.`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

connectWallet();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => app.close(() => process.exit(0)));
}
