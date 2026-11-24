# 演示说明（demo/）

`demo/` 提供一个**零依赖、可本地一键运行**的交互演示，用来直观展示 x402 付费守卫的核心行为：
未付款被挡、付款后放行、同一张凭证不能再用第二次。

它同时回答一个常见疑问：**「这个守卫在真实请求里到底长什么样？」**
看代码是一回事，点四下按钮看到 402 → 200 → 402 是另一回事。

```sh
npm run demo
# → http://localhost:8081
```

打开页面后依次点击 ①②③④，右侧日志会打印每次请求的状态码与响应体。

---

## 1. 四步链路

| 步骤 | 请求 | 预期 | 说明 |
|---|---|---|---|
| ① 直接请求 | `GET /api/premium`（无 `X-PAYMENT`） | `402 payment_required` | 返回 `accepts` 报价列表 |
| ② 发起付款 | `POST /api/pay` | `200` + `xPaymentHeader` | 签发一张带 nonce 的凭证 |
| ③ 付费后访问 | `GET /api/premium` + `X-PAYMENT` | `200` + 收据 | 凭证被标记为已消费 |
| ④ 重放攻击 | 再发一次同样的 `X-PAYMENT` | `402 replay_detected` | 不产生第二条收据 |

## 2. 接口契约

### `GET /api/premium`

| 情况 | 状态码 | 响应体关键字段 |
|---|---|---|
| 无凭证 | 402 | `error: "payment_required"`、`accepts[]` |
| 凭证有效 | 200 | `ok: true`、`data.items[]`、`receipt.{id,amount,paidAt}` |
| 凭证过期 | 402 | `error: "expired"` |
| 凭证重放 | 402 | `error: "replay_detected"`、`hint` |
| 签名不符 | 402 | `error: "bad_signature"` |
| 格式错误 | 402 | `error: "malformed"` |

### `POST /api/pay`

请求体可为空。响应：

```json
{
  "ok": true,
  "xPaymentHeader": "v1.<payload>.<signature>",
  "payment": { "id": "pay_xxx", "amount": "9.90", "asset": "USDC", "exp": 1764000000 },
  "note": "演示凭证：HMAC 自签，未发生链上转账"
}
```

凭证结构：`v1.<base64url(payload)>.<base64url(hmac_sha256)>`

### `GET /api/receipts`

返回内存中的收据列表，用于验证「重放不会重复入账」。

### 其它

| 路径 | 说明 |
|---|---|
| `GET /` | 演示页面 |
| `GET /favicon.ico` | `204` |

所有响应都带 `x-demo-mode: simulated` 头，便于在浏览器 Network 面板里一眼分辨。

---

## 3. 模拟边界（重要）

这个 demo **不是**生产实现，两者刻意分开：

| 环节 | demo（本目录） | 生产（`src/`） |
|---|---|---|
| 凭证来源 | `crypto.randomBytes` + HMAC 自签 | 客户端钱包用 EIP-3009 签名 |
| 签名校验 | `timingSafeEqual` 比 HMAC | facilitator `/v2/verify` 做链上密码学校验 |
| 重放防护 | 进程内 `Set<nonce>`，重启即清空 | 链上 nonce + facilitator 结算 |
| 结算 | 无 | facilitator `/v2/settle` |
| 网络 | 不联网 | Kite 主网 / 测试网 |

因此：

- ✅ demo 用来验证**交互与状态机**是否正确
- ❌ demo 不能用来验证**资金安全**
- 生产接入请走 `src/guard.js` → `src/facilitator.js`，配置 `PAY_TO` 与 `FACILITATOR_URL`

进程重启后 nonce 集合清空、旧凭证可被再次使用——这是**已知的、有意的**简化，不要照搬到生产。

## 4. 换成真实链路的改法

把 `demo/server.js` 里的 `verifyProof()` 替换为 `guard.js` 的 `guardPayment()` 即可，
其余路由与前端无需改动：

```js
import { guardPayment } from '../src/guard.js';

const out = await guardPayment(req, {
  expectedNetwork: 'testnet',
  payTo: process.env.PAY_TO,
  minAmount: '0.001',
  facilitatorUrl: process.env.FACILITATOR_URL,
  paymentRequirements,
});
```

`guardPayment` 会先在本地做结构校验（畸形 payload 直接短路，不消耗 facilitator 配额），
再交给 facilitator 验签与结算。

## 5. 测试覆盖

`test/demo.test.js` 在随机端口起真实 HTTP 服务，覆盖：

- 无凭证 → 402，且 `accepts` 非空
- 签发 → 携带 → 200，收据金额与 id 正确
- 同一凭证重放 → 402 `replay_detected`，收据数仍为 1
- 伪造签名 → 402 `bad_signature`
- 畸形凭证 → 402 `malformed`
- 根路径返回 HTML

```sh
npm test
```
