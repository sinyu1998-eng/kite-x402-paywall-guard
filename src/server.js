import { createServer } from 'node:http';
import { createGuardHandler } from './guard.js';
import { resolveNetwork } from './networks.js';

const PORT = Number(process.env.PORT || 8080);
const NETWORK = process.env.KITE_NETWORK || 'testnet';
const PAY_TO = process.env.PAY_TO || '';
const MIN_AMOUNT = process.env.PRICE_USD || '0.001';
const FACILITATOR_URL = process.env.FACILITATOR_URL || undefined;

const net = resolveNetwork(NETWORK);
const requirements = [{
  scheme: 'exact',
  network: net.caip2,
  asset: net.token,
  amount: MIN_AMOUNT,
  payTo: PAY_TO || '0x0000000000000000000000000000000000000000',
  description: process.env.SERVICE_DESCRIPTION || 'paid API call',
}];

const handlePaid = createGuardHandler({
  expectedNetwork: NETWORK,
  payTo: PAY_TO || undefined,
  minAmount: MIN_AMOUNT,
  facilitatorUrl: FACILITATOR_URL,
  paymentRequirements: requirements,
  onPaid: async (_req, result) => ({
    ok: true,
    data: { message: 'payment accepted', resource: 'premium-content' },
    receipt: result.settlement || result.summary,
  }),
});

const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, network: net.caip2, token: net.token }));
    return;
  }
  if (url.pathname === '/.well-known/x402') {
    res.writeHead(200);
    res.end(JSON.stringify({ x402Version: 2, accepts: requirements }));
    return;
  }
  if (url.pathname === '/v1/premium' && req.method === 'GET') {
    const out = await handlePaid(req);
    if (out.status === 402) {
      res.writeHead(402, {
        'content-type': 'application/json',
        'x-payment-required': Buffer.from(JSON.stringify({ x402Version: 2, accepts: requirements })).toString('base64'),
      });
    } else res.writeHead(200);
    res.end(JSON.stringify(out.body));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(PORT, () => console.log(`x402-guard listening on :${PORT} (${net.caip2}, ${net.token}, min ${MIN_AMOUNT})`));
}

export { server };
