// A stand-in for monero-wallet-rpc that implements just the calls pay/ makes,
// so tests and the local demo run without Monero installed.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

interface FakeTransfer {
  amount: number;
  confirmations: number;
  pool: boolean;
}

interface FakeSubaddress {
  index: number;
  address: string;
  label: string;
  createdAt: number;
}

interface FakeWalletFile {
  password: string;
  restoreHeight: number;
  viewKey: string;
  spendKeyGiven: boolean;
  subaddresses: FakeSubaddress[];
}

export interface FakeWallet {
  url: string;
  files: Map<string, FakeWalletFile>;
  calls: { method: string; params: Record<string, unknown> }[];
  transfers: Map<number, FakeTransfer[]>;
  open(): FakeWalletFile;
  pay(index: number, amount: number, opts?: { confirmations?: number; pool?: boolean }): void;
  confirm(index: number, confirmations: number): void;
  close(): Promise<void>;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function fakeAddress(seed: number): string {
  let x = seed * 2654435761 + 12345;
  let out = '8';
  while (out.length < 95) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += BASE58[x % BASE58.length];
  }
  return out;
}

export async function startFakeWallet(): Promise<FakeWallet> {
  const files = new Map<string, FakeWalletFile>();
  const calls: FakeWallet['calls'] = [];
  const transfers = new Map<number, FakeTransfer[]>();
  let openFile: string | null = null;

  const open = () => {
    const file = openFile ? files.get(openFile) : undefined;
    if (!file) throw { code: -13, message: 'No wallet file' };
    return file;
  };

  const methods: Record<string, (p: Record<string, any>) => unknown> = {
    open_wallet(p) {
      const file = files.get(p.filename);
      if (!file || file.password !== (p.password ?? '')) throw { code: -1, message: 'Failed to open wallet' };
      openFile = p.filename;
      return {};
    },
    generate_from_keys(p) {
      if (files.has(p.filename)) throw { code: -1, message: 'Wallet already exists.' };
      files.set(p.filename, {
        password: p.password ?? '',
        restoreHeight: p.restore_height,
        viewKey: p.viewkey,
        spendKeyGiven: 'spendkey' in p,
        subaddresses: [{ index: 0, address: p.address, label: 'Primary account', createdAt: Date.now() }],
      });
      openFile = p.filename;
      return { address: p.address, info: 'Wallet has been generated successfully.' };
    },
    get_address() {
      const file = open();
      return {
        address: file.subaddresses[0].address,
        addresses: file.subaddresses.map((s) => ({
          address: s.address,
          address_index: s.index,
          label: s.label,
          used: transfers.has(s.index),
        })),
      };
    },
    create_address(p) {
      const file = open();
      const index = file.subaddresses.length;
      const address = fakeAddress(index);
      file.subaddresses.push({ index, address, label: p.label ?? '', createdAt: Date.now() });
      return { address, address_index: index };
    },
    store() {
      open();
      return {};
    },
    get_transfers(p) {
      open();
      const indices: number[] = p.subaddr_indices ?? [];
      const picked = indices.flatMap((i) => transfers.get(i) ?? []);
      const result: Record<string, unknown[]> = {};
      const mined = picked.filter((t) => !t.pool).map((t) => ({ amount: t.amount, confirmations: t.confirmations }));
      const pool = picked.filter((t) => t.pool).map((t) => ({ amount: t.amount, double_spend_seen: false }));
      // Like the real wallet-rpc, empty lists are left out.
      if (p.in && mined.length) result.in = mined;
      if (p.pool && pool.length) result.pool = pool;
      return result;
    },
  };

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { id, method, params = {} } = JSON.parse(body);
      calls.push({ method, params });
      let reply: unknown;
      try {
        const fn = methods[method];
        if (!fn) throw { code: -32601, message: 'Method not found' };
        reply = { jsonrpc: '2.0', id, result: fn(params) };
      } catch (error) {
        reply = { jsonrpc: '2.0', id, error };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/json_rpc`,
    files,
    calls,
    transfers,
    open,
    pay(index, amount, opts = {}) {
      const list = transfers.get(index) ?? [];
      list.push({ amount, confirmations: opts.confirmations ?? 0, pool: opts.pool ?? false });
      transfers.set(index, list);
    },
    confirm(index, confirmations) {
      for (const t of transfers.get(index) ?? []) {
        t.pool = false;
        t.confirmations = confirmations;
      }
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
