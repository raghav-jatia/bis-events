# BIS Interhouse Events — Operations Manual (README)

This guide is for the students and staff who **maintain** the site. It's written in plain English — you do **not** need to know how to code.

**The most important idea:** almost everything you do day-to-day is done in the **Google Sheet**, not in the code. You edit the Sheet; the website updates itself. You will rarely, if ever, open a code file.

---

## Contents
1. How it all fits together
2. Golden rules (read once)
3. Editing data in the Google Sheet
   - Add a new event
   - Enter results for a sport (Calculated)
   - Enter results for a co-curricular (Direct)
   - Add extra points
   - Add photos
   - Change an event's status
4. Year-end: archiving & starting fresh
5. "Something looks wrong" — troubleshooting
6. Backups
7. Where the code lives (for the curious)
8. Publishing code changes
9. Seeing website statistics (Analytics)

---

## 1. How it all fits together

**Google Sheet (the data) → published to the web → the website reads it and displays it.**

- You enter events, results, extra points and photos in the Sheet (or via Google Forms).
- The website reads that data and draws the leaderboards, tables and pages.
- Changes can take a few minutes to appear (the data is cached). That's normal.

---

## 2. Golden rules (read once)

- ✅ **Do** enter data in the normal data rows, using the dropdowns provided.
- ❌ **Don't** edit the **Config** or **Houses** tabs unless you know exactly what you're doing (they control the whole site).
- ❌ **Don't** delete or rename **columns** or **header rows**.
- ❌ **Don't** change a cell that contains a formula.
- ✅ **Do** use the dropdown lists for **house**, **status**, **type** — never type these by hand (a typo like "alpha" vs "Alpha" can break colours). *(Exception: for a tie, you may type two house names in one place cell — see "Enter results" below. A small orange triangle appears; that's expected and harmless.)*
- ✅ **Do** leave a cell **blank** if there's no data (e.g. no bronze winner). Blank is fine — the site just hides it.
- ℹ️ If you make a mistake, don't panic: **File → Version history** lets you undo, and there's a weekly backup.

---

## 3. Editing data in the Google Sheet

### Add a new event
Go to the **Events** tab and add a row:
- **event_id** — a short unique code (e.g. `SWIM`, `DEB2`). Never reuse one.
- **year** — the season (e.g. `2026-27`).
- **name** — e.g. Swimming Gala.
- **type** — pick `Sport` or `Co-curricular` (dropdown).
- **date** — pick from the date picker.
- **grades** — e.g. `6–10` (shown on the Calendar).
- **status** — `Upcoming` to start (dropdown).
- **results_mode** — `Calculated` (site works out the house winner from individual results — most sports) or `Direct` (you type the house result yourself — most co-curriculars).
- **tier1_override** — leave **blank** normally. Only fill it (e.g. `12,8,4`) if *this* event uses a non-standard house-point scheme.
- Leave results/photos blank for now — you'll add them after the event.

### Enter results for a sport (Calculated)
After the event, go to the **Results** tab. Add **one row per age/grade category**:
- **event_id** — the event's code.
- **category** — e.g. `Under 14`.
- **gold_name / gold_house**, **silver_name / silver_house**, **bronze_name / bronze_house** — the winner's name and their house (dropdown for house).
- No third place? Leave the bronze cells **blank**.
- **A tie?** Type both house names in the same place cell, separated by a comma (e.g. `Alpha, Beta` in the gold cell). You'll see a small orange corner triangle — that's just a heads-up, it's fine for a tie. Each tied house gets that place's full points, and the next place still gets awarded (e.g. two golds → two golds **and** a silver). *(The exact tie rule is being finalised with the developer, but this is how you enter one.)*

The website automatically adds up these results, works out which house won the event overall, and awards the house points. You don't calculate anything.

### Enter results for a co-curricular (Direct)
For events where you just know the house result (no individual breakdown):
- On the **Events** tab, set **results_mode** = `Direct`.
- Fill **direct_1st / direct_2nd / direct_3rd** with the house that came 1st/2nd/3rd.
- Add a **writeup** (optional) and team members on the **Rosters** tab (optional).

### Add extra points
Go to the **Extra Points** tab. Add a row:
- **year**, **house**, **reason** (short, e.g. "House spirit"), **date**, **points**.
- Points can be **negative** for a deduction (e.g. `-2`).
- You can add several rows for the same house; the site groups and totals them.
- If there are no extra points at all, the whole section simply won't show on the site.

### Add photos
Each event has its own **Google Drive folder**. Just **drop the photo files into that folder** — they appear on the event's page automatically. No links to paste.
- No photos? The Photos section simply won't appear.
- (A small script reads the folder for you; you never touch it.)

### Write-ups and highlighting
In a write-up, wrap any words you want shown in **gold** like this:
`Rehan Desai's <highlight>Under-14 freestyle</highlight> was the swim of the day.`
Everything else shows in white. That's the only formatting you need.

### Change an event's status
On the **Events** tab, set **status**:
- `Upcoming` — shows in the Upcoming section and Calendar.
- `Live` — (used in V2) shows the live banner.
- `Completed` — moves into Completed Events and its points count towards the standings.

---

## 4. Year-end: archiving & starting fresh

At the end of a season:
1. **Make a copy** of the whole workbook: *File → Make a copy*, name it e.g. `BIS Interhouse 2026-27` — this is your archive.
2. In the **working** workbook, clear the data rows (Events, Results, Extra Points, Rosters, Photos) — **keep the headers and the Config/Houses tabs**.
3. On **Config**, update `season_label` and `current_year` to the new season.
4. You're ready for the new year with a clean slate; last year is safely archived.

---

## 5. "Something looks wrong" — troubleshooting

Work down this list:
1. **Wait a few minutes** — data is cached and updates aren't instant.
2. **Check the row you just edited** — is the house/status typed via the **dropdown**? Is a required cell empty?
3. **Check the event_id matches** between the Events tab and the Results/Rosters/Photos rows.
4. **Use the debug view:** add `?debug` to the end of the website's address (e.g. `…/index.html?debug`). It lists any data problems it found (duplicate IDs, unknown houses, bad dates) in plain messages.
5. Still stuck? Use **File → Version history** to undo recent changes, or restore from the weekly backup.

The site is built to **skip a bad row and keep working** rather than crash — so a single mistake won't take the whole site down.

---

## 6. Backups

- A small automatic script copies the whole workbook to a dated file in a **"Backups"** Drive folder **once a week**. You don't need to do anything.
- Google's **File → Version history** is your instant undo for recent edits.
- At year-end, the archived copy (§4) is a permanent snapshot.

---

## 7. Where the code lives (for the curious)

You rarely need this, but here's the map. The site is one `index.html` plus small, single-job files:

- **config.js** — fixed values (status names, types, the Sheet link).
- **data.js** — the only file that reads the Google Sheet.
- **validate.js** — checks the data and reports problems.
- **calculate.js** — all the points maths (Tier-2, Tier-1, standings, ranks, ties).
- **render.js** — draws everything on screen.
- **navigation.js** — page switching, mobile menu, analytics tracking.
- **main.js** — the "conductor" that runs the others in order.

Rule of thumb: a colour/layout tweak → `render.js`; a points-rule change → `calculate.js`; a data-source change → `data.js`. The code is commented in plain English, especially the maths and rendering.

---

## 8. Publishing code changes

The website lives on **GitHub Pages**. If a developer changes the code, they commit it to the GitHub repository and the live site updates automatically. (Editing **data** never needs this — that's just the Sheet.)

**A note on safety:** the code repository is **public**, which means anyone can *view* the code — but **nobody can change or delete it, or the live site, without account access.** Only the account owner and invited collaborators can edit. Keep the account protected with **two-factor authentication**, keep the collaborator list small, and never put passwords or secret keys in the code. Public means visible, not editable.

---

## 9. Seeing website statistics (Analytics)

The site uses **Google Analytics**. In the GA dashboard you can see:
- **Total visitors** to the site, and a **breakdown by page** (Home, Completed Events, Event Detail, Calendar) — including which individual events people view most.
- **Realtime** — how many people are on the site right now (this becomes especially useful in V2 for live events).

Ask the developer/admin for access to the GA property.

---

*Questions or something broken you can't fix from here? Note down exactly what you changed and what you see, and pass it to the site admin/developer.*
