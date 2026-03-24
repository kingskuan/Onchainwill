// api/monitor.js — Daily cron job
// Triggered by Vercel Cron: every day at 09:00 UTC (see vercel.json)
// Also callable manually: GET /api/monitor?secret=CRON_SECRET

import crypto from 'crypto';

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const BGW_KEY    = process.env.BGW_API_KEY    || '6AE25C9BFEEC4D815097ECD54DDE36B9A1F2B069';
const BGW_SECRET = process.env.BGW_API_SECRET || 'C2638D162310C10D5DAFC8013871F2868E065040';
const BGW_BASE   = 'https://bopenapi.bgwapi.io';
const SOL_RPC    = 'https://api.mainnet-beta.solana.com';
const CRON_SECRET = process.env.CRON_SECRET || 'changeme';

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kv(method, ...args) {
  const res = await fetch(`${KV_URL}/${[method, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

// ── Bitget Wallet Skill — swap-send (broadcast pre-signed tx) ─────────────────
async function bgwSignature(apiPath, bodyStr, timestamp) {
  const content = { apiPath, body: bodyStr, 'x-api-key': BGW_KEY, 'x-api-timestamp': timestamp };
  const sorted  = Object.fromEntries(Object.keys(content).sort().map(k => [k, content[k]]));
  return crypto.createHmac('sha256', BGW_SECRET).update(JSON.stringify(sorted)).digest('base64');
}

async function broadcastTx(signedTxBase64) {
  // Attempt 1: Bitget Wallet Skill swap-send (MEV protection)
  try {
    const ts      = String(Date.now());
    const body    = JSON.stringify({ signedTransaction: signedTxBase64, chain: 'sol' });
    const sig     = await bgwSignature('/api/v1/swap/transaction/send', body, ts);
    const res = await fetch(`${BGW_BASE}/api/v1/swap/transaction/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': BGW_KEY, 'x-api-timestamp': ts, 'x-api-signature': sig },
      body,
    });
    const d = await res.json();
    if (d.code === '00000' && d.data?.txHash) {
      return { source: 'Bitget Wallet Skill', txHash: d.data.txHash };
    }
  } catch (e) { console.warn('BGW broadcast failed, falling back to RPC:', e.message); }

  // Fallback 2: Direct Solana RPC sendTransaction
  const res = await fetch(SOL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: [signedTxBase64, { encoding: 'base64', preflightCommitment: 'confirmed' }],
    }),
  });
  const d = await res.json();
  if (d.result) return { source: 'Solana RPC', txHash: d.result };
  throw new Error(d.error?.message || 'Broadcast failed');
}

// ── Solana: get last transaction timestamp for a wallet ───────────────────────
async function getLastActivity(address) {
  const res = await fetch(SOL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [address, { limit: 1 }] }),
  });
  const d = await res.json();
  const t = d.result?.[0]?.blockTime;
  return t ? new Date(t * 1000) : null;
}

// ── Main monitor logic ────────────────────────────────────────────────────────
async function monitorAll() {
  const results = { checked: 0, executed: 0, skipped: 0, errors: [] };

  // Get all active will wallet addresses
  const wallets = await kv('smembers', 'active_wills');
  if (!wallets || wallets.length === 0) {
    console.log('[Monitor] No active wills found.');
    return results;
  }

  console.log(`[Monitor] Checking ${wallets.length} active wills...`);

  for (const walletAddr of wallets) {
    try {
      const raw = await kv('get', `will:${walletAddr}`);
      if (!raw) { await kv('srem', 'active_wills', walletAddr); continue; }

      const will = JSON.parse(raw);
      if (will.status !== 'active') { results.skipped++; continue; }

      results.checked++;

      // Determine last activity: max of on-chain activity and manual heartbeat
      const onChainActivity = await getLastActivity(walletAddr);
      const heartbeat       = will.lastHeartbeat ? new Date(will.lastHeartbeat) : null;
      const lastActivity    = onChainActivity && heartbeat
        ? new Date(Math.max(onChainActivity.getTime(), heartbeat.getTime()))
        : onChainActivity || heartbeat || new Date(will.createdAt);

      const elapsedDays = (Date.now() - lastActivity.getTime()) / 86400000;
      console.log(`[Monitor] ${walletAddr.slice(0,8)}… elapsed: ${elapsedDays.toFixed(1)}d / threshold: ${will.days}d`);

      // Update last known activity in the will record
      will.lastChecked      = new Date().toISOString();
      will.lastActivityDate = lastActivity.toISOString();
      will.elapsedDays      = elapsedDays.toFixed(1);

      if (elapsedDays < will.days) {
        // Not yet triggered — just update the record
        await kv('set', `will:${walletAddr}`, JSON.stringify(will));
        results.skipped++;
        continue;
      }

      // ── THRESHOLD EXCEEDED — execute will ─────────────────────────────────
      console.log(`[Monitor] ⚡ EXECUTING will for ${walletAddr.slice(0,8)}…`);

      let txHash = null;
      let broadcastError = null;

      if (will.signedTx && will.signedTx.startsWith('TxBase64')) {
        // Demo mode: signedTx is a placeholder — log but don't actually broadcast
        txHash = 'DEMO_TX_' + Math.random().toString(36).slice(2,10).toUpperCase();
        console.log(`[Monitor] Demo mode — skipping real broadcast. Fake tx: ${txHash}`);
      } else {
        // Production: broadcast the real pre-signed transaction
        try {
          const result = await broadcastTx(will.signedTx);
          txHash = result.txHash;
          console.log(`[Monitor] ✓ Broadcast via ${result.source}: ${txHash}`);
        } catch (e) {
          broadcastError = e.message;
          console.error(`[Monitor] ✗ Broadcast failed: ${e.message}`);
        }
      }

      // Update will status
      will.status      = txHash ? 'executed' : 'broadcast_failed';
      will.executedAt  = new Date().toISOString();
      will.txHash      = txHash;
      will.broadcastError = broadcastError;

      await kv('set', `will:${walletAddr}`, JSON.stringify(will));

      if (txHash) {
        await kv('srem', 'active_wills', walletAddr);
        results.executed++;
      } else {
        results.errors.push({ wallet: walletAddr, error: broadcastError });
      }

    } catch (err) {
      console.error(`[Monitor] Error processing ${walletAddr}:`, err.message);
      results.errors.push({ wallet: walletAddr, error: err.message });
    }
  }

  console.log('[Monitor] Done:', results);
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Auth: Vercel Cron sends Authorization header, manual calls need ?secret=
  const authHeader = req.headers.authorization;
  const querySecret = req.query.secret;

  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManual     = querySecret === CRON_SECRET;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = await monitorAll();
    res.status(200).json({ ok: true, timestamp: new Date().toISOString(), ...results });
  } catch (err) {
    console.error('[Monitor] Fatal error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
