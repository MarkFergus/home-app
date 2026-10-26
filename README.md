# Home

A small mobile-first app for two people:

- **Bar Tab**: a shared balance that turns green when in credit and red when owing. It has one-tap **Add Beer** / **Add Coke** buttons, add/subtract for any amount, a history showing who did what, and undo.
- **Shopping**: two shared lists, **Groceries** and **Takealot**. Add items, tap an item's text to edit it, tick it off, delete it, or clear all ticked items.

Stack: plain HTML/CSS/JS in `public/`, hosted on GitHub Pages. Supabase handles the database and logins, so there's no server to run.

## One-time setup

### 1. Supabase

You can use an existing project, because all tables are prefixed `home_`, or create a new one.

1. **SQL Editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
2. **Authentication → Users → Add user → Create new user** for each of you. Enter an email and password and tick **Auto Confirm User**.
3. Back in the **SQL Editor**, add both of you to the allowlist:
   ```sql
   insert into public.home_members (user_id, name)
   select id, 'Mark' from auth.users where email = 'mark@example.com';

   insert into public.home_members (user_id, name)
   select id, 'Hana' from auth.users where email = 'hana@example.com';
   ```
   Only accounts in `home_members` can see or change anything. Other users of a shared project are locked out.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into [`public/config.js`](public/config.js).

If this is a dedicated project, you can also turn off **Authentication → Sign In / Providers → Allow new users to sign up**.

### 2. GitHub Pages

Push this folder to a GitHub repo. Then go to **Settings → Pages → Source** and choose **GitHub Actions**. Each push to `main` deploys `public/` to `https://<you>.github.io/<repo>/`.

### 3. Phones

Open the URL, log in, then:

- **iPhone:** Share → **Add to Home Screen**.
- **Android:** ⋮ → **Add to Home screen**.

You both stay logged in.

## How the bar tab works

The balance is your credit with the bar:

- **Add Beer / Add Coke** charges a drink to the tab and *subtracts* its price.
- **+ Add** records a payment or top-up. **− Subtract** records any other charge.
- **Prices** (in the History header) sets the beer and coke prices.
- To set an opening balance, use + Add or − Subtract once with a note such as "Opening balance".

## Local development

```bash
python3 -m http.server 8000 -d public   # http://localhost:8000
```
