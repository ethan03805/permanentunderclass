// Donate page: asks the donation server (pay/) for a fresh Monero subaddress,
// shows it, and polls until the payment has enough confirmations.
// The donation id lives in the URL fragment, which browsers never send to the
// site's host, so a bookmark brings you back without the site logging it.

import { renderSVG } from 'uqr';

type State = 'waiting' | 'seen' | 'confirmed';

interface Donation {
  id: string;
  address: string;
  state: State;
  amount: string;
  confirmations: number | null;
  required: number;
}

const PAY_URL = (import.meta.env.PUBLIC_PAY_URL ?? '').replace(/\/+$/, '');
const POLL_MS = 15_000;
const ID_RE = /^[A-Za-z0-9_-]{16}$/;
const AMOUNT_RE = /^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = $('donate-message');
const panel = $('donate-panel');
const qr = $('donate-qr');
const addressBox = $('donate-address');
const copyButton = $<HTMLButtonElement>('donate-copy');
const openLink = $<HTMLAnchorElement>('donate-open');
const amountInput = $<HTMLInputElement>('donate-amount');
const amountError = $('donate-amount-error');
const log = $('donate-log');

let current: Donation | null = null;
let pollTimer: number | undefined;
let unreachable = false;

class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Donation> {
  const res = await fetch(PAY_URL + path, { ...init, cache: 'no-store' });
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as Donation;
}

function showMessage(text: string, link?: { href: string; label: string }) {
  panel.hidden = true;
  message.replaceChildren();
  const p = document.createElement('p');
  p.textContent = text;
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.label;
    p.append(' ', a);
  }
  message.append(p);
  message.hidden = false;
}

function walletUri(address: string): string {
  const amount = amountInput.value.trim();
  const valid = amount === '' || AMOUNT_RE.test(amount);
  amountError.hidden = valid;
  amountInput.setAttribute('aria-invalid', String(!valid));
  return amount !== '' && valid ? `monero:${address}?tx_amount=${amount}` : `monero:${address}`;
}

function renderAddress(address: string) {
  // Groups of four make the address easy to compare by eye. They are separate
  // elements, not spaces, so selecting and copying the text gives the real address.
  addressBox.replaceChildren(
    ...(address.match(/.{1,4}/g) ?? []).map((group) => {
      const span = document.createElement('span');
      span.textContent = group;
      return span;
    }),
  );
}

function renderUri(address: string) {
  const uri = walletUri(address);
  openLink.href = uri;
  qr.innerHTML = renderSVG(uri, { border: 1, whiteColor: '#e6e6e6', blackColor: '#111111' });
}

function renderLog(d: Donation) {
  const lines: { text: string; em?: boolean }[] = [
    { text: `watching ${d.address.slice(0, 4)}…${d.address.slice(-3)}` },
  ];
  if (d.state === 'waiting') {
    lines.push({ text: 'waiting for payment' });
  } else {
    lines.push({ text: `payment seen: ${d.amount} XMR` });
    lines.push({ text: `confirmations: ${d.confirmations ?? 0} of ${d.required}` });
  }
  if (d.state === 'confirmed') lines.push({ text: 'received. thank you.', em: true });
  if (unreachable) lines.push({ text: 'can’t reach the donation server, retrying' });

  log.replaceChildren(
    ...lines.map((line) => {
      const div = document.createElement('div');
      div.textContent = line.text;
      if (line.em) div.className = 'em';
      return div;
    }),
  );
}

function render(d: Donation) {
  const isNew = current?.address !== d.address;
  current = d;
  if (isNew) {
    renderAddress(d.address);
    renderUri(d.address);
  }
  renderLog(d);
  message.hidden = true;
  panel.hidden = false;
}

function schedulePoll() {
  window.clearTimeout(pollTimer);
  if (!current || current.state === 'confirmed' || document.hidden) return;
  pollTimer = window.setTimeout(poll, POLL_MS);
}

async function poll() {
  if (!current) return;
  try {
    const d = await api(`/v1/donations/${current.id}`);
    unreachable = false;
    render(d);
  } catch {
    unreachable = true;
    renderLog(current);
  }
  schedulePoll();
}

async function start() {
  if (!PAY_URL) {
    showMessage('The donation server isn’t connected yet, so there’s no address to show. Check back later.');
    return;
  }

  const id = location.hash.slice(1);
  try {
    if (ID_RE.test(id)) {
      render(await api(`/v1/donations/${id}`));
    } else {
      const d = await api('/v1/donations', { method: 'POST' });
      history.replaceState(null, '', `#${d.id}`);
      render(d);
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 0;
    if (status === 404) {
      showMessage('This donation link isn’t known to the server.', { href: '/donate', label: 'Get a new address' });
    } else if (status === 429) {
      showMessage('Too many new addresses from your connection. Try again in an hour.');
    } else {
      showMessage('Couldn’t reach the donation server. Try again in a minute.', { href: '/donate', label: 'Try again' });
    }
    return;
  }
  schedulePoll();
}

copyButton.addEventListener('click', async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(current.address);
    copyButton.textContent = 'copied';
    copyButton.classList.add('done');
    window.setTimeout(() => {
      copyButton.textContent = 'copy';
      copyButton.classList.remove('done');
    }, 2000);
  } catch {
    window.getSelection()?.selectAllChildren(addressBox);
  }
});

amountInput.addEventListener('input', () => {
  if (current) renderUri(current.address);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) poll();
});

window.addEventListener('hashchange', () => location.reload());

start();
