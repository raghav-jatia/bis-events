// config.js
// What this file does: holds fixed, site-wide constants — values that never
// change based on what's in the Google Sheet. Nothing school-specific goes
// here (house names, colours, point schemes, term dates, etc. all live in
// the Sheet's Config/Houses tabs and are read at runtime by data.js).

// --- Event status values (Events tab, "status" column) ---
// Must match the Sheet's dropdown options exactly (case-sensitive).
const STATUS = {
  UPCOMING: "Upcoming",
  LIVE: "Live", // used in V2; site should still recognise it in V1
  COMPLETED: "Completed",
  // The event has happened but its results have not been entered yet. It is
  // listed with the events that have taken place, but scores nothing until
  // someone marks it Completed and fills the results in.
  RESULTS_PENDING: "Results Pending",
};

// --- Event type values (Events tab, "type" column) ---
const EVENT_TYPE = {
  SPORT: "Sport",
  COCURRICULAR: "Co-curricular",
};

// --- Results mode values (Events tab, "results_mode" column) ---
// Calculated = site tallies Tier-2 individual results into a house ranking.
// Direct     = the house placings (1st/2nd/3rd) are entered straight in.
const RESULTS_MODE = {
  CALCULATED: "Calculated",
  DIRECT: "Direct",
  // Override = scored exactly like Direct (the house order comes from
  // direct_1st/2nd/3rd), but the per-category Results rows ARE still shown on
  // the event's page for information.
  //
  // It exists for the rare case where the official house order was decided by
  // a human authority rather than by adding the categories up. The published
  // table may therefore disagree with the house placings — that is the whole
  // point of the mode, not a mistake, and nothing flags it.
  OVERRIDE: "Override",
};

// --- The Google Sheet we read from ---
// The workbook "BIS Interhouse 2026-27", shared as "anyone with the link can
// view". data.js is the only file that should ever read these constants.
//
// If the site is ever pointed at a different workbook (e.g. a new season, or a
// different school in V4), this ID is the ONLY thing that changes here.
const SHEET_ID = "1M3KZG023o9iKTQoeqUHvtyYYQQeJITqcLjXMpVqcZgo";

// --- How a tab is read: two routes, and why there are two ---
//
// PRIMARY — the plain CSV export, addressed by GID (the tab's permanent id
// number). This is the same file you get from File → Download → CSV, and it is
// the honest one: it returns the sheet exactly as it stands.
// Full form: <base>&gid=<gid>
const SHEET_EXPORT_BASE_URL =
  "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv";

// FALLBACK — Google's "gviz" endpoint, addressed by tab NAME. Used only when a
// tab has no gid recorded below, or when its gid stops working.
// Full form: <base>?tqx=out:csv&headers=1&sheet=<TabName>
//
// ⚠️ gviz is NOT a safe primary source. It was the site's only route until
// September 2026, and it loses data in two ways that nothing on the page can
// see (both measured against this workbook — see PROJECT-STATE.md):
//
//   1. It silently OMITS hidden rows and rows excluded by a filter. Two hidden
//      rows on Events and the site received 8 events instead of 10, with the
//      leaderboard changing to match and not one warning anywhere.
//   2. It guesses a single data TYPE per column and returns an empty cell for
//      anything that doesn't fit the guess. It decided the `grades` column was
//      a date column, so "1 - 12" and "6 - 12" arrived blank while "6-12" and
//      "9-12" came through — four events silently lost their grade range.
//
// The export route has neither behaviour. gviz is kept only so that a tab we
// have no gid for still loads at all, and data.js reports whenever it is used.
const SHEET_CSV_BASE_URL =
  "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq";

// --- The photo-lister web app (blueprint §9) ---
// A published Sheet cannot look inside a Drive folder, so one tiny Apps Script
// lists the images in an event's photo_folder. Paste its "Web app" URL here
// after deploying photos-apps-script.gs — it ends in /exec.
//
// Leave it as "" and the photo feature simply switches itself off: no requests
// are made and every Photos section stays hidden. The rest of the site is
// completely unaffected either way.
const PHOTO_SCRIPT_URL = "";

// How long to wait for that script before giving up on photos. Photos are the
// least important thing on the page, so they never hold it up for long.
const PHOTO_FETCH_TIMEOUT_MS = 8000;

// --- The tabs of the workbook ---
// These describe the *structure* of the Sheet (not school-specific values), so
// they belong here.
//
//   name — exactly as it appears on the tab at the bottom of the workbook. Used
//          for the fallback route, and in every message a maintainer reads, so
//          keep it in step with the Sheet even though the site reads by gid.
//   gid  — the tab's permanent id. Click the tab in Google Sheets and read the
//          number after "#gid=" in the address bar. It never changes, not even
//          when the tab is renamed or moved — which is exactly why the site
//          reads by gid and not by name.
//
// A blank gid is allowed: that tab falls back to being read by name, and the
// site says so in ?debug. Fill it in when you can — the fallback route loses
// hidden rows and mistyped cells (see the warning above SHEET_CSV_BASE_URL).
const SHEET_TABS = {
  CONFIG:       { name: "Config",       gid: "0" },
  HOUSES:       { name: "Houses",       gid: "1461128519" },
  EVENTS:       { name: "Events",       gid: "2114075604" },
  RESULTS:      { name: "Results",      gid: "247364032" },
  EXTRA_POINTS: { name: "Extra Points", gid: "1106763823" },
  ROSTERS:      { name: "Rosters",      gid: "986693863" },
};

// --- The Photos tab is deliberately NOT fetched ---
// It is listed here rather than in SHEET_TABS so that the knowledge isn't lost,
// but data.js does not ask for it and the site makes no request for it at all.
//
// WHY. The whole photos feature is dormant (see PHOTO_SCRIPT_URL above): the tab
// is empty, no event names a photo_folder, and nothing on the site would display
// a photo if one arrived. Fetching it cost a request on every single page load
// to receive nothing, and — because the tab is hidden in the workbook, and a
// hidden tab's gid cannot be looked up — it could only be read by the unreliable
// name route, which put a permanent advisory in ?debug about a feature nobody is
// using. Neither price is worth paying for a switched-off feature.
//
// TO TURN PHOTOS BACK ON: unhide the tab in Google Sheets, copy the number after
// "#gid=" in the address bar, move this entry into SHEET_TABS above with that
// gid, and add it back to SHEET_TAB_PLAN in data.js (optional, affectsPoints
// false) and to SHEET_KEY_COLUMNS below. Every other piece of the photos code is
// still in place and untouched — see CLAUDE.md's photos section first, because
// there are unresolved questions about image size and Apps Script security.
const SHEET_TAB_PHOTOS_UNUSED = { name: "Photos", gid: "" };

// --- The columns each tab cannot do without ---
// Not every column — only the ones whose ABSENCE would change what the site
// publishes rather than merely leaving a gap on a page. A column that goes
// missing (renamed, deleted, or the whole tab quietly resolving to a different
// one) is invisible otherwise: every cell in it simply reads as empty and the
// site carries on computing confidently from what is left.
//
// validate.js compares this against the headers each tab actually arrived with.
const SHEET_KEY_COLUMNS = {
  Config:         ["key", "value"],
  Houses:         ["house_id", "name"],
  Events:         ["event_id", "date", "type", "status", "results_mode"],
  Results:        ["event_id", "gold_house", "silver_house", "bronze_house"],
  "Extra Points": ["house", "points"],
  Rosters:        ["event_id", "house", "participant_name"],
  // No Photos entry — that tab is not fetched at all (see above).
};
