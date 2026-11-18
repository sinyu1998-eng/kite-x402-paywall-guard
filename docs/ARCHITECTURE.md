# 架构与开发文档

## 目录结构

```
kite-x402-paywall-guard/
├── src/
│   ├── index.js        公开 API 出口
│   ├── networks.js     Kite 网络注册表 + 整数金额换算
│   ├── verify.js       X-PAYMENT 解码 + 本地结构/策略校验（纯函数、零网络）
│   ├── facilitator.js  facilitator /v2 verify & settle 客户端（fetch 可注入）
│   ├── guard.js        编排：本地校验 -> 结算；HTTP handler 工厂
│   ├── cli.js          CLI 入口
│   └── server.js       内置 http 服务示例
├── test/
│   ├── verify.test.js  校验逻辑与边界测试
│   └── guard.test.js   编排、结算、HTTP handler 测试（伪造 fetch）
├── docs/               本目录
├── .env.example
├── CHANGELOG.md
├── LICENSE
└── README.md
```

## 模块职责

- **networks.js**：唯一的网络参数来源。`resolveNetwork` 接受名称或 CAIP-2；`toBaseUnits` 用 BigInt 做定点换算，避免 JS 浮点误差。
- **verify.js**：无副作用校验。`decodePaymentHeader` 把 base64 头还原成对象；`verifyProof` 逐项断言，任何一项失败抛带 `code` 的 `VerifyError`。可注入 `nowSec` 便于确定性测试。
- **facilitator.js**：把支付 payload 送到 facilitator 的 `/verify` 或 `/settle`。URL 必须以 `/v2` 结尾（x402 v2 契约）。`fetchImpl` 依赖注入让测试离线。
- **guard.js**：业务编排。本地失败直接短路（省 facilitator 配额）；成功才结算。`createGuardHandler` 把结果映射成 HTTP 402 / 200。
- **cli.js / server.js**：两种交付形态，复用同一套核心 API。

## 关键流程

```
请求带 X-PAYMENT
      │
      ▼
decodePaymentHeader ── 失败 → 402 (BAD_BASE64/BAD_JSON/...)
      │
      ▼
verifyProof（本地、零网络）
  结构 / 网络 / 收款方 / 金额 / 时间窗
      │ 失败 → 402 (stage=local, 不调用 facilitator)
      ▼
facilitator /settle（签名验真 + 链上转账）
      │ 失败 → 402 (stage=facilitator)
      ▼
200 + 结算收据 + 放行付费资源
```

## 本地开发

```sh
npm test                       # node --test，无需安装依赖
node src/cli.js selfcheck
node src/cli.js verify --header "<base64>" --min 0.001
PORT=8080 node src/server.js
```

设计原则：核心逻辑保持纯函数 + 依赖注入，所有网络 I/O 集中在 facilitator.js，便于离线测试与安全审计。
