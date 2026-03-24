// GET /api/cron/monitor
// Runs daily at 09:00 UTC (configured in vercel.json).
// For each active will:
//   1. Check Solana RPC for last on-chain activity
//   2. If still active → auto-reset heartbeat
//   3. If inactive for (threshold - 3) days → send warning email
//   4. If inactive for >= threshold days → execute will

import { createClient }      from '@supabase/supabase-js';
import { daysSinceLastActivity, sendRawTransaction } from '../../lib/solana.js';
import { getTokenPrice, securityAudit, swapSend }    from '../../lib/bgw.js';
import { sendWarningEmail, sendExecutionEmail }       from '../../lib/email.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export default async function handler(req, res) {
  // Protect the cron endpoint
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[cron] Starting daily monitor run', new Date().toISOString());

  // Fetch all active wills
  const { data: wills, error } = await supabase
    .from('wills')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('[cron] Failed to fetch wills:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const results = [];

  for (const will of wills) {
    try {
      const result = await processWill(will);
      results.push({ id: will.id, ...result });
    } catch (e) {
      console.error(`[cron] Error processing will ${will.id}:`, e.message);
      results.push({ id: will.id, action: 'error', error: e.message });
    }
  }

  console.log('[cron] Done. Processed:', results.length, 'wills');
  return res.status(200).json({ ok: true, processed: results.length, results });
}

async function processWill(will) {
  // 1. Check actual on-chain activity via Solana RPC
  const chainDays = await daysSinceLastActivity(will.wallet_address);
  console.log(`[cron] Will ${will.id}: chain inactivity = ${chainDays.toFixed(1)} days`);

  // 2. If user was recently active on-chain, auto-reset heartbeat
  if (chainDays < 1) {
    await supabase
      .from('wills')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', will.id);
    return { action: 'heartbeat_auto_reset', chainDays };
  }

  // 3. Use the greater of chain inactivity vs manual heartbeat
  const heartbeatDays = will.last_heartbeat
    ? (Date.now() - new Date(will.last_heartbeat).getTime()) / 86400000
    : Infinity;
  const inactiveDays = Math.max(chainDays, heartbeatDays);

  // 4. Execute if over threshold
  if (inactiveDays >= will.days_threshold) {
    return executeWill(will, inactiveDays);
  }

  // 5. Send 3-day warning
  const daysLeft = will.days_threshold - inactiveDays;
  if (daysLeft <= 3 && daysLeft > 0 && will.email) {
    await sendWarningEmail({
      to:          will.email,
      walletAddr:  will.wallet_address,
      daysLeft:    Math.ceil(daysLeft),
      amount:      will.amount_sol,
      beneficiary: will.beneficiary,
      heartbeatUrl:`https://onchainwill.vercel.app/heartbeat?id=${will.id}`,
    });
    return { action: 'warning_sent', daysLeft: Math.ceil(daysLeft) };
  }

  return { action: 'monitoring', inactiveDays: inactiveDays.toFixed(1), daysLeft: daysLeft.toFixed(1) };
}

async function executeWill(will, inactiveDays) {
  console.log(`[cron] EXECUTING will ${will.id} — ${inactiveDays.toFixed(1)} days inactive`);

  // 1. Get final asset value via Bitget Wallet Skill
  const priceData = await getTokenPrice('sol');

  // 2. Security audit on beneficiary
  const sec = await securityAudit('sol', will.beneficiary);
  if (sec.riskLevel === 'high') {
    // High-risk address — abort and notify
    await supabase.from('wills').update({ status: 'aborted', abort_reason: 'high_risk_beneficiary' }).eq('id', will.id);
    console.error(`[cron] Aborted will ${will.id}: beneficiary flagged as high risk`);
    return { action: 'aborted', reason: 'high_risk_beneficiary' };
  }

  // 3. Broadcast pre-signed transaction
  // Primary: use Bitget Wallet Skill swap-send
  // Fallback: direct Solana RPC sendTransaction
  let txHash;
  try {
    const bgwResult = await swapSend(will.signed_tx);
    txHash = bgwResult.txHash;
  } catch (e) {
    console.warn('[cron] BGW swap-send failed, trying direct RPC:', e.message);
    const { sendRawTransaction } = await import('../../lib/solana.js');
    txHash = await sendRawTransaction(will.signed_tx);
  }

  // 4. Update will status in DB
  await supabase.from('wills').update({
    status:       'executed',
    executed_tx:  txHash,
    executed_at:  new Date().toISOString(),
    final_sol_price: priceData.price,
  }).eq('id', will.id);

  // 5. Send confirmation email
  if (will.email) {
    await sendExecutionEmail({
      to:         will.email,
      walletAddr: will.wallet_address,
      amount:     will.amount_sol,
      beneficiary:will.beneficiary,
      txHash,
    });
  }

  console.log(`[cron] Will ${will.id} executed. Tx: ${txHash}`);
  return {
    action:     'executed',
    txHash,
    inactiveDays: inactiveDays.toFixed(1),
    usdValue:   (will.amount_sol * priceData.price).toFixed(2),
  };
}
