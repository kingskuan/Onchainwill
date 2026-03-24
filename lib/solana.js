// Solana RPC helpers (server-side, Node.js fetch)

const RPC = 'https://api.mainnet-beta.solana.com';

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const d = await res.json();
  if (d.error) throw new Error(`RPC ${method}: ${d.error.message}`);
  return d.result;
}

/** Get SOL balance in lamports → SOL */
export async function getBalance(address) {
  const result = await rpc('getBalance', [address]);
  return (result?.value ?? 0) / 1e9;
}

/** Get the blockTime of the most recent transaction. Returns Date or null. */
export async function getLastActivityTime(address) {
  const sigs = await rpc('getSignaturesForAddress', [address, { limit: 1 }]);
  const t = sigs?.[0]?.blockTime;
  return t ? new Date(t * 1000) : null;
}

/** How many days since last on-chain activity. Returns Infinity if never. */
export async function daysSinceLastActivity(address) {
  const last = await getLastActivityTime(address);
  if (!last) return Infinity;
  const ms = Date.now() - last.getTime();
  return ms / 86400000;
}

/** Send a raw pre-signed transaction (base64 encoded). Returns signature. */
export async function sendRawTransaction(signedTxBase64) {
  const sig = await rpc('sendTransaction', [
    signedTxBase64,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ]);
  return sig; // tx signature string
}
