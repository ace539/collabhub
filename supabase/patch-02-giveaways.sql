-- collabhub — patch 02: giveaways
-- Adds the giveaway/raffle engine tables. Run in Supabase → SQL Editor → Run.

create table if not exists public.giveaways (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references public.projects(id) on delete set null,
  title        text not null,
  project_name text,
  chain        text,
  prize        text,                      -- e.g. "5 WL spots"
  image_url    text,                      -- banner/art shown on the public page
  winners      int  default 1,
  ends_at      timestamptz,
  status       text default 'live' check (status in ('draft','live','ended','drawn')),
  requirements jsonb default '[]'::jsonb, -- [{type,label,targets[]}]
  x_post_url   text,
  discord_url  text,
  telegram_url text,
  notes        text,
  created_by   uuid references public.members(id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  handle      text not null,              -- the entrant's X handle
  wallet      text,
  discord     text,
  checks      jsonb default '{}'::jsonb,  -- {requirementIndex: true}
  verified    boolean default false,      -- true once a bot/manual review confirms
  won         boolean default false,
  created_at  timestamptz default now(),
  unique (giveaway_id, handle)
);

create index if not exists entries_giveaway_idx on public.entries(giveaway_id);

alter table public.giveaways enable row level security;
alter table public.entries   enable row level security;

-- giveaways: everyone reads (the public page lists them), anyone writes for now
create policy "anyone reads giveaways"   on public.giveaways for select using (true);
create policy "anyone writes giveaways"  on public.giveaways for insert with check (true);
create policy "anyone updates giveaways" on public.giveaways for update using (true);
create policy "anyone deletes giveaways" on public.giveaways for delete using (true);

-- entries: anyone can enter; entrants see the list (count + winners are public)
create policy "anyone reads entries"   on public.entries for select using (true);
create policy "anyone enters"          on public.entries for insert with check (true);
create policy "anyone updates entries" on public.entries for update using (true);
create policy "anyone deletes entries" on public.entries for delete using (true);

-- pick winners server-side so it can't be gamed from the page
create or replace function public.draw_winners(g_id uuid, n int)
returns setof public.entries language plpgsql security definer as $$
begin
  update public.entries set won = false where giveaway_id = g_id;
  update public.entries set won = true
   where id in (
     select id from public.entries
      where giveaway_id = g_id and verified = true
      order by random() limit n
   );
  update public.giveaways set status = 'drawn' where id = g_id;
  return query select * from public.entries where giveaway_id = g_id and won = true;
end;
$$;

-- ROLLBACK (after real logins exist, restrict writes to admins):
-- drop policy "anyone writes giveaways"  on public.giveaways;
-- drop policy "anyone updates giveaways" on public.giveaways;
-- drop policy "anyone deletes giveaways" on public.giveaways;
-- create policy "admins write giveaways" on public.giveaways for all using (public.is_admin());
