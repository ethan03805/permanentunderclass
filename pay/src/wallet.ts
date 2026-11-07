// Minimal JSON-RPC client for monero-wallet-rpc.
// https://docs.getmonero.org/rpc-library/wallet-rpc/

export class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
  }
}

export class WalletRpc {
  url: string;
  timeoutMs: number;

  constructor(url: string, timeoutMs = 15_000) {
    this.url = url;
    this.timeoutMs = timeoutMs;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '0', method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new RpcError(res.status, `wallet-rpc answered HTTP ${res.status} to ${method}`);
    const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (body.error) throw new RpcError(body.error.code, `${method}: ${body.error.message}`);
    return body.result as T;
  }
}
