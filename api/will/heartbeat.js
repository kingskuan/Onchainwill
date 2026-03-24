// POST /api/will/heartbeat
// Resets the inactivity countdown for a will.
// Called when user clicks "I'm Alive" button.
// Also triggered automatically by the cron job when it detects on-chain activity.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { willId, walletAddress } = req.body ?? {};
  if (!willId && !walletAddress) {
    return res.status(400).json({ error: 'Provide willId or walletAddress' });
  }

  try {
    const query = supabase
      .from('wills')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('status', 'active');

    if (willId)        query.eq('id', willId);
    else               query.eq('wallet_address', walletAddress);

    const { error } = await query;
    if (error) throw error;

    return res.status(200).json({ ok: true, resetAt: new Date().toISOString() });
  } catch (e) {
    console.error('[heartbeat]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
