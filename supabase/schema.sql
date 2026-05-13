create table if not exists public.monitor_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.monitored_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('YouTube', 'X', 'Twitch')),
  name text not null,
  url text not null,
  status text not null default '监控中' check (status in ('监控中', '待复核')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('YouTube', 'X', 'Twitch')),
  platform_content_id text,
  title text not null,
  url text not null,
  creator text not null,
  source text not null check (source in ('关键词匹配', '指定账号')),
  discovered_at timestamptz not null default now(),
  followers integer,
  views integer,
  impressions integer,
  engagements integer,
  peak_viewers integer,
  vod_views integer,
  created_at timestamptz not null default now()
);
