# 🏏 Challengers Cricket Club — Supabase Database Setup (100% Free)

Follow these quick 4 steps to connect your free Supabase database so all players and admins see real-time updates across their phones:

---

### Step 1: Create a Free Supabase Project
1. Open **[supabase.com](https://supabase.com)** and click **"Start your project"** (sign in with your email or GitHub).
2. Click **"New project"**.
3. Fill in:
   * **Name**: `Challengers Cricket Club`
   * **Database Password**: Create any secure password (keep it safe).
   * **Region**: Choose the closest region (e.g. `South Asia (Mumbai)` for India).
   * **Pricing Plan**: Free tier ($0/month).
4. Click **"Create new project"** (takes ~1-2 minutes to provision).

---

### Step 2: Run the 1-Click Database Schema
1. In your Supabase project dashboard, click **"SQL Editor"** (the icon with `>_` in the left sidebar).
2. Click **"New query"**.
3. Open the file **[`supabase_schema.sql`](./supabase_schema.sql)** in your project folder, copy all contents, and paste them into the SQL editor box.
4. Click the green **"Run"** button (bottom right).
5. You should see `Success. No rows returned`. That's it! Your `matches` and `players` tables, security policies, and real-time streams are now created!

> [!IMPORTANT]
> **If you already created your tables previously:**
> Run this single SQL query in **SQL Editor** so captains can see the War Room, Coin Toss, and make picks from their phones:
> ```sql
> ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draft JSONB DEFAULT NULL;
> ```

---

### Step 3: Copy Your API Keys
1. In the left sidebar, click the **Settings Gear ⚙️** (bottom left).
2. Click **"API"** under Project Settings.
3. You will see two values:
   * **Project URL**: e.g., `https://abcdefghijkl.supabase.co`
   * **Project API keys** → `anon` `public`: e.g., `eyJhbGciOi...`
4. Copy both values.

---

### Step 4: Paste into `js/supabase-config.js`
1. Open [`js/supabase-config.js`](./js/supabase-config.js) in your project folder.
2. Paste your URL and Anon Key into the quotes:

```javascript
const supabaseConfig = {
    url: "https://your-project-id.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
};
```
3. Save the file!

---

### Step 5: Test Real-Time Sync! 🎉
1. Open **`http://localhost:3000`** in two different browser windows side-by-side (or one normal window and one Incognito window).
2. Log in as **Admin** in Window 1 (Passcode: `CCC2025`) and create a match.
3. Watch Window 2 automatically display the match **without touching or refreshing the page**!
4. Click *"I'm In!"* on Window 2 — Window 1 will instantly show the updated squad count!

---

### 🛡️ Automatic Fallback
If you haven't added keys yet or if your device is offline, the app automatically runs in **Offline LocalStorage Mode** so it will never crash or show blank pages.
