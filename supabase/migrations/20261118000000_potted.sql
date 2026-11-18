-- Potted's off-chain data: profiles, challenge text and terms, pledges and
-- clips, plus one JSON row for the rest of the app's state. Money itself is
-- held by the escrow program on Solana; these rows are the app's record.
--
-- The server writes with the service role key. Row level security is on
-- with no policies, so the anon key cannot read or write anything.

create table if not exists profiles (
  id text primary key,
  name text not null,
  role text not null check (role in ('fan', 'streamer', 'mod')),
  handle text unique,
  wallet text not null,
  created_at timestamptz not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists challenges (
  id text primary key,
  streamer_id text not null,
  game_id text not null,
  title text not null,
  status text not null,
  total_micro bigint not null default 0,
  goal_micro bigint not null default 0,
  created_at timestamptz not null,
  settled_at timestamptz,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists challenges_streamer on challenges (streamer_id, created_at desc);
create index if not exists challenges_game on challenges (game_id, status);

create table if not exists pledges (
  id text primary key,
  challenge_id text not null,
  user_id text not null,
  amount_micro bigint not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists pledges_challenge on pledges (challenge_id);
create index if not exists pledges_user on pledges (user_id);

create table if not exists clips (
  id text primary key,
  challenge_id text not null,
  streamer_id text not null,
  url text not null,
  claimed_at timestamptz not null,
  disputes int not null default 0,
  ruling text check (ruling in ('upheld', 'rejected')),
  updated_at timestamptz not null default now()
);

create table if not exists app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table challenges enable row level security;
alter table pledges enable row level security;
alter table clips enable row level security;
alter table app_state enable row level security;
