# 测试与部署文档

## 测试命令

```sh
npm test                          # 全部 17 个测试
node --test test/verify.test.js   # 仅校验逻辑
node --test test/guard.test.js    # 仅编排/结算
```

无需 `npm install`：使用 Node 内置 `node:test` 与 `node:assert`。

## 覆盖场景

**verify.test.js（校验与边界）**
- X-PAYMENT base64 解码 / 原始对象 / 空值 / 非法 base64 / 非法 JSON
- BigInt 金额换算（6 位、18 位、超精度拒绝）
- 网络解析（名称 / CAIP-2 / 未知网络）
- 正常路径返回 summary 且 `signatureVerified=false`
- 错误 version / scheme / network
- 畸形地址 / 签名形状 / nonce
- 错误收款方 / 金额不足
- 过期 / 未生效 / 时间窗倒置
- 时钟偏移容差

**guard.test.js（编排与结算）**
- facilitator `/settle` 调用与收据返回
- URL 不以 /v2 结尾被拒绝
- HTTP 错误上抛
- 本地失败短路（伪造 fetch 断言未被调用）
- 结算成功返回 receipt
- `--no-settle` 仅本地校验
- HTTP handler 的 402 / 200 映射

## 构建检查

```sh
node --check src/*.js             # 语法检查
node src/cli.js selfcheck         # 运行自检
```

## 部署步骤

1. 公开 GitHub 仓库，`git push` 后确认仓库为 public。
2. 服务器安装 Node.js 20+，`git clone`。
3. `cp .env.example .env`，填入 `PAY_TO`（真实收款地址）、`PRICE_USD`、`FACILITATOR_URL`。
4. `node src/server.js`，用 `curl /healthz` 验证。
5. 生产环境建议置于反向代理（HTTPS）之后；本地开发的 facilitator 示例地址仅用于测试网。

## 排障

| 现象 | 原因 / 处理 |
|---|---|
| `SELFCHECK OK` 但 fetch MISSING | Node < 18，升级 Node |
| 一直 402 `INSUFFICIENT` | 金额换算按 token 精度；确认 `minAmount` 与网络 decimals 匹配 |
| `NETWORK_MISMATCH` | payload 的 CAIP-2 与 `KITE_NETWORK` 不一致 |
| `HTTP_ERROR` from facilitator | 核对 facilitator URL、网络是否被支持、收款地址是否有效 |
| 测试网金额对不上 | 测试网 pieUSD 为 18 位精度，主网 USDC.e 为 6 位 |
