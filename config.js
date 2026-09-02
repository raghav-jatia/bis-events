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
};

// --- The Google Sheet we read from ---
// The workbook "BIS Interhouse 2026-27", shared as "anyone with the link can
// view". data.js is the only file that should ever read these constants.
//
// If the site is ever pointed at a different workbook (e.g. a new season, or a
// different school in V4), this ID is the ONLY thing that changes here.
const SHEET_ID = "1M3KZG023o9iKTQoeqUHvtyYYQQeJITqcLjXMpVqcZgo";

// Google's "gviz" endpoint returns any tab as CSV without needing an API key
// or a per-tab "publish to web" link. data.js appends the query string.
// Full form: <base>?tqx=out:csv&headers=1&sheet=<TabName>
const SHEET_CSV_BASE_URL =
  "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq";

// --- Tab names, exactly as they appear at the bottom of the workbook ---
// These describe the *structure* of the Sheet (not school-specific values),
// so they belong here. Renaming a tab in Google Sheets means editing it here.
const SHEET_TABS = {
  CONFIG: "Config",
  HOUSES: "Houses",
  EVENTS: "Events",
  RESULTS: "Results",
  EXTRA_POINTS: "Extra Points",
  ROSTERS: "Rosters",
  PHOTOS: "Photos",
};
