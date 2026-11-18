import { KITE_NETWORKS, resolveNetwork, toBaseUnits } from './networks.js';

export class VerifyError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'VerifyError';
    this.code = code;
    this.detail = detail;
  }
}

const isAddr = (v) => typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);

/**
 * Decode the raw `X-PAYMENT` header value (base64 of a JSON object) into a
 * structured x402 v2 payment payload. Accepts a plain object too, for tests.
 */
export function decodePaymentHeader(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new VerifyError('EMPTY_PAYMENT', 'X-PAYMENT header is missing or empty');
  }
  let json;
  try {
    json = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw new VerifyError('BAD_BASE64', 'X-PAYMENT is not valid base64');
  }
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new VerifyError('BAD_JSON', 'decoded X-PAYMENT is not JSON');
  }
  if (!obj || typeof obj !== 'object') {
    throw new VerifyError('BAD_SHAPE', 'payment payload is not an object');
  }
  return obj;
}

/**
 * Perform OFF-CHAIN structural / policy validation of an x402 v2 proof.
 * This does NOT verify the EIP-712 signature — that is the facilitator's job
 * (see facilitator.js). It catches malformed or unauthorised payloads early
 * without any network call, so a malicious buyer cannot burn facilitator quota.
 *
 * @param {object} opts
 * @param {string|object} opts.header      raw X-PAYMENT header or decoded object
 * @param {string} opts.expectedNetwork    "testnet" | "mainnet" | CAIP-2 id
 * @param {string} opts.payTo              expected recipient address
 * @param {string} opts.minAmount          minimum price, e.g. "0.001"
 * @param {number} [opts.nowSec]           injectable clock (seconds) for tests
 * @param {number} [opts.clockSkewSec]     tolerated clock skew, default 60
 * @returns {{ok:true, summary:object, decoded:object}}
 */
export function verifyProof(opts = {}) {
  const {
    header,
    expectedNetwork = 'testnet',
    payTo,
    minAmount,
    nowSec = Math.floor(Date.now() / 1000),
    clockSkewSec = 60,
  } = opts;

  const net = resolveNetwork(expectedNetwork);
  const p = decodePaymentHeader(header);

  if (p.x402Version !== 2) {
    throw new VerifyError('BAD_VERSION', `expected x402Version 2, got ${p.x402Version}`);
  }
  if (p.scheme !== 'exact') {
    throw new VerifyError('BAD_SCHEME', `expected scheme "exact", got ${p.scheme}`);
  }
  if (p.network !== net.caip2) {
    throw new VerifyError('NETWORK_MISMATCH', `expected ${net.caip2}, got ${p.network}`);
  }

  const payload = p.payload;
  if (!payload || typeof payload !== 'object') {
    throw new VerifyError('NO_PAYLOAD', 'payload object is missing');
  }
  const auth = payload.authorization;
  if (!auth || typeof auth !== 'object') {
    throw new VerifyError('NO_AUTH', 'payload.authorization is missing');
  }
  if (!isAddr(auth.from)) throw new VerifyError('BAD_FROM', 'authorization.from is not an address');
  if (!isAddr(auth.to)) throw new VerifyError('BAD_TO', 'authorization.to is not an address');
  if (!/^0x[0-9a-fA-F]+$/.test(payload.signature || '')) {
    throw new VerifyError('BAD_SIGNATURE_SHAPE', 'payload.signature is not hex');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(auth.nonce || '')) {
    throw new VerifyError('BAD_NONCE', 'authorization.nonce is not bytes32');
  }
  if (payTo && auth.to.toLowerCase() !== payTo.toLowerCase()) {
    throw new VerifyError('WRONG_PAYEE', `payment is for ${auth.to}, expected ${payTo}`);
  }

  const value = BigInt(auth.value || '0');
  if (value <= 0n) throw new VerifyError('ZERO_VALUE', 'authorization.value must be positive');
  if (minAmount !== undefined) {
    const required = toBaseUnits(minAmount, net.decimals);
    if (value < required) {
      throw new VerifyError('INSUFFICIENT', `value ${value} < required ${required} base units`);
    }
  }

  const validAfter = BigInt(auth.validAfter || '0');
  const validBefore = BigInt(auth.validBefore || '0');
  const now = BigInt(nowSec);
  if (validAfter > now + BigInt(clockSkewSec)) {
    throw new VerifyError('NOT_YET_VALID', 'validAfter is in the future');
  }
  if (validBefore < now - BigInt(clockSkewSec)) {
    throw new VerifyError('EXPIRED', 'validBefore has passed');
  }
  if (validAfter >= validBefore) {
    throw new VerifyError('BAD_WINDOW', 'validAfter must be before validBefore');
  }

  return {
    ok: true,
    summary: {
      network: p.network,
      token: net.token,
      from: auth.from,
      to: auth.to,
      valueBaseUnits: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      // Local checks passed; signature authenticity still requires facilitator.
      signatureVerified: false,
    },
    decoded: p,
  };
}
