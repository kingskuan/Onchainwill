// api/will.js — Will CRUD via Vercel KV
// Vercel KV is a Redis-compatible store. Free tier: 256MB, 30k requests/month.
// Setup: vercel.com → your project → Storage → Create KV Database → Link to project
// This auto-injects KV_REST_API_URL and KV_REST_API_TOKEN env vars.

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(method, ...args) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Vercel KV not configured. See README for setup.');
  const res = await fetch(`${KV_URL}/${[method, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

// Will schema:
// {
//   id: string,           wallet address (owner)
//   beneficiary: string,  recipient wallet address
//   days: number,         inactivity threshold in days
//   amount: number,       SOL amount to transfer
//   memo: string,
//   signedTx: string,     base64-encoded serialized Solana transaction
//   createdAt: string,    ISO timestamp
//   lastHeartbeat: string, ISO timestamp (updated on "I'm alive" or on-chain activity)
//   status: 'active' | 'executed' | 'cancelled'
// }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { method } = req;
  const walletAddr = req.query.wallet || req.body?.wallet;

  try {
    // ── GET /api/will?wallet=xxx — fetch will for a wallet ───────────────────
    if (method === 'GET') {
      if (!walletAddr) return res.status(400).json({ error: 'wallet required' });
      const raw = await kv('get', `will:${walletAddr}`);
      if (!raw) return res.status(404).json({ error: 'No will found' });
      return res.status(200).json({ ok: true, will: JSON.parse(raw) });
    }

    // ── POST /api/will — create or update will ────────────────────────────────
    if (method === 'POST') {
      const { wallet, beneficiary, days, amount, memo, signedTx } = req.body;
      if (!wallet || !beneficiary || !days || !amount || !signedTx) {
        return res.status(400).json({ error: 'Missing required fields: wallet, beneficiary, days, amount, signedTx' });
      }
      const will = {
        id: wallet,
        wallet,
        beneficiary,
        days: parseInt(days),
        amount: parseFloat(amount),
        memo: memo || '',
        signedTx,  // base64 serialized signed Solana Transaction
        createdAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        status: 'active',
      };
      // Store with no expiry — the cron job manages execution
      await kv('set', `will:${wallet}`, JSON.stringify(will));
      // Also add to the active wills index (for cron job to iterate)
      await kv('sadd', 'active_wills', wallet);
      return res.status(200).json({ ok: true, will });
    }

    // ── DELETE /api/will?wallet=xxx — cancel will ────────────────────────────
    if (method === 'DELETE') {
      if (!walletAddr) return res.status(400).json({ error: 'wallet required' });
      await kv('del', `will:${walletAddr}`);
      await kv('srem', 'active_wills', walletAddr);
      return res.status(200).json({ ok: true });
    }

    // ── PUT /api/will — heartbeat (I'm alive) ────────────────────────────────
    if (method === 'PUT') {
      const { wallet: w } = req.body;
      if (!w) return res.status(400).json({ error: 'wallet required' });
      const raw = await kv('get', `will:${w}`);
      if (!raw) return res.status(404).json({ error: 'No will found' });
      const will = JSON.parse(raw);
      will.lastHeartbeat = new Date().toISOString();
      await kv('set', `will:${w}`, JSON.stringify(will));
      return res.status(200).json({ ok: true, will });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[Will API]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
