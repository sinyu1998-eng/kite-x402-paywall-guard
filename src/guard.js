import { verifyProof, VerifyError } from './verify.js';
import { settleProof, FacilitatorError } from './facilitator.js';

/**
 * The full paywall guard: local structural check -> facilitator settle.
 * Returns a discriminated result instead of throwing, so callers can map it
 * cleanly to HTTP 402 / 200.
 */
export async function guardPayment(opts = {}) {
  const {
    header,
    expectedNetwork = 'testnet',
    payTo,
    minAmount,
    facilitatorUrl,
    fetchImpl,
    nowSec,
    paymentRequirements,
    settle = true,
  } = opts;

  // Step 1: free, offline validation.
  let local;
  try {
    local = verifyProof({ header, expectedNetwork, payTo, minAmount, nowSec });
  } catch (e) {
    if (e instanceof VerifyError) {
      return { ok: false, stage: 'local', code: e.code, message: e.detail };
    }
    throw e;
  }

  // Step 2: settle through the facilitator (signature check + on-chain transfer).
  if (settle) {
    try {
      const receipt = await settleProof(local.decoded, {
        facilitatorUrl,
        fetchImpl,
        paymentRequirements,
      });
      return {
        ok: true,
        stage: 'settled',
        summary: local.summary,
        settlement: receipt,
      };
    } catch (e) {
      if (e instanceof FacilitatorError) {
        return { ok: false, stage: 'facilitator', code: e.code, message: e.detail };
      }
      throw e;
    }
  }

  return { ok: true, stage: 'local-only', summary: local.summary };
}

/**
 * HTTP handler factory. Wraps a paid action. On success calls `onPaid(req, result)`
 * and returns its result; otherwise returns a 402 challenge.
 */
export function createGuardHandler({ onPaid, ...guardOpts }) {
  return async function handler(req) {
    const header = req.headers['x-payment'] || req.headers['X-PAYMENT'];
    const result = await guardPayment({ ...guardOpts, header });
    if (!result.ok) {
      return {
        status: 402,
        body: {
          error: 'PAYMENT_REQUIRED',
          stage: result.stage,
          code: result.code,
          message: result.message,
          accepts: guardOpts.paymentRequirements || [],
        },
      };
    }
    const body = onPaid ? await onPaid(req, result) : { ok: true, receipt: result.settlement };
    return { status: 200, body };
  };
}
