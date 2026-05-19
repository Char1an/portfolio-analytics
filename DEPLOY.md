# 🚀 Deploying Folio Klarity

This guide walks you through deploying **Folio Klarity** — a React + FastAPI portfolio analytics platform — to the public internet using only free-tier services.

**Stack:** Vercel (frontend) · Render (backend) · GitHub (source)
**Total cost:** ₹0 / month
**Time:** ~15 minutes

---

## Prerequisites

- A [GitHub](https://github.com) account (username: `Char1an` in this guide)
- A [Vercel](https://vercel.com) account (sign in with GitHub)
- A [Render](https://render.com) account (sign in with GitHub)

That's it. No credit card needed for either platform's free tier.

---

## Step 1 — Push the repo to GitHub

```bash
cd /Users/apple/Desktop/portfolio-analytics

# Initialise git if you haven't already
git init
git add .
git commit -m "Initial commit — Folio Klarity"

# Create an empty repo at https://github.com/new (name it: portfolio-analytics)
# DO NOT initialise it with a README/license — keep it empty.

git branch -M main
git remote add origin https://github.com/Char1an/portfolio-analytics.git
git push -u origin main
```

> **Pre-flight check** — make sure `.gitignore` is doing its job. Run `git status` after `git add .` and confirm none of these appear:
> - `backend/venv/` · `frontend/node_modules/` · `backend/data/cache/` · `backend/ml/models/` · `*.pkl` · `.env`

---

## Step 2 — Deploy the backend to Render

The repo already ships with a `render.yaml` blueprint, so this is one click.

1. Open <https://dashboard.render.com> and click **New +** → **Blueprint**.
2. Select **Char1an/portfolio-analytics**.
3. Render will read `render.yaml` and propose a service named **folio-klarity-api**. Click **Apply**.
4. Wait ~3-5 minutes for the first build. When the status flips to **Live**, copy your API URL — it will look like:

   ```
   https://folio-klarity-api.onrender.com
   ```

5. **Sanity check:** open `<your-api-url>/health` in a browser. You should see `{"status":"healthy"}`.

> **Heads-up on the free tier:** the service sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 seconds to wake. To keep it warm, set up a free cron at <https://cron-job.org> hitting `<your-api-url>/health` every 10 minutes.

---

## Step 3 — Deploy the frontend to Vercel

1. Open <https://vercel.com/new>.
2. Select **Char1an/portfolio-analytics**.
3. Vercel will detect the project. Override these settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
4. Expand **Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://folio-klarity-api.onrender.com/api` *(use **your** Render URL — note the `/api` suffix)* |

5. Click **Deploy**. Wait ~1 minute. You'll get a URL like:

   ```
   https://portfolio-analytics-char1an.vercel.app
   ```

6. **(Optional)** Rename the deployment in **Project Settings → General** so the URL becomes something like `https://folio-klarity.vercel.app`.

---

## Step 4 — Tell the backend about the frontend (CORS)

Right now the backend doesn't accept requests from your Vercel URL. Fix it:

1. Open your Render service → **Environment** tab.
2. Find `EXTRA_CORS_ORIGINS`. Update its value to your actual Vercel URL — for example:

   ```
   EXTRA_CORS_ORIGINS=https://folio-klarity.vercel.app
   ```

3. **Save Changes** — Render redeploys automatically (~1 min).

If you add a custom domain later (e.g. `folioklarity.com`), append it here, comma-separated:

```
EXTRA_CORS_ORIGINS=https://folio-klarity.vercel.app,https://folioklarity.com
```

---

## Step 5 — Verify everything works

Visit your Vercel URL and:

- [ ] Dashboard loads (will show the "empty portfolio" state — expected for new visitors)
- [ ] Browse the **Fund Browser** → add 2-3 funds
- [ ] Open **Analytics** → it should fetch NAV data and render charts
- [ ] Open **Forecast** → first prediction will train models live (~30-60s). Subsequent forecasts are instant.

If anything 404s or shows a CORS error, double-check:
- `VITE_API_URL` on Vercel **does** end with `/api`
- `EXTRA_CORS_ORIGINS` on Render **exactly** matches your Vercel URL (no trailing slash)

---

## Optional — Custom Domain

If you own a domain (e.g. `folioklarity.com`) you can point it at Vercel:

1. Vercel → **Settings → Domains** → enter your domain → follow the DNS instructions (one CNAME record).
2. Render side: append your custom domain to `EXTRA_CORS_ORIGINS` (see Step 4).

The backend can stay on `*.onrender.com` — only the frontend needs the pretty URL.

---

## Future updates

After the initial setup, deploys are automatic:

```bash
git add .
git commit -m "your changes"
git push
```

Both Vercel and Render watch the `main` branch and redeploy on every push. Zero clicks.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend loads but every API call fails | `VITE_API_URL` missing or wrong | Re-check Vercel env vars, then redeploy |
| CORS error in browser console | Frontend URL not in `EXTRA_CORS_ORIGINS` | Add it on Render → service redeploys |
| Backend `502 Bad Gateway` | Render free tier waking up | Wait 30s and retry; consider a cron-job.org pinger |
| Forecast page hangs forever | First-time model training | Normal for first request per fund — wait 60s |
| Auth login fails after redeploy | `users.json` was wiped (free tier disk is ephemeral) | Either re-register, or upgrade to a paid disk (~$1/mo) |

---

Built with FastAPI · React · Vite · Recharts · scikit-learn · MFAPI.in
