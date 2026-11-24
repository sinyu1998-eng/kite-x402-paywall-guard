# kite-x402-paywall-guard

一个面向 **Kite AI 生态**的 x402 v2 支付凭证校验与结算守卫。以 CLI 和 HTTP 服务两种形态，接收原始的 `X-PAYMENT` 请求头，先在本地做零网络调用的**结构 / 策略校验**（挡掉畸形和越权 payload），再通过 Kite 的 x402 facilitator 完成**签名验证与链上结算**，确认付款后才放行付费资源。

它解决的具体问题：一个提供付费 API / 付费内容的小服务，想在每次请求里安全地收一笔稳定币微支付，但不想自己实现 EIP-712 验签、金额换算、时间窗校验和 facilitator 对接。本项目把这段"付款守卫"抽成一个独立、可复现、可测试的小工具。

## 与 Kite AI 的关系（代码级）

| 关联点 | 代码位置 | 说明 |
|---|---|---|
| Kite 网络 CAIP-2 | `src/networks.js` | 主网 `eip155:2366` / USDC.e(6位)；测试网 `eip155:2368` / pieUSD(18位)，与官方 Kite x402 模板一致 |
| x402 v2 契约 | `src/verify.js` | 校验 `x402Version=2`、`scheme=exact`、CAIP-2 网络、EIP-3009 授权结构 |
| Facilitator verify/settle | `src/facilitator.js` | 调用 Kite 生态 facilitator 的 `/v2/verify` 与 `/v2/settle` |
| Agent 付费场景 | `src/guard.js` | 供 AI Agent 调用付费 API 前完成机器可验证的付款流程 |

> **测试网与模拟数据说明**：默认网络为 Kite **测试网**，金额与 facilitator 调用需在真实环境配置 `PAY_TO`/`FACILITATOR_URL`。仓库**不含任何钱包私钥**；签名真实性由 facilitator 验证，本地只做结构校验。单元测试使用伪造的 fetch，不产生链上交易。

## 功能清单

- [x] `X-PAYMENT` 头（base64 JSON）解码与结构校验
- [x] x402 v2 / exact scheme / CAIP-2 网络匹配
- [x] EIP-3009 授权字段校验（地址、签名形状、nonce、金额、时间窗、时钟偏移）
- [x] 整数金额换算（BigInt，无浮点误差，兼容 6/18 位精度）
- [x] facilitator `/verify` 与 `/settle` 对接（可注入 fetch，超时控制）
- [x] 本地校验失败时**短路**，不浪费 facilitator 配额
- [x] 付费守卫 HTTP handler：未付款返回 402 challenge，付款成功放行
- [x] CLI：`verify` / `guard` / `selfcheck` 三个子命令
- [x] 零依赖交互演示（`npm run demo`）：402 → 放行 → 重放拦截全链路可点
- [x] GitHub Actions CI：Node 20 / 22 双版本自检 + 测试
- [x] 22 个单元/边界/演示测试

## 环境要求

- Node.js **>= 20**（内置 `fetch`、`node:test`，无需第三方运行时依赖）
- 无需 npm install（零生产依赖）

## 安装与启动

```sh
git clone https://github.com/sinyu1998-eng/kite-x402-paywall-guard.git
cd kite-x402-paywall-guard
node src/cli.js selfcheck        # 应输出 SELFCHECK OK
npm test                          # 22 个测试全部通过
```

启动 HTTP 服务（可选）：

```sh
cp .env.example .env
# 编辑 .env：填入你的 PAY_TO 收款地址和 PRICE_USD
node src/server.js
curl -i http://localhost:8080/healthz
curl -i http://localhost:8080/.well-known/x402
```

## 交互演示

想在浏览器里直观看到「未付款被挡 → 付款放行 → 重放被拒」，跑演示服务：

```sh
npm run demo
# → http://localhost:8081
```

页面提供四个按钮，对应完整链路：

| 步骤 | 动作 | 预期 |
|---|---|---|
| ① | 不带凭证请求付费接口 | `402 payment_required` |
| ② | 发起付款，签发凭证 | `200` + `xPaymentHeader` |
| ③ | 携带凭证再次请求 | `200` + 收据 |
| ④ | 重放同一凭证 | `402 replay_detected` |

> 演示链路是**模拟的**：凭证由 HMAC 自签，重放防护用进程内 nonce 集合，不产生任何链上转账。
> 生产验签与结算仍走 `src/facilitator.js`。边界说明与替换方法见 [docs/DEMO.md](docs/DEMO.md)。

## 配置示例

`.env`（完整说明见 `.env.example`）：

```env
KITE_NETWORK=testnet
PAY_TO=0xYourReceivingAddress
PRICE_USD=0.001
FACILITATOR_URL=https://facilitator.pieverse.io/v2
PORT=8080
```

## 使用示例

**CLI 本地校验**（不联网）：

```sh
node src/cli.js verify --header @payment.txt --min 0.001 --network testnet
```

**完整守卫**（本地校验 + facilitator 结算）：

```sh
node src/cli.js guard --header @payment.txt --min 0.001 --url https://facilitator.pieverse.io/v2
```

**HTTP 付费 API**：`GET /v1/premium`，带上 `X-PAYMENT` 头；未付款返回 402 + `x-payment-required`，付款成功返回 200 和结算收据。

## 已知限制

- 本地校验只检查**结构**，不验证签名密码学真实性——必须由 facilitator 完成，这是 x402 的设计分工。
- 默认 facilitator 地址为社区/官方模板示例值，生产环境请核对 Kite 官方最新地址。
- 不管理私钥、不广播交易，这些由 facilitator 和收款方钱包负责。

## 参考（配置数据来源，非复制实现）

- Kite 官方 x402 服务模板与社区实现 `BrKDDD/kite-x402-hono`（网络参数 / CAIP-2 / EIP-712 domain）
- x402 协议规范 v2；EIP-3009 TransferWithAuthorization

## License

MIT — 见 [LICENSE](LICENSE)。
