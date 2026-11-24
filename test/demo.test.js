import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from '../demo/server.js';

/**
 * 演示链路端到端测试：
 * ① 无凭证 → 402  ② 签发  ③ 放行并出收据  ④ 重放 → 402
 * 另外覆盖签名伪造与静态页可达性。
 */
async function withDemo(run) {
  const server = createDemoServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('demo: 无凭证访问付费资源返回 402 payment_required', async () => {
  await withDemo(async (base) => {
    const res = await fetch(`${base}/api/premium`);
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.error, 'payment_required');
    assert.ok(Array.isArray(body.accepts) && body.accepts.length > 0);
  });
});

test('demo: 签发凭证后携带可放行并生成收据', async () => {
  await withDemo(async (base) => {
    const pay = await fetch(`${base}/api/pay`, { method: 'POST' });
    assert.equal(pay.status, 200);
    const { xPaymentHeader } = await pay.json();
    assert.match(xPaymentHeader, /^v1\.[\w-]+\.[\w-]+$/);

    const res = await fetch(`${base}/api/premium`, { headers: { 'X-PAYMENT': xPaymentHeader } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.receipt.id, /^rcpt_/);
    assert.equal(body.receipt.amount, '9.90');

    const list = await (await fetch(`${base}/api/receipts`)).json();
    assert.equal(list.count, 1);
    assert.equal(list.receipts[0].id, body.receipt.id);
  });
});

test('demo: 同一凭证重放被拒绝', async () => {
  await withDemo(async (base) => {
    const { xPaymentHeader } = await (await fetch(`${base}/api/pay`, { method: 'POST' })).json();

    const first = await fetch(`${base}/api/premium`, { headers: { 'X-PAYMENT': xPaymentHeader } });
    assert.equal(first.status, 200);

    const replay = await fetch(`${base}/api/premium`, { headers: { 'X-PAYMENT': xPaymentHeader } });
    assert.equal(replay.status, 402);
    assert.equal((await replay.json()).error, 'replay_detected');

    const list = await (await fetch(`${base}/api/receipts`)).json();
    assert.equal(list.count, 1, '重放不应产生第二条收据');
  });
});

test('demo: 伪造签名与畸形凭证都被拒绝', async () => {
  await withDemo(async (base) => {
    const { xPaymentHeader } = await (await fetch(`${base}/api/pay`, { method: 'POST' })).json();
    const [v, payload] = xPaymentHeader.split('.');

    const forged = await fetch(`${base}/api/premium`, { headers: { 'X-PAYMENT': `${v}.${payload}.deadbeef` } });
    assert.equal(forged.status, 402);
    assert.equal((await forged.json()).error, 'bad_signature');

    const malformed = await fetch(`${base}/api/premium`, { headers: { 'X-PAYMENT': 'not-a-token' } });
    assert.equal(malformed.status, 402);
    assert.equal((await malformed.json()).error, 'malformed');
  });
});

test('demo: 根路径返回演示页面', async () => {
  await withDemo(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /Kite x402 Paywall Guard/);
  });
});
