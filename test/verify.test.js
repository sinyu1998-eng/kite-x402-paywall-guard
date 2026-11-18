import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProof, VerifyError, decodePaymentHeader } from '../src/verify.js';
import { toBaseUnits, KITE_NETWORKS, resolveNetwork } from '../src/networks.js';

const NOW = 1_800_000_000;
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const NONCE = '0x' + 'ab'.repeat(32);

function makeProof(overrides = {}) {
  const authorization = {
    from: ADDR_A,
    to: ADDR_B,
    value: '100000',            // 0.1 pieUSD (18 dec would be tiny); fine for structure test
    validAfter: String(NOW - 60),
    validBefore: String(NOW + 300),
    nonce: NONCE,
    ...(overrides.authorization || {}),
  };
  const payload = {
    signature: '0x' + 'cd'.repeat(65),
    authorization,
    ...(overrides.payload || {}),
  };
  return {
    x402Version: overrides.x402Version ?? 2,
    scheme: overrides.scheme ?? 'exact',
    network: overrides.network ?? 'eip155:2368',
    payload,
  };
}

test('decodePaymentHeader: base64 of JSON and raw object both work', () => {
  const p = makeProof();
  const b64 = Buffer.from(JSON.stringify(p)).toString('base64');
  assert.deepEqual(decodePaymentHeader(b64), p);
  assert.deepEqual(decodePaymentHeader(p), p);
});

test('decodePaymentHeader: rejects empty / bad base64 / bad json', () => {
  assert.throws(() => decodePaymentHeader(''), (e) => e instanceof VerifyError && e.code === 'EMPTY_PAYMENT');
  assert.throws(() => decodePaymentHeader('!!!not-base64!!!'), (e) => e instanceof VerifyError);
  const notJson = Buffer.from('hello').toString('base64');
  assert.throws(() => decodePaymentHeader(notJson), (e) => e.code === 'BAD_JSON');
});

test('toBaseUnits: integer math, no float drift', () => {
  assert.equal(toBaseUnits('0.001', 6).toString(), '1000');
  assert.equal(toBaseUnits('1.5', 6).toString(), '1500000');
  assert.equal(toBaseUnits('0.0000001', 6 + 1).toString(), '1');
  assert.throws(() => toBaseUnits('0.0000001', 6), RangeError);
});

test('resolveNetwork: name and CAIP-2 both resolve', () => {
  assert.equal(resolveNetwork('testnet').caip2, 'eip155:2368');
  assert.equal(resolveNetwork('eip155:2366').chainId, 2366);
  assert.throws(() => resolveNetwork('solana'), RangeError);
});

test('verifyProof: happy path returns ok with summary', () => {
  const r = verifyProof({ header: makeProof(), expectedNetwork: 'testnet', nowSec: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.summary.network, 'eip155:2368');
  assert.equal(r.summary.token, 'pieUSD');
  assert.equal(r.summary.signatureVerified, false); // local check never claims sig verified
});

test('verifyProof: rejects wrong version / scheme / network', () => {
  assert.throws(() => verifyProof({ header: makeProof({ x402Version: 1 }), nowSec: NOW }), (e) => e.code === 'BAD_VERSION');
  assert.throws(() => verifyProof({ header: makeProof({ scheme: 'upto' }), nowSec: NOW }), (e) => e.code === 'BAD_SCHEME');
  assert.throws(() => verifyProof({ header: makeProof({ network: 'eip155:2366' }), expectedNetwork: 'testnet', nowSec: NOW }), (e) => e.code === 'NETWORK_MISMATCH');
});

test('verifyProof: rejects malformed addresses, signature, nonce', () => {
  assert.throws(() => verifyProof({ header: makeProof({ authorization: { from: 'bad' } }), nowSec: NOW }), (e) => e.code === 'BAD_FROM');
  assert.throws(() => verifyProof({ header: makeProof({ payload: { signature: 'zzz' } }), nowSec: NOW }), (e) => e.code === 'BAD_SIGNATURE_SHAPE');
  assert.throws(() => verifyProof({ header: makeProof({ authorization: { nonce: '0x12' } }), nowSec: NOW }), (e) => e.code === 'BAD_NONCE');
});

test('verifyProof: wrong payee and insufficient amount', () => {
  assert.throws(() => verifyProof({ header: makeProof(), payTo: '0x' + '33'.repeat(20), nowSec: NOW }), (e) => e.code === 'WRONG_PAYEE');
  // value 100000 base units, min 0.2 with 6 decimals = 200000 -> insufficient
  assert.throws(() => verifyProof({ header: makeProof(), minAmount: '0.2', expectedNetwork: 'mainnet', nowSec: NOW }), (e) => e.code === 'NETWORK_MISMATCH');
});

test('verifyProof: expired / not-yet-valid / inverted window', () => {
  assert.throws(() => verifyProof({ header: makeProof({ authorization: { validBefore: String(NOW - 3600) } }), nowSec: NOW }), (e) => e.code === 'EXPIRED');
  assert.throws(() => verifyProof({ header: makeProof({ authorization: { validAfter: String(NOW + 3600) } }), nowSec: NOW }), (e) => e.code === 'NOT_YET_VALID');
  // Inverted but both inside the 60s skew window, so it reaches BAD_WINDOW.
  assert.throws(() => verifyProof({ header: makeProof({ authorization: { validAfter: String(NOW + 30), validBefore: String(NOW + 20) } }), nowSec: NOW }), (e) => e.code === 'BAD_WINDOW');
});

test('verifyProof: clock skew tolerance', () => {
  // 10s past validBefore but within 60s skew -> accepted
  const p = makeProof({ authorization: { validBefore: String(NOW - 10) } });
  assert.equal(verifyProof({ header: p, nowSec: NOW }).ok, true);
});
