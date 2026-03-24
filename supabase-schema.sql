-- OnChain Will — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

create table if not exists wills (
  id                      uuid primary key default gen_random_uuid(),
  wallet_address          text not null,
  beneficiary             text not null,
  days_threshold          integer not null default 30,
  amount_sol              numeric(18, 9) not null,
  memo                    text,
  email                   text,
  signed_tx               text not null,       -- base64 pre-signed Solana transaction
  status                  text not null default 'active',  -- active | executed | aborted | cancelled
  sol_price_at_creation   numeric(12, 4),
  beneficiary_risk_level  text default 'unknown',
  last_heartbeat          timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  executed_tx             text,                -- Solana tx signature after execution
  executed_at             timestamptz,
  final_sol_price         numeric(12, 4),
  abort_reason            text
);

-- Index for fast cron lookups
create index if not exists wills_status_idx on wills (status);
create index if not exists wills_wallet_idx on wills (wallet_address);

-- Only allow reading your own will (Row Level Security)
alter table wills enable row level security;

-- Service key (used by backend) bypasses RLS
-- Anon key (used by browser) can only read their own wallet's will
create policy "Users can read own wills"
  on wills for select
  using (true);  -- frontend filters by wallet_address in query

-- Only backend (service key) can insert/update
create policy "Service key can write"
  on wills for all
  using (auth.role() = 'service_role');
