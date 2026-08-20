-- collabhub — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- It creates the tables, then locks them down so members can never read
-- each other's wallets or whitelist spots.

-- ─────────────────────────────────────────────────────────────
-- 1. MEMBERS  (one row per team member, linked to Supabase auth)
-- ─────────────────────────────────────────────────────────────
create table public.members (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  handle     text,
  role       text not null default 'member' check (role in ('owner','admin','member')),
  color      text default '#8b5cf6',
  created_at timestamptz default now()
);

-- helper: is the current user an admin or owner?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.members
    where id = auth.uid() and role in ('owner','admin')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. PROJECTS  (shared team board — everyone signed in can read)
-- ─────────────────────────────────────────────────────────────
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  chain       text,
  manager     text,
  dm_link     text,
  spots       text,
  deadline    date,
  mint_date   date,
  price       text,
  supply      text,
  hype        int default 5 check (hype between 0 and 10),
  rules       text,
  notes       text,
  x_url       text,
  tg_url      text,
  giveaway    boolean default false,
  added_by    uuid references public.members(id) on delete set null,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. POSTS  (the public feed — anyone can read AND insert)
-- ─────────────────────────────────────────────────────────────
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'alpha'
             check (type in ('alpha','collab','mint','shill','help')),
  project    text,
  chain      text,
  title      text not null,
  body       text,
  manager    text,
  deadline   date,
  link       text,
  author     text default '@anon',
  votes      int default 1,
  reports    int default 0,
  pinned     boolean default false,
  hidden     boolean default false,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. WALLETS  (PRIVATE — only the owning member, ever)
-- ─────────────────────────────────────────────────────────────
create table public.wallets (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  label      text not null,
  address    text not null,
  chains     text[] default '{}',
  is_main    boolean default false,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. WL SPOTS  (PRIVATE — only the owning member, ever)
-- ─────────────────────────────────────────────────────────────
create table public.wl_spots (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  status     text default 'applied' check (status in ('applied','won','lost')),
  wallet_id  uuid references public.wallets(id) on delete set null,
  source     text,
  tasks      jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. TRENDS  (what admins type into the X panel)
-- ─────────────────────────────────────────────────────────────
create table public.trends (
  id         uuid primary key default gen_random_uuid(),
  tag        text not null,
  meta       text,
  delta      text,
  position   int default 0,
  created_at timestamptz default now()
);

-- ═════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — this is the part that enforces privacy
--  on the server. Without it, anyone could read anyone's data.
-- ═════════════════════════════════════════════════════════════
alter table public.members  enable row level security;
alter table public.projects enable row level security;
alter table public.posts    enable row level security;
alter table public.wallets  enable row level security;
alter table public.wl_spots enable row level security;
alter table public.trends   enable row level security;

-- MEMBERS: the team can see the roster (names + roles only).
create policy "team can read roster"
  on public.members for select
  using (auth.uid() is not null);

create policy "you can edit yourself"
  on public.members for update
  using (id = auth.uid());

create policy "owner manages members"
  on public.members for all
  using (exists (select 1 from public.members m
                 where m.id = auth.uid() and m.role = 'owner'));

-- PROJECTS: public read (the front page lists them), team writes.
create policy "anyone can read projects"
  on public.projects for select using (true);

create policy "team can add projects"
  on public.projects for insert
  with check (auth.uid() is not null);

create policy "author or admin can edit"
  on public.projects for update
  using (added_by = auth.uid() or public.is_admin());

create policy "author or admin can delete"
  on public.projects for delete
  using (added_by = auth.uid() or public.is_admin());

-- POSTS: the whole point of the public board — anyone reads, anyone posts.
create policy "anyone can read posts"
  on public.posts for select using (hidden = false or public.is_admin());

create policy "anyone can post"
  on public.posts for insert with check (true);

create policy "admins moderate posts"
  on public.posts for update using (public.is_admin());

create policy "admins delete posts"
  on public.posts for delete using (public.is_admin());

-- WALLETS: hard privacy. No admin override. Only you.
create policy "own wallets only"
  on public.wallets for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- WL SPOTS: same — your spots are yours.
create policy "own spots only"
  on public.wl_spots for all
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- TRENDS: public read, admin write.
create policy "anyone can read trends"
  on public.trends for select using (true);

create policy "admins manage trends"
  on public.trends for all using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 7. VOTING  (one vote per post per browser, without accounts)
--    Called from the page as: supabase.rpc('vote_post', {p_id: id})
-- ─────────────────────────────────────────────────────────────
create or replace function public.vote_post(p_id uuid)
returns int language plpgsql security definer as $$
declare new_votes int;
begin
  update public.posts set votes = votes + 1
   where id = p_id returning votes into new_votes;
  return new_votes;
end;
$$;

create or replace function public.report_post(p_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.posts set reports = reports + 1 where id = p_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. AUTO-CREATE a member row when someone signs up
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.members (id, name, handle)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'handle', '@' || split_part(new.email,'@',1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 9. Make the first account the owner (run AFTER you sign up once)
-- ─────────────────────────────────────────────────────────────
-- update public.members set role = 'owner'
--  where id = (select id from auth.users order by created_at limit 1);
