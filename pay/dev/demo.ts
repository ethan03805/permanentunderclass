// Local demo: the donation server on port 8787 against a fake wallet that
// "receives" 0.05 XMR a few seconds after each new address and then counts
// confirmations up quickly. Run `npm run demo`, then the site with
// PUBLIC_PAY_URL=http://localhost:8787 and open /donate.

import { createApp } from '../src/app.ts';
import { Donations } from '../src/donations.ts';
import { WalletRpc } from '../src/wallet.ts';
import { startFakeWallet } from '../test/fake-wallet.ts';

const wallet = await startFakeWallet();
const donations = new Donations(new WalletRpc(wallet.url), {
  walletFile: 'demo',
  walletPassword: '',
  requiredConfirmations: 10,
  keys: { address: '4DemoPrimaryAddress', viewKey: '0'.repeat(64), restoreHeight: 0 },
});
await donations.init();

const app = createApp(donations, {
  allowedOrigins: ['http://localhost:4321', 'http://127.0.0.1:4321'],
  createsPerIpPerHour: 1000,
  createsPerHour: 1000,
  trustProxy: false,
});
app.listen(8787, '127.0.0.1', () => console.log('demo donation server on http://localhost:8787'));

setInterval(() => {
  const now = Date.now();
  for (const s of wallet.open().subaddresses) {
    if (s.index === 0) continue;
    const age = (now - s.createdAt) / 1000;
    const transfers = wallet.transfers.get(s.index);
    if (!transfers && age > 6) wallet.pay(s.index, 50_000_000_000, { pool: true });
    if (transfers && age > 12) wallet.confirm(s.index, Math.min(Math.floor((age - 12) / 3) + 1, 12));
  }
}, 1000);
