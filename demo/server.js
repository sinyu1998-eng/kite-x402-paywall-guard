/**
 * x402 Paywall Guard · 演示服务（零依赖）
 *
 * 用途：让 demo/public/index.html 能真正跑起来，走完
 *   ① 无凭证 → 402  ② 签发凭证  ③ 携带凭证 → 200  ④ 重放 → 拒绝
 *
 * ⚠️ 这是一条**模拟链路**：
 *   - 凭证用 HMAC-SHA256 自签，不是链上 EIP-3009 签名
 *   - 去重靠进程内 nonce 集合，不是链上 nonce
 *   - 不发生任何真实转账
 * 真实的验签 + 结算走 src/guard.js → src/facilitator.js，请勿用本文件替代生产逻辑。
 */
import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, 'public', 'index.html');

// 每次启动重新生成，凭证不可跨进程复用
const SECRET = randomBytes(32);
const TTL_SECONDS = 300;

/** 演示用的付费商品 */
const CATALOG = [
  { sku: 'quota-pack', name: '智能体调用额度包', price: '9.90', asset: 'USDC' },
  { sku: 'statement', name: '链上结算对账单', price: '19.90', asset: 'USDC' },
  { sku: 'gateway', name: 'API 网关加速通道', price: '29.90', asset: 'USDC' },
];

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payloadB64) {
  return b64u(createHmac('sha256', SECRET).update(payloadB64).digest());
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 签发一张演示凭证 */
function issueProof(amount = '9.90') {
  const payload = {
    v: 1,
    id: `pay_${randomUUID().slice(0, 8)}`,
    amount,
    asset: 'USDC',
    nonce: b64u(randomBytes(12)),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const payloadB64 = b64u(JSON.stringify(payload));
  return { token: `v1.${payloadB64}.${sign(payloadB64)}`, payload };
}

/**
 * 校验凭证。返回 { ok, code, payload }
 * 失败原因：malformed / bad_signature / expired / replay_detected
 */
function verifyProof(token, usedNonces) {
  if (typeof token !== 'string') return { ok: false, code: 'malformed' };

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, code: 'malformed' };

  const [, payloadB64, sig] = parts;
  if (!safeEqual(sig, sign(payloadB64))) return { ok: false, code: 'bad_signature' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'malformed' };
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, code: 'expired' };
  }
  if (usedNonces.has(payload.nonce)) {
    return { ok: false, code: 'replay_detected' };
  }
  return { ok: true, code: 'ok', payload };
}

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-demo-mode': 'simulated',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

export function createDemoServer() {
  const usedNonces = new Set();
  const receipts = [];

  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    // ---------- 静态页 ----------
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      try {
        const html = await readFile(INDEX);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
      } catch {
        send(res, 500, { error: 'index_not_found' });
      }
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ---------- ② 签发付款凭证 ----------
    if (pathname === '/api/pay' && req.method === 'POST') {
      const { token, payload } = issueProof();
      send(res, 200, {
        ok: true,
        xPaymentHeader: token,
        payment: { id: payload.id, amount: payload.amount, asset: payload.asset, exp: payload.exp },
        note: '演示凭证：HMAC 自签，未发生链上转账',
      });
      return;
    }

    // ---------- ① ③ ④ 访问付费资源 ----------
    if (pathname === '/api/premium' && req.method === 'GET') {
      const token = req.headers['x-payment'];

      if (!token) {
        send(res, 402, {
          error: 'payment_required',
          accepts: CATALOG.map((c) => ({ scheme: 'exact', network: 'eip155:2368', amount: c.price, asset: c.asset, sku: c.sku })),
        });
        return;
      }

      const check = verifyProof(token, usedNonces);
      if (!check.ok) {
        // 重放与其它失败都返回 402，便于前端区分
        send(res, 402, {
          error: check.code,
          hint: check.code === 'replay_detected' ? '该凭证已被消费，需重新付款' : undefined,
        });
        return;
      }

      usedNonces.add(check.payload.nonce);
      const receipt = {
        id: `rcpt_${randomUUID().slice(0, 8)}`,
        paymentId: check.payload.id,
        amount: check.payload.amount,
        asset: check.payload.asset,
        paidAt: new Date().toISOString(),
      };
      receipts.unshift(receipt);

      send(res, 200, {
        ok: true,
        data: { message: 'payment accepted', items: CATALOG },
        receipt,
      });
      return;
    }

    // ---------- 收据列表 ----------
    if (pathname === '/api/receipts' && req.method === 'GET') {
      send(res, 200, { ok: true, count: receipts.length, receipts });
      return;
    }

    send(res, 404, { error: 'NOT_FOUND' });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.DEMO_PORT || 8081);
  createDemoServer().listen(port, () => {
    console.log(`[demo] http://localhost:${port}`);
    console.log('[demo] 模拟链路：HMAC 自签 + 进程内 nonce 去重，无真实链上转账');
  });
}

export { verifyProof, issueProof, CATALOG };
