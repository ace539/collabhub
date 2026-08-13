# collabhub — going live

Two jobs: put the data in a real database (Supabase), then put the site on the
internet (Vercel). Both free. Budget an evening.

---

## Part 1 — Supabase (the database)

**1. Make the project**
Go to supabase.com → New project. Pick a name and a region close to your
community. Save the database password somewhere safe.

**2. Create the tables**
Left sidebar → SQL Editor → New query. Open `supabase/schema.sql` from this
project, paste the whole thing in, hit Run. That creates every table and — more
importantly — the row-level security rules that make wallets and WL spots
genuinely private on the server, not just hidden in the interface.

**3. Grab your keys**
Settings → API. You need two values:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public key** — a long string starting `eyJ...`

The anon key is safe to put in the page. It is *not* a password — the row-level
security rules from step 2 are what protect the data. Never put the
`service_role` key in the page; that one bypasses every rule.

**4. Turn on email login**
Authentication → Providers → Email. Enable it. Turn off "Confirm email" while
you're testing so signups are instant.

**5. Make yourself the owner**
Sign up once through the site with your own email, then run the last query in
`schema.sql` (the commented-out one at the bottom) to promote that account to
owner. From then on you can add Spain and Eyzi from the Team tab.

---

## Part 2 — Vercel (making it live)

**1. Put the code on GitHub**
Create an empty repository at github.com, then push this project's files to it.
If you've never used git, GitHub Desktop does the whole thing with buttons.

**2. Connect Vercel**
vercel.com → Sign in with GitHub → Add New Project → pick the repo → Deploy.
It's a static site, so there's nothing to configure. About a minute later you
get a live URL like `collabhub.vercel.app`.

**3. Add your keys as environment variables**
Vercel → your project → Settings → Environment Variables:

```
SUPABASE_URL   = https://abcdefgh.supabase.co
SUPABASE_ANON  = eyJ...
```

**4. Point a domain at it**
Buy one (Namecheap, Porkbun — roughly $10/year), then Vercel → Settings →
Domains → add it. Vercel tells you the two DNS records to paste at your
registrar. HTTPS is automatic.

Every time you push to GitHub after this, the live site updates itself.

---

## Part 3 — the two things that need a server

Vercel gives you serverless functions on the free plan. Both of these are a
single file each in an `/api` folder:

**Discord alerts** — the browser blocks webhook calls to Discord. A function
`/api/discord` takes the message and forwards it, so the webhook URL never sits
in the page.

**X / Twitter data** — if you ever move off manual trends: X removed its free
API tier in February 2026. Official pricing is per-read and gets expensive
quickly. Third-party mirrors (TwitterAPI.io, GetXAPI) sell the same data for
cents per thousand posts. Either way the key lives in a function, never in the
page.

---

## What changes in the site itself

Right now every list reads and writes `localStorage`. Switching to Supabase
means replacing those calls — the shapes already match the tables:

| Now (browser)              | Becomes (Supabase)                     |
| -------------------------- | -------------------------------------- |
| `collabhub.feed.v1`        | `posts` table                          |
| `collabhub.projects.v1`    | `projects` table                       |
| `collabhub.members.v2`     | `members` table + Supabase auth        |
| `collabhub.wallets.<id>`   | `wallets` table (RLS: owner only)      |
| `collabhub.wl.<id>`        | `wl_spots` table (RLS: owner only)     |
| `collabhub.xtrends.v1`     | `trends` table                         |
| passcode check on login    | real email login                       |

The passcode gate becomes real authentication at that point — worth saying
plainly: today's passcodes keep the tab out of the way, they don't secure
anything. Supabase auth does.

Say the word and I'll do this rewiring for you.

---

## Order of work

1. Supabase project + run the schema — 20 minutes
2. Push to GitHub, deploy on Vercel — 20 minutes
3. Rewire the pages to Supabase — the real work
4. Domain — 10 minutes plus DNS propagation
5. Discord function, then X data if you want it
