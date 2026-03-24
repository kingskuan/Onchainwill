// POST /api/will/create
// Stores a new will config + pre-signed transaction in Supabase.
// Called from the browser after the user signs the transaction with Phantom.

import { createClient } from '@supabase/supabase-js';
import { getTokenPrice, securityAudit } from '../../lib/bgw.js';

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

  const { walletAddress, beneficiary, days, amount, memo, email, signedTx } = req.body ?? {};

  // Basic validation
  if (!walletAddress || !beneficiary || !days || !amount || !signedTx) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Get current SOL price via Bitget Wallet Skill
    const priceData = await getTokenPrice('sol');

    // 2. Security audit on beneficiary address
    const secData = await securityAudit('sol', beneficiary);

    // 3. Store in Supabase
    const { data, error } = await supabase
      .from('wills')
      .insert({
        wallet_address:  walletAddress,
        beneficiary,
        days_threshold:  parseInt(days),
        amount_sol:      parseFloat(amount),
        memo:            memo || null,
        email:           email || null,
        signed_tx:       signedTx,          // Base64 pre-signed Solana transaction
        status:          'active',
        sol_price_at_creation: priceData.price,
        beneficiary_risk_level: secData.riskLevel,
        last_heartbeat:  new Date().toISOString(),
        created_at:      new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok:      true,
      willId:  data.id,
      priceData,
      secData,
    });
  } catch (e) {
    console.error('[create-will]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
