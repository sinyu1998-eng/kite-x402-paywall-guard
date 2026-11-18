/**
 * Kite x402 network registry.
 *
 * CAIP-2 ids and token metadata follow the official Kite x402 service
 * templates (see README "References"). Values are configuration data, not
 * copied implementation logic. Override via env if Kite publishes new values.
 */
export const KITE_NETWORKS = {
  mainnet: {
    caip2: 'eip155:2366',
    chainId: 2366,
    token: 'USDC.e',
    decimals: 6,
    domainName: 'Bridged USDC (Kite AI)',
    domainVersion: '2',
  },
  testnet: {
    caip2: 'eip155:2368',
    chainId: 2368,
    token: 'pieUSD',
    decimals: 18,
    domainName: 'pieUSD',
    domainVersion: '1',
  },
};

/** Resolve a network by name ("testnet") or CAIP-2 id ("eip155:2368"). */
export function resolveNetwork(input) {
  if (!input) return KITE_NETWORKS.testnet;
  if (KITE_NETWORKS[input]) return KITE_NETWORKS[input];
  const found = Object.values(KITE_NETWORKS).find((n) => n.caip2 === input);
  if (found) return found;
  throw new RangeError(`Unknown Kite network: ${input}`);
}

/** Convert a human decimal amount ("0.05") to base units using integer math. */
export function toBaseUnits(amount, decimals) {
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new TypeError('amount must be a string or number');
  }
  const raw = String(amount).trim().replace(/^\$/, '');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new TypeError(`invalid amount: ${amount}`);
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) {
    throw new RangeError(`amount ${raw} exceeds ${decimals} decimals`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}
