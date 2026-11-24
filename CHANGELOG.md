# Changelog

All notable changes to this project are documented here. Format follows Keep a Changelog.

## [0.2.0] - 2026-11-25

### Added
- `demo/`：零依赖交互演示服务，补齐此前缺失的 `/api/premium`、`/api/pay`、`/api/receipts` 三条路由，
  使演示页面可真正跑通「无凭证 402 → 签发 → 放行 200 → 重放 402」四步链路。
- `demo/public/index.html`：演示页面纳入仓库（此前游离在仓库外，无后端可用）。
- `test/demo.test.js`：5 个端到端测试，随机端口起真实 HTTP 服务，覆盖放行、重放、伪造签名、畸形凭证与静态页。
- `.github/workflows/ci.yml`：Node 20 / 22 双版本 CI，执行 `selfcheck` + `npm test`。
- `docs/DEMO.md`：演示说明、接口契约、模拟边界对照表、替换为真实 facilitator 的改法。
- `.gitignore`：排除 `node_modules`、`.env*`、编辑器目录。

### Changed
- `package.json`：版本 0.1.0 → 0.2.0；新增 `npm run demo` 脚本。
- README：新增「交互演示」章节，功能清单与测试数量同步更新。

### Notes
- 演示链路为模拟：HMAC 自签 + 进程内 nonce 去重，不产生链上转账；
  生产验签与结算仍由 `src/facilitator.js` 完成，两者刻意分离。

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
