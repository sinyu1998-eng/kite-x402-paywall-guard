# 接口与使用文档

## CLI

### `x402-guard verify`
本地结构校验，不联网。退出码 0=通过，1=失败。

| 参数 | 说明 | 默认 |
|---|---|---|
| `--header <base64\|@file>` | X-PAYMENT 头。`@file` 从文件读 | 必填 |
| `--network <name\|caip2>` | testnet/mainnet 或 CAIP-2 | testnet |
| `--pay-to <0x...>` | 期望收款地址 | 不限 |
| `--min <amount>` | 最低价，如 0.001 | 不限 |

输出：`{ "ok": true, "summary": {...} }` 或 `{ "ok": false, "code": "...", "message": "..." }`。

### `x402-guard guard`
本地校验 + facilitator 结算。退出码 0=通过，2=付款失败。

| 参数 | 说明 |
|---|---|
| `--header`, `--network`, `--pay-to`, `--min` | 同上 |
| `--url <facilitator>` | facilitator 基址（须以 `/v2` 结尾） |
| `--no-settle` | 只做本地校验 |

### `x402-guard selfcheck`
打印 node 版本、已注册网络、fetch 可用性。

## HTTP 服务

| 方法 | 路径 | 返回 | 说明 |
|---|---|---|---|
| GET | `/healthz` | 200 `{ok,network,token}` | 存活检查，不连 facilitator |
| GET | `/.well-known/x402` | 200 `{x402Version,accepts}` | 支付能力/价格发现，供 Agent 读取 |
| GET | `/v1/premium` | 200 或 402 | 付费资源；需 `X-PAYMENT` 头 |
| * | 其它 | 404 `{error:"NOT_FOUND"}` | — |

### 402 挑战响应

```json
{
  "error": "PAYMENT_REQUIRED",
  "stage": "local | facilitator",
  "code": "INSUFFICIENT",
  "message": "...",
  "accepts": [{ "scheme": "exact", "network": "eip155:2368", "asset": "pieUSD", "amount": "0.001", "payTo": "0x..." }]
}
```

同时返回响应头 `x-payment-required`（base64 的 x402 挑战对象）。

## 错误码

| 阶段 | code | 含义 |
|---|---|---|
| 本地 | `EMPTY_PAYMENT` / `BAD_BASE64` / `BAD_JSON` / `BAD_SHAPE` | 头缺失或解码失败 |
| 本地 | `BAD_VERSION` / `BAD_SCHEME` / `NETWORK_MISMATCH` | x402 契约不匹配 |
| 本地 | `NO_PAYLOAD` / `NO_AUTH` / `BAD_FROM` / `BAD_TO` / `BAD_SIGNATURE_SHAPE` / `BAD_NONCE` | EIP-3009 结构错误 |
| 本地 | `WRONG_PAYEE` / `ZERO_VALUE` / `INSUFFICIENT` | 收款方或金额不符 |
| 本地 | `EXPIRED` / `NOT_YET_VALID` / `BAD_WINDOW` | 时间窗无效 |
| facilitator | `BAD_URL` / `NO_FETCH` / `NETWORK` / `BAD_RESPONSE` / `HTTP_ERROR` | 结算链路错误 |

## 库调用

```js
import { guardPayment, verifyProof, settleProof } from 'kite-x402-paywall-guard';

const result = await guardPayment({
  header: req.headers['x-payment'],
  expectedNetwork: 'testnet',
  payTo: process.env.PAY_TO,
  minAmount: '0.001',
  facilitatorUrl: process.env.FACILITATOR_URL,
});
if (!result.ok) return send402(result);
return send200(result.settlement);
```
