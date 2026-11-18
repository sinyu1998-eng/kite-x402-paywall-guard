import test from 'node:test';
import assert from 'node:assert/strict';
import { guardPayment, createGuardHandler } from '../src/guard.js';
import { settleProof, FacilitatorError } from '../src/facilitator.js';

const NOW = 1_800_000_000;
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const NONCE = '0x' + 'ab'.repeat(32);
const proof = {
  x402Version: 2, scheme: 'exact', network: 'eip155:2368',
  payload: {
    signature: '0x' + 'cd'.repeat(65),
    authorization: { from: ADDR_A, to: ADDR_B, value: '100000', validAfter: String(NOW - 60), validBefore: String(NOW + 300), nonce: NONCE },
  },
};

// Fake fetch — never touches the network. Returns a successful settle receipt.
const fakeFetchOk = async (url, init) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, transactionHash: '0x' + 'ef'.repeat(32), network: 'eip155:2368' }),
});

test('settleProof: calls /settle and returns receipt', async () => {
  const r = await settleProof(proof, { facilitatorUrl: 'https://facilitator.pieverse.io/v2', fetchImpl: fakeFetchOk });
  assert.equal(r.success, true);
  assert.ok(r.transactionHash);
});

test('settleProof: rejects URL without /v2', async () => {
  await assert.rejects(
    () => settleProof(proof, { facilitatorUrl: 'https://x.example', fetchImpl: fakeFetchOk }),
    (e) => e instanceof FacilitatorError && e.code === 'BAD_URL',
  );
});

test('settleProof: surfaces HTTP errors', async () => {
  const badFetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
  await assert.rejects(
    () => settleProof(proof, { facilitatorUrl: 'https://x.example/v2', fetchImpl: badFetch }),
    (e) => e.code === 'HTTP_ERROR',
  );
});

test('guardPayment: local failure short-circuits before network', async () => {
  let called = false;
  const spyFetch = async () => { called = true; throw new Error('should not be called'); };
  const r = await guardPayment({ header: proof, expectedNetwork: 'testnet', payTo: ADDR_A, nowSec: NOW, facilitatorUrl: 'https://x.example/v2', fetchImpl: spyFetch });
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'local');
  assert.equal(r.code, 'WRONG_PAYEE');
  assert.equal(called, false);
});

test('guardPayment: success settles and returns receipt', async () => {
  const r = await guardPayment({ header: proof, expectedNetwork: 'testnet', nowSec: NOW, facilitatorUrl: 'https://x.example/v2', fetchImpl: fakeFetchOk });
  assert.equal(r.ok, true);
  assert.equal(r.stage, 'settled');
  assert.ok(r.settlement.transactionHash);
});

test('guardPayment: --no-settle returns local-only', async () => {
  const r = await guardPayment({ header: proof, nowSec: NOW, settle: false });
  assert.equal(r.ok, true);
  assert.equal(r.stage, 'local-only');
});

test('createGuardHandler: 402 body on failure, 200 on success', async () => {
  const handler = createGuardHandler({
    expectedNetwork: 'testnet', nowSec: NOW, settle: false,
    paymentRequirements: [{ scheme: 'exact', network: 'eip155:2368' }],
    onPaid: async () => ({ secret: 42 }),
  });
  const ok = await handler({ headers: { 'x-payment': proof } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.secret, 42);
  const fail = await handler({ headers: {} });
  assert.equal(fail.status, 402);
  assert.equal(fail.body.error, 'PAYMENT_REQUIRED');
});
