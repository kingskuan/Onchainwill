// Bitget Wallet Skill API — server-side client
// Ref: https://web3.bitget.com/en/docs/authentication
// Maps to bitget-wallet-skill commands: token-price, security, swap-send

import crypto from 'crypto';

const BASE       = 'https://bopenapi.bgwapi.io';
const API_KEY    = process.env.BGW_API_KEY    || '6AE25C9BFEEC4D815097ECD54DDE36B9A1F2B069';
const API_SECRET = process.env.BGW_API_SECRET || 'C2638D162310C10D5DAFC8013871F2868E065040';

function sign(apiPath, bodyStr, timestamp, query = {}) {
  const obj = {
    apiPath, body: bodyStr,
    'x-api-key': API_KEY, 'x-api-timestamp': timestamp,
    ...Object.fromEntries(Object.entries(query).map(([k,v]) => [k, String(v)])),
  };
  const sorted  = Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));
  const payload = JSON.stringify(sorted);
  return crypto.createHmac('sha256', API_SECRET).update(payload).digest('base64');
}

async function call(path, body = {}) {
  const ts  = String(Date.now());
  const str = JSON.stringify(body);
  const sig = sign(path, str, ts);
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       API_KEY,
      'x-api-timestamp': ts,
      'x-api-signature': sig,
    },
    body: str,
  });
  if (!res.ok) throw new Error(`BGW ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Get SOL price. Falls back to CoinGecko if BGW fails. */
export async function getTokenPrice(chain = 'sol', contractAddress = '') {
  try {
    const d = await call('/api/v1/market/tokenPrice', { chain, contractAddress });
    const raw = d?.data?.price ?? d?.data?.data?.[0]?.price ?? d?.data?.list?.[0]?.price;
    if (raw) return {
      price:  parseFloat(raw),
      change: parseFloat(d?.data?.change24h ?? d?.data?.data?.[0]?.change24h ?? 0),
      source: 'Bitget Wallet Skill',
    };
  } catch (e) { console.warn('[BGW] price failed:', e.message); }

  // CoinGecko fallback
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true');
    const d = await r.json();
    if (d?.solana?.usd) return {
      price:  d.solana.usd,
      change: +(d.solana.usd_24h_change ?? 0).toFixed(2),
      source: 'CoinGecko',
    };
  } catch {}

  return { price: 132.47, change: 0, source: 'fallback' };
}

/** Security audit on a Solana address (beneficiary check). */
export async function securityAudit(chain = 'sol', contractAddress) {
  try {
    const d = await call('/api/v1/token/security', { chain, contractAddress });
    return {
      riskLevel:   d?.data?.riskLevel ?? (d?.data?.isHoneypot ? 'high' : 'low'),
      isHoneypot:  !!d?.data?.isHoneypot,
      hasBlacklist:!!d?.data?.hasBlacklist,
      ok: true,
    };
  } catch (e) {
    return { riskLevel: 'unknown', isHoneypot: false, hasBlacklist: false, ok: false, error: e.message };
  }
}

/** Broadcast a pre-signed Solana transaction. */
export async function swapSend(signedTxBase64) {
  const d = await call('/api/v1/swap/send', { signedTx: signedTxBase64 });
  return { txHash: d?.data?.txHash ?? d?.data?.hash, status: d?.data?.status ?? 'submitted' };
}
