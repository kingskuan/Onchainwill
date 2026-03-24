// GET /api/will/status?wallet=ADDRESS
// Returns current will status + live SOL price for the dashboard.

import { createClient } from '@supabase/supabase-js';
import { getTokenPrice } from '../../lib/bgw.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const wallet = req.query?.wallet;
  if (!wallet) return res.status(400).json({ error: 'wallet param required' });

  try {
    const [{ data: will, error }, priceData] = await Promise.all([
      supabase
        .from('wills')
        .select('id,wallet_address,beneficiary,days_threshold,amount_sol,memo,status,last_heartbeat,created_at,executed_tx,executed_at')
        .eq('wallet_address', wallet)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      getTokenPrice('sol'),
    ]);

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    // Compute inactivity
    let daysSinceHeartbeat = null;
    if (will?.last_heartbeat) {
      daysSinceHeartbeat = (Date.now() - new Date(will.last_heartbeat).getTime()) / 86400000;
    }

    return res.status(200).json({
      ok:   true,
      will: will ?? null,
      daysSinceHeartbeat,
      priceData,
    });
  } catch (e) {
    console.error('[status]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
