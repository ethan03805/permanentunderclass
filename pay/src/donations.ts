// Donation addresses and their payment status, kept entirely in the wallet.
//
// Each donation is a subaddress of account 0 labelled "donation:<id>". The id is
// random, so nobody can look up someone else's donation by counting. Labels live
// in the wallet file, so there is no database: on start the labels are read back.

import { randomBytes } from 'node:crypto';
import type { WalletRpc } from './wallet.ts';

export const LABEL_PREFIX = 'donation:';
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const ATOMIC_PER_XMR = 1_000_000_000_000n;

export type DonationState = 'waiting' | 'seen' | 'confirmed';

export interface DonationStatus {
  id: string;
  address: string;
  state: DonationState;
  /** XMR as a decimal string, e.g. "0.05". "0" while waiting. */
  amount: string;
  /** Fewest confirmations among the payments, capped at `required`. Null while waiting. */
  confirmations: number | null;
  required: number;
}

export interface WalletKeys {
  address: string;
  viewKey: string;
  restoreHeight: number;
}

export interface DonationsOptions {
  walletFile: string;
  walletPassword: string;
  requiredConfirmations: number;
  /** Only used to create the view-only wallet the first time. */
  keys?: WalletKeys;
}

interface Transfer {
  // wallet-rpc sends atomic units as JSON numbers. They are exact up to 2^53,
  // about 9,007 XMR per payment.
  amount: number;
  confirmations?: number;
  double_spend_seen?: boolean;
}

export function formatXmr(atomic: bigint): string {
  const whole = atomic / ATOMIC_PER_XMR;
  const frac = (atomic % ATOMIC_PER_XMR).toString().padStart(12, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export class Donations {
  wallet: WalletRpc;
  options: DonationsOptions;
  entries = new Map<string, { index: number; address: string }>();
  ready = false;

  constructor(wallet: WalletRpc, options: DonationsOptions) {
    this.wallet = wallet;
    this.options = options;
  }

  async init(): Promise<void> {
    await this.openOrCreateWallet();
    const result = await this.wallet.call<{
      addresses: { address: string; address_index: number; label?: string }[];
    }>('get_address', { account_index: 0 });
    this.entries.clear();
    for (const a of result.addresses) {
      if (a.label?.startsWith(LABEL_PREFIX)) {
        this.entries.set(a.label.slice(LABEL_PREFIX.length), { index: a.address_index, address: a.address });
      }
    }
    this.ready = true;
  }

  private async openOrCreateWallet(): Promise<void> {
    const { walletFile: filename, walletPassword: password, keys } = this.options;
    try {
      await this.wallet.call('open_wallet', { filename, password });
      return;
    } catch (err) {
      if (!keys) {
        throw new Error(
          `could not open wallet "${filename}" and MONERO_ADDRESS/MONERO_VIEW_KEY are not set to create it (${errorText(err)})`,
        );
      }
    }
    // No spend key is ever passed, so this wallet can see payments but cannot send them.
    await this.wallet.call('generate_from_keys', {
      filename,
      password,
      address: keys.address,
      viewkey: keys.viewKey,
      restore_height: keys.restoreHeight,
      autosave_current: true,
    });
  }

  async create(): Promise<DonationStatus> {
    const id = randomBytes(12).toString('base64url');
    const result = await this.wallet.call<{ address: string; address_index: number }>('create_address', {
      account_index: 0,
      label: LABEL_PREFIX + id,
    });
    await this.wallet.call('store');
    this.entries.set(id, { index: result.address_index, address: result.address });
    return {
      id,
      address: result.address,
      state: 'waiting',
      amount: '0',
      confirmations: null,
      required: this.options.requiredConfirmations,
    };
  }

  async status(id: string): Promise<DonationStatus | null> {
    if (!ID_RE.test(id)) return null;
    const entry = this.entries.get(id);
    if (!entry) return null;

    const required = this.options.requiredConfirmations;
    const result = await this.wallet.call<{ in?: Transfer[]; pool?: Transfer[] }>('get_transfers', {
      in: true,
      pool: true,
      account_index: 0,
      subaddr_indices: [entry.index],
    });
    const mined = result.in ?? [];
    const pending = (result.pool ?? []).filter((t) => !t.double_spend_seen);
    const base = { id, address: entry.address, required };

    if (mined.length === 0 && pending.length === 0) {
      return { ...base, state: 'waiting', amount: '0', confirmations: null };
    }

    let total = 0n;
    for (const t of [...mined, ...pending]) total += BigInt(t.amount);
    const fewest = pending.length > 0 ? 0 : Math.min(...mined.map((t) => t.confirmations ?? 0));
    return {
      ...base,
      state: fewest >= required ? 'confirmed' : 'seen',
      amount: formatXmr(total),
      confirmations: Math.min(fewest, required),
    };
  }
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
