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
   - Add a note about the results
   - Link to a live mini-site
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

- You enter events, results and extra points in the Sheet (or via Google Forms).
- The website reads that data and draws the leaderboards, tables and pages.
- Changes can take a few minutes to appear (the data is cached). That's normal.

---

## 2. Golden rules (read once)

- ✅ **Do** enter data in the normal data rows, using the dropdowns provided.
- ❌ **Don't** edit the **Config** or **Houses** tabs unless you know exactly what you're doing (they control the whole site).
- ❌ **Don't** delete or rename **columns** or **header rows**. (If you do, `?debug` will now tell you — but the site is missing that whole field until it's put back.)
- ❌ **Don't** change a cell that contains a formula.
- ⚠️ **Don't delete a tab and make a new one with the same name.** Renaming a tab is fine, and so is moving it — the site finds each tab by a permanent id number, not by its name. But deleting one throws that id away, and the replacement gets a new one the site doesn't know. If a tab really has to be recreated, tell whoever looks after the website so they can update it. (The site won't break: it falls back to finding the tab by name and says so in `?debug`.)
- ✅ **Do** sort, filter and hide rows as much as you like — see section 5.
- ✅ **Do** use the dropdown lists for **house**, **status**, **type** — never type these by hand (a typo like "alpha" vs "Alpha" can break colours). *(Exception: for a tie, you may type two house names in one place cell — see "Enter results" below. A small orange triangle appears; that's expected and harmless.)*
- ✅ **Do** leave a cell **blank** if there's no data (e.g. no bronze winner). Blank is fine — the site just hides it.
- ℹ️ If you make a mistake, don't panic: **File → Version history** lets you undo. (There is no automatic backup yet — see section 6.)

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
- **status** — `Upcoming` to start (dropdown). See "Change an event's status" below for all four.
- **results_mode** — how the house points get worked out. Leave it **blank until the event happens**; you only need it once you're entering results. The three choices are explained under "Enter results" below.
- **tier1_override** — leave **blank** normally. Only fill it (e.g. `12,8,4`) if *this* event uses a non-standard house-point scheme.
- **tier2_override** — leave **blank** normally. Only fill it (e.g. `10,7,4`) if the *individual winners inside this one event* are worth more or less than usual. See "The two override columns" below.
- **venue**, **writeup**, **result_note**, **minisite_url** — all optional, all explained below. Anything left blank simply doesn't appear on the site.
- Leave the results blank for now — you'll add them after the event.

### Enter results for a sport (Calculated)
After the event, go to the **Results** tab. Add **one row per age/grade category**:
- **event_id** — the event's code.
- **category** — e.g. `Under 14`.
- **gold_name / gold_house**, **silver_name / silver_house**, **bronze_name / bronze_house** — the winner's name and their house (dropdown for house).
- No third place? Leave the bronze cells **blank**.
- **A tie?** Type both house names in the same place cell, separated by a comma (e.g. `Alpha, Beta` in the gold cell). You'll see a small orange corner triangle — that's just a heads-up, it's fine for a tie. Each tied house gets that place's full points, and the next place still gets awarded (e.g. two golds → two golds **and** a silver).

The website automatically adds up these results, works out which house won the event overall, and awards the house points. You don't calculate anything.

### Enter results for a co-curricular (Direct)
For events where you just know the house result (no individual breakdown):
- On the **Events** tab, set **results_mode** = `Direct`.
- Fill **direct_1st / direct_2nd / direct_3rd** with the house that came 1st/2nd/3rd.
- Add a **writeup** (optional) and team members on the **Rosters** tab (optional).

### Enter results when a judge decided the house order (Override)
Occasionally the official house order is decided by a person — a head judge, a staff panel — rather than by adding the categories up. That's what `Override` is for.
- On the **Events** tab, set **results_mode** = `Override`.
- Fill **direct_1st / direct_2nd / direct_3rd** with the official house order. **These decide the points.**
- You can *also* fill in the **Results** tab rows as normal. They'll be shown on the event's page for information, but they will **not** change the house points.
- Because of that, the category table is *allowed* to disagree with the house order. That's the whole point of this mode, not a mistake — the site won't complain.
- It's kind to add a **result_note** (see below) explaining why, so visitors aren't confused by the mismatch.

**Which mode do I want?**

| Mode | Use it when | What decides the points |
|---|---|---|
| `Calculated` | Most sports — you have individual results per category | The site adds up the Results tab |
| `Direct` | Most co-curriculars — you only know which house won | The direct_1st/2nd/3rd cells |
| `Override` | A judge set the house order by hand | The direct_1st/2nd/3rd cells |

### Filtering the event lists on the website

The **Calendar** and **Completed Events** pages each have three buttons above the table: **All**, **Sports**, **Co-curricular**. They only change what you're looking at — no points, no totals, nothing in the Sheet. The House Totals below the table stay the same whichever you pick.

Your choice follows you between the two pages, and it survives opening an event and pressing Back — so you can work through a filtered list without setting it again each time. It goes back to **All** when you visit the **Home** page, or reload. If a page happens to hold only one kind of event, the buttons don't appear at all.

### The two override columns — `tier1_override` and `tier2_override`

**Leave both blank unless somebody has told you otherwise.** Almost every event uses the school's normal point schemes, and blank means "use the normal ones". They exist for the occasional event that genuinely isn't worth the same as the rest.

Points are worked out in two steps, and each column changes one of them:

| Column | Changes | Example |
|---|---|---|
| **tier2_override** | What each **individual winner inside this event** is worth while the site adds up the Results tab | `10,7,4` — a gold in this event's categories is worth 10 instead of the usual 5 |
| **tier1_override** | What the **houses** get for this event once they've been placed 1st/2nd/3rd | `12,8,4` — winning this event is worth 12 to the season instead of the usual 10 |

**The two are independent.** `tier2_override` changes the tally that decides *which house came 1st*; it does **not** change what coming 1st is worth. An event is still worth its normal 10/7/4 to the season unless you also set `tier1_override`.

`tier2_override` only does something on a **Calculated** event, because that's the only mode where the site adds up individual results. On a `Direct` or `Override` event it is ignored.

**How to type it:** plain numbers, single commas, **highest first** — `10,7,4`. Decimals are fine (`2.5,1.5,0.5`). Two places worth the same is fine (`5,5,3`).

**What happens if you get it wrong:** nothing silently. The site refuses a scheme it can't trust, scores the event with the normal scheme instead, and says exactly what's wrong in `?debug`, naming the event and the column. It rejects a missing value between commas (`10,,4`), words (`ten,seven,four`), a scheme that goes *up* (`1,2,3` — bronze can't beat gold), and thousands separators (`1,000` is read as two places worth 1 and 0).

### Team events (no individual names)
For football, basketball and the like there's no individual winner — only a house. On the **Results** tab, leave **gold_name** blank and just fill **gold_house**. The site shows the **house name** in that cell instead of an empty space. You can mix the two in one event (an individual sprint alongside a team relay) and each row reads correctly.

### Grouping team lists by age group
On the **Rosters** tab there's a **category** column (e.g. `Under 14`, `Under 8 - Boys`). Fill it in and each house's team list is split under those headings, with the same heading at the same height in every house's card so they're easy to compare.
- Leave the column **completely blank** and you get one simple list per house, as before.
- Fill it for *some* people and not others, and the rest are grouped under **Other** — nobody is ever dropped.

### Add extra points
Go to the **Extra Points** tab. Add a row:
- **year**, **house**, **reason** (short, e.g. "House spirit"), **date**, **points**.
- Points can be **negative** for a deduction (e.g. `-2`).
- You can add several rows for the same house; the site groups and totals them.
- If there are no extra points at all, the whole section simply won't show on the site.

### Photos — not available yet
**There is currently no way to add photos to an event.** The Photos section never appears on the site, and the **photo_folder** column on the Events tab does nothing — anything you put there is ignored.

Photo support was built but has been **switched off** while two questions are settled: how to stop very large phone photos making the site slow on mobile data, and how to share the folders safely. Ask the site admin if you need it; please don't rely on it in the meantime.

The **Photos tab is not read by the website at all** while it is switched off, so anything typed there is ignored too. That is deliberate — it saves every visitor a wasted download on every page. Nothing is lost: the tab and its contents stay exactly where they are, and switching photos back on is a change to the website's code, not to the Sheet.

### Add a note about the results
The **result_note** column on the Events tab is an optional one-line explanation shown with the results — for example *"Placings decided by the judging panel"* or *"Under-19 was cancelled due to rain."*
- Plain text only. Unlike the write-up, `<highlight>` does **not** work here.
- Leave it blank and no note appears.
- Especially worth filling in for an `Override` event, so the house order makes sense to a reader.

### Link to a live mini-site
The **minisite_url** column on the Events tab is an optional web address for an event's own page (a live scoreboard, a booking form, a photo album elsewhere).
- Paste an ordinary web address. It appears as a gold **"Click here for further event details"** button under the results, and opens in a new tab.
- Leave it blank and no button appears.
- If the event is **Live**, the banner at the top of the homepage links straight here.

### Write-ups and highlighting
In a write-up, wrap any words you want shown in **gold** like this:
`Rehan Desai's <highlight>Under-14 freestyle</highlight> was the swim of the day.`
Everything else shows in white. That's the only formatting you need.

### Change an event's status
On the **Events** tab, set **status** (dropdown). There are **four**:

| Status | Where the event appears | Do its points count? |
|---|---|---|
| `Upcoming` | Upcoming section + Calendar | No |
| `Live` | Red banner at the top of the homepage + Calendar | No |
| `Results Pending` | Completed Events + Recent Results + Calendar | **No — not yet** |
| `Completed` | Completed Events + Recent Results + Calendar | **Yes** |

**`Results Pending` is the useful one on the day of an event.** It means "this has happened, we just haven't typed the results in yet". The event shows up in the lists with a blue *Results Pending* label and dashes instead of placings, and its page says *"Final results are awaited for this event."*

**Nothing counts towards the leaderboard until the status says `Completed`.** So you can enter results at your own pace and switch to `Completed` when you're happy they're right — that's the moment the points appear.

---

## 4. Year-end: archiving & starting fresh

At the end of a season:
1. **Make a copy** of the whole workbook: *File → Make a copy*, name it e.g. `BIS Interhouse 2026-27` — this is your archive.
2. In the **working** workbook, clear the data rows (Events, Results, Extra Points, Rosters) — **keep the headers and the Config/Houses tabs**.
3. On **Config**, update `season_label` and `current_year` to the new season.

> ⚠️ **If you ever change a point scheme** (`sports_scheme`, `cocurricular_scheme`,
> `tier2_scheme`, or an event's `tier1_override` / `tier2_override`), write it as
> plain numbers separated by single commas, highest first: `10,7,4`. Decimals are
> fine (`3.5,2.25,1`).
> **Do not** use thousands separators (`1,000` is read as two places worth 1 and 0),
> semicolons, or spare commas. The site now refuses a scheme it cannot trust and
> says exactly what is wrong in the `?debug` view — but a scheme is the one cell
> that affects *every* event, so it is worth getting right first time.
>
> **Changing a scheme changes the WHOLE season, including events already finished.**
> The site recalculates everything from scratch every time it loads; it does not
> remember what was awarded at the time.
4. You're ready for the new year with a clean slate; last year is safely archived.

---

## 5. "Something looks wrong" — troubleshooting

Work down this list:
1. **Wait a few minutes** — data is cached and updates aren't instant.
2. **Check the row you just edited** — is the house/status typed via the **dropdown**? Is a required cell empty?
   - *Results entered but the leaderboard hasn't moved?* Check **status** is `Completed`, not `Results Pending`.
   - *An event scoring nothing at all?* Check it has a **results_mode**.
3. **Check the event_id matches** between the Events tab and the Results/Rosters rows.
4. **Use the debug view:** add `?debug` to the end of the website's address (e.g. `…/index.html?debug`). It lists any data problems it found — duplicate IDs, unknown houses, bad dates, a broken point scheme, an event with results that isn't marked Completed — in plain messages, each naming the tab, the row and the column to go and fix.
5. Still stuck? Use **File → Version history** to undo recent changes, or restore from your most recent manual copy (section 6).

The site is built to **skip a bad row and keep working** rather than crash — so a single mistake won't take the whole site down. If a whole tab goes missing (Results, Rosters, Extra Points) the rest of the site still loads, and `?debug` tells you which one and whether the standings are affected.

**`?debug` also tells you when your view of the Sheet differs from the site's.** If you have rows hidden, or a filter left on, it says so — one line per tab, under "Advisory notes". It is *not* a problem and nothing needs fixing: the site still reads every row. It's there so that if the Sheet on your screen shows 8 events and the site shows 10, you know immediately why, instead of hunting for a fault that doesn't exist.

**Hiding a *column* is also completely safe, and `?debug` says nothing about it.** A hidden column still reaches the site in full, so there is nothing to report — tested with `venue` hidden and again with `direct_1st` hidden, and the pages were correct both times. Don't take the silence as a sign it wasn't noticed: there is genuinely nothing to notice. (Renaming or deleting a column heading is a different matter entirely — that *is* reported, as an error.)

**Sorting, filtering and hiding rows is safe.** These are *view* settings — they change what **you** see while working, and the website downloads the sheet as it is **stored**, not as it looks on your screen. So you can filter the Results tab to find something without knocking points off the leaderboard, and you don't have to remember to switch the filter off again.

> ⚠️ **This changed in September 2026, and the earlier advice was wrong.**
> Until then the site fetched the Sheet a different way, and that way *did*
> silently drop hidden and filtered-out rows — two hidden rows on the Events tab
> took two whole events off the leaderboard with no warning anywhere. The site
> now reads each tab by its permanent id instead, which is not affected. If you
> are reading an old copy of these instructions, this paragraph is the correct one.

**One thing the site cannot spot:** if some Results rows are genuinely **deleted**, the site quietly adds up whatever is left and shows a confident but incomplete leaderboard. Nothing warns, because from its point of view the remaining rows look perfectly fine. So if the standings ever look wrong for no obvious reason, compare the **"Result rows"** count in `?debug` against how many rows the Results tab actually has.

A **renamed or deleted column heading** used to be invisible in the same way. It is now caught: `?debug` names the tab and the heading, tells you what the tab does have, and says whether the standings are affected. Put the heading back exactly as it was and reload.

---

## 6. Backups

- ⚠️ **There is no automatic backup yet.** An automatic weekly copy into a "Backups" Drive folder is planned but **has not been set up**, so please don't rely on one existing.
- **Until it is, make a copy yourself once a term** — *File → Make a copy*, name it with today's date, and keep it in a "Backups" folder. It takes ten seconds and it is the only thing that protects you from an accidental mass delete.
- Google's **File → Version history** is your instant undo for recent edits, and it goes back a long way. This is your main safety net day to day.
- At year-end, the archived copy (§4) is a permanent snapshot.

---

## 7. Where the code lives (for the curious)

You rarely need this, but here's the map. The site is one `index.html` plus small, single-job files:

- **config.js** — fixed values (status names, types, the Sheet link).
- **utils.js** — small shared helpers (dates, numbers, colours).
- **data.js** — the only file that reads the Google Sheet.
- **validate.js** — checks the data and reports problems.
- **calculate.js** — all the points maths (Tier-2, Tier-1, standings, ranks, ties).
- **render-shared.js** — bits used by more than one page, plus the header and footer.
- **render-home.js** — the home page.
- **render-events.js** — the Completed Events list and the Calendar.
- **render-detail.js** — one event's own page.
- **render-debug.js** — the `?debug` panel (see troubleshooting above).
- **navigation.js** — page switching, mobile menu, analytics tracking.
- **main.js** — the "conductor" that runs the others in order.

Rule of thumb: a colour/layout tweak → the `render-*` file for that page; a points-rule change → `calculate.js`; a data-source change → `data.js`. The code is commented in plain English, especially the maths and rendering.

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
