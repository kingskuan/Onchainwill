// POST /api/bgw — Bitget Wallet Skill proxy (used by frontend)
// Handles HMAC signing server-side so secret never reaches browser.

import { getTokenPrice, securityAudit, swapSend } from '../lib/bgw.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { action, ...params } = req.body ?? {};
  try {
    let data;
    switch (action) {
      case 'token-price':    data = await getTokenPrice(params.chain, params.contractAddress); break;
      case 'security-audit': data = await securityAudit(params.chain, params.contractAddress); break;
      case 'swap-send':      data = await swapSend(params.signedTx); break;
      default: return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    res.status(200).json({ ok: true, data });
  } catch (e) {
    console.error('[bgw proxy]', e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
}
