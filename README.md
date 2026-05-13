# Watch Suggestions

Static page where friends can suggest movies/TV shows for you to watch and upvote each other's picks. Stores data in Supabase, fires a phone push via ntfy on each new suggestion.

## Stack
- Static HTML/CSS/JS on GitHub Pages (no build step)
- Supabase (Postgres + RLS + Realtime + Database Webhooks)
- TMDB API for title autocomplete + posters
- ntfy.sh for mobile push

## Setup

### 1. Supabase
1. Create a project at https://supabase.com.
2. Open **SQL Editor** → paste the contents of `supabase/schema.sql` → run.
3. **Settings → API** → copy `Project URL` and `anon` `public` key into `config.js`.

### 2. TMDB
1. Create a free account at https://www.themoviedb.org.
2. Settings → API → request a developer key (instant approval).
3. Copy the **API Key (v3 auth)** into `config.js`.

### 3. ntfy (phone push)
1. Install the **ntfy** app on iOS or Android.
2. In the app, tap "+", create a topic — use something unguessable like `watchsugg-7f3kq9pl`. **Treat the topic name as a secret** — anyone with it can push to you.
3. In Supabase → **Database → Webhooks → Create a new hook**:
   - Name: `notify-new-suggestion`
   - Table: `suggestions`
   - Events: ☑ Insert
   - Type: HTTP Request
   - URL: `https://ntfy.sh/watchsugg-7f3kq9pl` (your topic)
   - Method: POST
   - HTTP Headers:
     - `Title`: `New watch suggestion`
     - `Tags`: `clapper`
   - HTTP Params / Body: leave the default (Supabase sends a JSON body with the row; ntfy will show it as the message). For prettier output, switch the body to a custom payload like:
     ```
     {{record.title}} ({{record.media_type}}{{#record.year}} · {{record.year}}{{/record.year}}) — suggested by {{record.suggester_name}}
     ```
     Or keep the default JSON if you don't mind a raw blob.
4. Save. Insert a test row in the `suggestions` table to confirm a push lands.

### 4. GitHub Pages
1. Create a repo named `watch-suggestions` on GitHub.
2. Push everything in this folder (including `config.js` with your real keys — anon/TMDB keys are public-safe).
3. **Repo → Settings → Pages** → Source: `main` / root. Done.
4. (CNAME / custom domain: you said you'll handle that yourself.)

## Notes
- The `voter_fingerprint` is a UUID kept in browser `localStorage`. Clearing storage = vote again. That's intentional per your spec.
- The `votes_delete_own` policy lets anyone delete any vote row — fine for a friend-group site. Tighten later if needed.
- All keys in `config.js` ship to the browser. Don't put any service-role keys there.
