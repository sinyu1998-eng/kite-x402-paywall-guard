# Changelog

All notable changes to this project are documented here. Format follows Keep a Changelog.

## [0.1.0] - 2026-11-19

### Added
- Initial public release for KiteAI 第二期 任务二（原创生态项目）。
- `networks.js`: Kite mainnet/testnet registry (CAIP-2, token decimals) and BigInt amount conversion.
- `verify.js`: X-PAYMENT base64 decoding and off-chain structural/policy verification of x402 v2 EIP-3009 proofs.
- `facilitator.js`: injectable-fetch client for facilitator `/v2/verify` and `/v2/settle`.
- `guard.js`: end-to-end guard orchestration with local short-circuit and HTTP handler factory.
- `cli.js`: `verify` / `guard` / `selfcheck` commands.
- `server.js`: minimal HTTP service with `/healthz`, `/.well-known/x402`, `/v1/premium`.
- Test suite: 17 passing unit/boundary tests.
- Docs: README, ARCHITECTURE, API, TESTING, .env.example, LICENSE.

### Notes
- No wallet private keys included. Testnet by default.
- Signature authenticity is delegated to the facilitator by x402 design.
