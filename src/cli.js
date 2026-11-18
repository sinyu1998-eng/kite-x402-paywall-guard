#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { verifyProof } from './verify.js';
import { guardPayment } from './guard.js';

function usage() {
  return `kite-x402-paywall-guard — verify x402 v2 payment proofs for Kite AI

Usage:
  x402-guard verify --header <base64|@file> [--network testnet|mainnet] [--pay-to 0x..] [--min 0.001]
  x402-guard guard  --header <base64|@file> [--min 0.001] [--url <facilitator>] [--no-settle]
  x402-guard selfcheck

Global:
  --network   Kite network, name or CAIP-2 id (default: testnet = eip155:2368)
  --pay-to    expected recipient address (else any valid address accepted)
  --min       minimum price in token units (e.g. 0.001)
  --url       facilitator base URL ending in /v2
  --no-settle only run local checks, skip facilitator settle

Examples:
  x402-guard selfcheck
  x402-guard verify --header @payment.txt --min 0.001 --network testnet
`;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'no-settle') { out.settle = false; continue; }
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) { out[key] = true; continue; }
      out[key] = val; i++;
    } else out._.push(a);
  }
  return out;
}

function readHeader(v) {
  if (!v || v === true) return '';
  if (v.startsWith('@')) return readFileSync(v.slice(1), 'utf8').trim();
  return v;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === '--help' || cmd === '-h') { process.stdout.write(usage()); return; }

  if (cmd === 'selfcheck') {
    const net = await import('./networks.js');
    console.log('node:', process.version);
    console.log('networks:', Object.values(net.KITE_NETWORKS).map((n) => `${n.name || n.caip2}`).join(', '));
    console.log('fetch:', typeof globalThis.fetch === 'function' ? 'available' : 'MISSING');
    console.log('SELFCHECK OK');
    return;
  }

  const header = readHeader(args.header);
  const common = {
    header,
    expectedNetwork: args.network || 'testnet',
    payTo: typeof args['pay-to'] === 'string' ? args['pay-to'] : undefined,
    minAmount: typeof args.min === 'string' ? args.min : undefined,
  };

  if (cmd === 'verify') {
    try {
      const r = verifyProof(common);
      console.log(JSON.stringify({ ok: true, summary: r.summary }, null, 2));
    } catch (e) {
      console.error(JSON.stringify({ ok: false, code: e.code || 'ERROR', message: e.message }, null, 2));
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === 'guard') {
    const r = await guardPayment({
      ...common,
      facilitatorUrl: typeof args.url === 'string' ? args.url : undefined,
      settle: args.settle !== false,
    });
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 2;
    return;
  }

  process.stderr.write(`unknown command: ${cmd}\n\n${usage()}`);
  process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
