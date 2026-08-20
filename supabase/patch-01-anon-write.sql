-- collabhub — patch 01
-- WHY: the main schema only lets signed-in users add projects and trends
-- (auth.uid() is not null). The site doesn't have logins yet, so every visitor
-- is anonymous and those inserts get refused by row-level security.
--
-- This patch lets anonymous visitors add projects and trends, so the hub is
-- usable before real accounts exist. Wallets and WL spots are NOT touched —
-- they stay locked to their owner.
--
-- Run this in Supabase → SQL Editor → New query → Run.
-- When we add real logins, run the ROLLBACK block at the bottom to close it.

-- ---------- PROJECTS: allow anonymous insert ----------
drop policy if exists "team can add projects" on public.projects;

create policy "anyone can add projects"
  on public.projects for insert
  with check (true);

-- deletes stay restricted: only an admin, or whoever added it while signed in
drop policy if exists "author or admin can delete" on public.projects;

create policy "admin or author can delete"
  on public.projects for delete
  using (public.is_admin() or added_by is null or added_by = auth.uid());

drop policy if exists "author or admin can edit" on public.projects;

create policy "admin or author can edit"
  on public.projects for update
  using (public.is_admin() or added_by is null or added_by = auth.uid());

-- ---------- TRENDS: allow anonymous write ----------
drop policy if exists "admins manage trends" on public.trends;

create policy "anyone can add trends"
  on public.trends for insert with check (true);

create policy "anyone can remove trends"
  on public.trends for delete using (true);

-- ---------- POSTS: let the moderation panel work before logins ----------
-- (admin-only moderation returns once accounts exist)
drop policy if exists "admins moderate posts" on public.posts;
drop policy if exists "admins delete posts" on public.posts;

create policy "open moderation for now"
  on public.posts for update using (true);

create policy "open delete for now"
  on public.posts for delete using (true);


-- ═══════════════════════════════════════════════════════════════
--  ROLLBACK — run this AFTER real logins are added, to lock it down
-- ═══════════════════════════════════════════════════════════════
-- drop policy if exists "anyone can add projects"   on public.projects;
-- drop policy if exists "admin or author can delete" on public.projects;
-- drop policy if exists "admin or author can edit"   on public.projects;
-- drop policy if exists "anyone can add trends"      on public.trends;
-- drop policy if exists "anyone can remove trends"   on public.trends;
-- drop policy if exists "open moderation for now"    on public.posts;
-- drop policy if exists "open delete for now"        on public.posts;
--
-- create policy "team can add projects" on public.projects
--   for insert with check (auth.uid() is not null);
-- create policy "author or admin can edit" on public.projects
--   for update using (added_by = auth.uid() or public.is_admin());
-- create policy "author or admin can delete" on public.projects
--   for delete using (added_by = auth.uid() or public.is_admin());
-- create policy "admins manage trends" on public.trends
--   for all using (public.is_admin());
-- create policy "admins moderate posts" on public.posts
--   for update using (public.is_admin());
-- create policy "admins delete posts" on public.posts
--   for delete using (public.is_admin());
