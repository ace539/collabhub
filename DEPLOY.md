# Deploying collabhub — step by step

You need two free accounts: **github.com** and **vercel.com**. Sign up for both
first (use the same email, and sign into Vercel *with* your GitHub account —
it makes step 3 one click).

Total time: about 20 minutes.

---

## Step 0 — download the site

In this chat, use the download card I sent (or the Export option) and save the
zip. Unzip it somewhere you'll find again — Desktop is fine. You should see:

```
index.html
Whitelist Hub.dc.html
Dashboard.dc.html
db.js
support.js
vercel.json
_ds/
supabase/
```

All of those need to go up. `index.html` is what sends visitors to the public
page, so don't delete it.

---

## Step 1 — put it on GitHub

The no-terminal way, using GitHub's website:

1. Go to **github.com** → click the **+** at top right → **New repository**.
2. Name it `collabhub`. Leave it **Public** (or Private — Vercel reads both).
   Don't tick "Add a README".
3. Click **Create repository**.
4. On the next screen click **uploading an existing file**.
5. Open your unzipped folder, select **everything inside it**, and drag it all
   into the browser window. Folders included — GitHub keeps the structure.
6. Wait for the uploads to finish (the `_ds` folder has a lot of files, give it
   a minute), then click **Commit changes**.

Your code is now on GitHub.

> If you'd rather not drag files: install **GitHub Desktop**, choose
> *File → New repository*, point it at your folder, then *Publish repository*.
> Same result, and future updates are one click.

---

## Step 2 — deploy on Vercel

1. Go to **vercel.com** → **Log in** → *Continue with GitHub*.
2. Click **Add New… → Project**.
3. You'll see your GitHub repos. Find `collabhub` → **Import**.
   - If it isn't listed, click *Adjust GitHub App Permissions* and give Vercel
     access to that repo.
4. **Don't change any settings.** Framework Preset should say *Other*. Leave
   Build Command and Output Directory empty — this is a plain static site.
5. Click **Deploy**.

About a minute later you get a URL like `collabhub-xyz.vercel.app`. Click
**Visit**. That's your live site.

---

## Step 3 — check it actually works

On the live URL:

1. The pill in the header should read **Live** in green.
2. The projects and the countdown ticker should be there — that data is coming
   from Supabase, not the browser.
3. Post something on the public page.
4. Open the same URL on your **phone**. Your post should be there.

That last one is the real test — two different devices seeing the same board.

If the pill says *Local only*, your Supabase keys didn't come along. Open
`db.js` on GitHub, confirm the `DEFAULTS` block still has your URL and anon
key, and re-upload it if not.

---

## Step 4 — your own domain (optional)

1. Buy one — **Porkbun** or **Namecheap**, roughly $10/year.
2. Vercel → your project → **Settings → Domains** → type your domain → **Add**.
3. Vercel shows you two DNS records (an `A` record and a `CNAME`). Copy them
   into your registrar's DNS settings.
4. Wait — usually minutes, occasionally a few hours. HTTPS is automatic.

---

## Updating the site later

Whatever you change in this project, re-upload the changed files to GitHub
(or hit *Push* in GitHub Desktop). Vercel redeploys by itself within a minute.

---

## One thing to do before you share the link

Right now the Dashboard is protected only by a passcode typed into the page,
and the patch you ran lets anonymous visitors add projects and delete posts.
That's fine while the URL is private and it's just you, Spain and Eyszi.

Before you post the link anywhere public, get real logins in (phase 2) so:

- wallets and WL spots live on the server, private per member, syncing across
  your devices
- only admins can moderate
- the anon-write patch can be rolled back

Ask me and I'll build it.
