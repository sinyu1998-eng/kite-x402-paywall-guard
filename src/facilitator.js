/**
 * Thin client for a Kite x402 facilitator (v2). The facilitator performs the
 * real EIP-712 signature check and (on settle) broadcasts the transfer on Kite.
 * We inject `fetchImpl` so tests never touch the network.
 */
export class FacilitatorError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = 'FacilitatorError';
    this.code = code;
    this.detail = detail;
  }
}

const DEFAULT_URL = 'https://facilitator.pieverse.io/v2';

function normalizeUrl(url) {
  const u = String(url || DEFAULT_URL).replace(/\/+$/, '');
  if (!u.endsWith('/v2')) throw new FacilitatorError('BAD_URL', 'facilitator URL must end with /v2');
  return u;
}

async function post(path, body, { facilitatorUrl, fetchImpl, timeoutMs = 15000 }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new FacilitatorError('NO_FETCH', 'no fetch implementation available');
  }
  const endpoint = `${normalizeUrl(facilitatorUrl)}${path}`; // validate URL before network try/catch
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    throw new FacilitatorError('NETWORK', String(e && e.message ? e.message : e));
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new FacilitatorError('BAD_RESPONSE', `HTTP ${res.status} returned non-JSON`);
  }
  if (!res.ok) {
    throw new FacilitatorError('HTTP_ERROR', `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

/** Ask the facilitator to verify the payment signature (no settlement). */
export function verifyWithFacilitator(paymentPayload, opts = {}) {
  return post('/verify', { x402Version: 2, paymentPayload: normalizePayload(paymentPayload), paymentRequirements: opts.paymentRequirements }, opts);
}

/** Verify + settle the payment on-chain, returning a settlement receipt. */
export function settleProof(paymentPayload, opts = {}) {
  return post('/settle', { x402Version: 2, paymentPayload: normalizePayload(paymentPayload), paymentRequirements: opts.paymentRequirements }, opts);
}

function normalizePayload(p) {
  // Callers may pass the full X-PAYMENT object or the inner payload.
  return p && p.x402Version !== undefined ? p : p;
}
