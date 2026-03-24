// Email notifications via Resend (resend.com)
// Sends warnings before execution and confirmation after.

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM       = process.env.EMAIL_FROM || 'will@onchainwill.app';

async function send({ to, subject, html }) {
  if (!RESEND_KEY) { console.warn('[Email] No RESEND_API_KEY set, skipping'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Warning email: sent 3 days before execution threshold */
export async function sendWarningEmail({ to, walletAddr, daysLeft, amount, beneficiary, heartbeatUrl }) {
  return send({
    to,
    subject: `⚠️ OnChain Will — 你的遗嘱将在 ${daysLeft} 天后执行`,
    html: `
      <div style="font-family:system-ui,sans-serif;background:#07070e;color:#e8e4dc;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
        <div style="font-size:28px;margin-bottom:8px">⚱</div>
        <h1 style="font-size:22px;font-weight:300;color:#c9a84c;margin-bottom:16px">链上遗嘱警告</h1>
        <p style="color:#a8a8c0;line-height:1.7;margin-bottom:24px">
          你的钱包 <code style="color:#c9a84c">${walletAddr.slice(0,8)}…</code> 已有一段时间没有链上活动。
          如果在 <strong style="color:#e8e4dc">${daysLeft} 天内</strong>没有任何链上操作，你的遗嘱将自动执行：
        </p>
        <div style="background:#111120;border:1px solid #1c1c30;border-radius:8px;padding:16px;margin-bottom:24px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1c1c30">
            <span style="color:#6a6a8a;font-size:12px">转移金额</span>
            <span style="color:#c9a84c;font-size:12px">${amount} SOL</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0">
            <span style="color:#6a6a8a;font-size:12px">受益人</span>
            <span style="color:#a8a8c0;font-size:12px">${beneficiary.slice(0,8)}…${beneficiary.slice(-4)}</span>
          </div>
        </div>
        <p style="color:#a8a8c0;margin-bottom:20px">如果你还活着，点击下面的按钮重置倒计时：</p>
        <a href="${heartbeatUrl}" style="display:inline-block;background:linear-gradient(135deg,#7a5f28,#c9a84c);color:#07070e;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:500">
          💚 我还活着 — 重置倒计时
        </a>
        <p style="color:#6a6a8a;font-size:11px;margin-top:32px">
          OnChain Will · Solana Agent · onchainwill.vercel.app
        </p>
      </div>
    `,
  });
}

/** Execution confirmation email */
export async function sendExecutionEmail({ to, walletAddr, amount, beneficiary, txHash }) {
  return send({
    to,
    subject: '⚡ OnChain Will — 遗嘱已执行',
    html: `
      <div style="font-family:system-ui,sans-serif;background:#07070e;color:#e8e4dc;padding:40px;max-width:520px;margin:0 auto;border-radius:12px">
        <div style="font-size:28px;margin-bottom:8px">⚱</div>
        <h1 style="font-size:22px;font-weight:300;color:#3cb87a;margin-bottom:16px">遗嘱已执行</h1>
        <p style="color:#a8a8c0;line-height:1.7;margin-bottom:24px">
          钱包 <code style="color:#c9a84c">${walletAddr.slice(0,8)}…</code> 的链上遗嘱已按约定执行。
        </p>
        <div style="background:#111120;border:1px solid #1c1c30;border-radius:8px;padding:16px;margin-bottom:24px">
          <div style="padding:6px 0;border-bottom:1px solid #1c1c30">
            <span style="color:#6a6a8a;font-size:12px">转移金额</span>
            <span style="float:right;color:#c9a84c;font-size:12px">${amount} SOL</span>
          </div>
          <div style="padding:6px 0;border-bottom:1px solid #1c1c30">
            <span style="color:#6a6a8a;font-size:12px">受益人</span>
            <span style="float:right;color:#a8a8c0;font-size:12px">${beneficiary.slice(0,8)}…</span>
          </div>
          <div style="padding:6px 0">
            <span style="color:#6a6a8a;font-size:12px">Tx Hash</span>
            <span style="float:right;color:#3cb87a;font-size:12px">${txHash?.slice(0,16)}…</span>
          </div>
        </div>
        <a href="https://solscan.io/tx/${txHash}" style="display:inline-block;background:#111120;border:1px solid #3cb87a;color:#3cb87a;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:13px">
          在 Solscan 查看交易 →
        </a>
        <p style="color:#6a6a8a;font-size:11px;margin-top:32px">
          OnChain Will · Solana Agent · onchainwill.vercel.app
        </p>
      </div>
    `,
  });
}
