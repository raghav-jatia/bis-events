// render-debug.js
// What this file does: draws the ?debug diagnostics panel (blueprint §17) — the
// on-screen version of everything validate.js found, for a maintainer who will
// never open the browser console.
//
// WHY THIS IS ITS OWN FILE. It is a TOOL, not part of the site. No visitor ever
// sees it, no other module reads anything from it, and nothing on the four
// public views depends on it. Keeping it separate means a student can read
// render.js to understand what people see, without wading through a diagnostics
// panel — and can change this panel freely knowing the site cannot break.
//
// It deliberately depends on utils.js ONLY (escapeHtml, formatTimestamp), not on
// render.js, so it stays self-contained.
//
// Public entry point: renderDebugPanel(data, warnings)
//   — draws nothing at all unless "?debug" is in the address.

/**
 * The four severities, most serious first, each with a plain explanation of
 * what that level actually means for the site. These keys match the levels
 * validate.js records (VALIDATION_LEVEL).
 */
const DEBUG_LEVELS = [
  {
    key: "fatal",
    label: "Fatal",
    blurb: "The site cannot show standings until this is fixed.",
  },
  {
    key: "error",
    label: "Errors",
    blurb: "Something was set aside, and points are affected.",
  },
  {
    key: "warning",
    label: "Warnings",
    blurb: "Worth a look, but no points were lost.",
  },
  {
    key: "advisory",
    label: "Advisory notes",
    blurb:
      "Low confidence — these can appear on data that is perfectly correct, " +
      "so treat them as questions rather than faults.",
  },
];

// isDebugRequested() lives in utils.js — main.js needs the same answer, because
// some of the diagnostics below cost extra requests and must only be gathered
// when this panel is actually going to be drawn.

/**
 * Turn one issue into a short, concrete instruction: which tab to open, which
 * row to find, which column to look at.
 *
 * Built from the tab/subject/cell every issue already carries, rather than
 * from the wording of individual messages — so a check added later gets a
 * sensible "how to fix" line for free.
 */
function debugFixHint(entry) {
  if (!entry.tab) return "";

  // Nothing to point AT — no row, no column. That happens for whole-tab or
  // whole-site problems ("the Config tab is empty", "the Sheet would not
  // load"), where the only thing this could say is the tab name, which the
  // panel already shows as a chip directly above the message. Adding a line
  // like "look through the rows" would be filler, and would be plainly wrong
  // when the trouble isn't in a row at all.
  if (!entry.subject && !entry.cell) return "";

  const where = entry.subject
    ? 'find the row for "' + escapeHtml(entry.subject) + '"'
    : "look through the rows";

  const what = entry.cell
    ? ' and check the <code>' + escapeHtml(entry.cell) + "</code> column"
    : "";

  return "Open the <strong>" + escapeHtml(entry.tab) + "</strong> tab, " +
    where + what + ".";
}

/** One issue, as a block of rows a maintainer can scan. */
function debugIssueHtml(entry) {
  const hint = debugFixHint(entry);

  return (
    '<li class="dbg-issue">' +
    '<div class="dbg-where">' +
    '<span class="dbg-tab">' + escapeHtml(entry.tab || "—") + "</span>" +
    (entry.subject ? '<span class="dbg-subject">' + escapeHtml(entry.subject) + "</span>" : "") +
    (entry.cell ? '<span class="dbg-cell">' + escapeHtml(entry.cell) + "</span>" : "") +
    "</div>" +
    '<div class="dbg-message">' + escapeHtml(entry.message) + "</div>" +
    (hint ? '<div class="dbg-hint">→ ' + hint + "</div>" : "") +
    "</li>"
  );
}

/**
 * Order the issues inside one severity group: by tab, then by subject.
 *
 * The point is practical — everything wrong with the same row ends up next to
 * each other, so a maintainer can open the Sheet once, fix that row completely,
 * and move on, instead of hopping between tabs and back again.
 */
function sortDebugEntries(entries) {
  return entries.slice().sort(function (a, b) {
    const byTab = String(a.tab || "").localeCompare(String(b.tab || ""));
    if (byTab !== 0) return byTab;

    const bySubject = String(a.subject || "").localeCompare(String(b.subject || ""));
    if (bySubject !== 0) return bySubject;

    // Same row, so keep a stable order by the column at fault.
    return String(a.cell || "").localeCompare(String(b.cell || ""));
  });
}

/** All the issues at one severity, as a titled group. */
function debugGroupHtml(level, entries) {
  if (entries.length === 0) return "";

  const heading =
    '<div class="dbg-grouphead">' +
    '<span class="dbg-level dbg-' + level.key + '">' + level.label + "</span>" +
    '<span class="dbg-count">' + entries.length + "</span>" +
    '<span class="dbg-blurb">' + level.blurb + "</span>" +
    "</div>";

  const list =
    '<ul class="dbg-list">' +
    sortDebugEntries(entries).map(debugIssueHtml).join("") +
    "</ul>";

  // EVERY group is open, advisories included. They used to start collapsed, on
  // the reasoning that a note which can fire on correct data shouldn't sit next
  // to real faults — but the people this panel is for are students who will not
  // think to open a toggle, and anything they don't see might as well not have
  // been written. The "treat these as questions, not faults" blurb above each
  // group is what keeps them in proportion; hiding them is not.
  const groupClass = level.key === "advisory"
    ? "dbg-group dbg-advisory-group"
    : "dbg-group";

  return '<div class="' + groupClass + '">' + heading + list + "</div>";
}

/** The "what the site is actually seeing" summary at the top. */
function debugSummaryHtml(data, counts) {
  const stat = function (label, value) {
    return '<div class="dbg-stat"><span>' + label + "</span><b>" + value + "</b></div>";
  };

  // How much data came through. Useful for spotting "the Sheet loaded but the
  // Results tab is empty" at a glance.
  const resultRows = !data ? "—" : data.events.reduce(function (total, event) {
    return total + (event.tier2 || []).length;
  }, 0);
  const rosterRows = !data ? "—" : data.events.reduce(function (total, event) {
    return total + (event.roster || []).length;
  }, 0);

  const fetched = data && data.loadedAt ? formatTimestamp(data.loadedAt) : "—";

  return (
    '<div class="dbg-stats">' +
    stat("Fatal", counts.fatal) +
    stat("Errors", counts.error) +
    stat("Warnings", counts.warning) +
    stat("Advisory", counts.advisory) +
    stat("Houses", data ? data.houses.length : "—") +
    stat("Events", data ? data.events.length : "—") +
    stat("Result rows", resultRows) +
    stat("Roster rows", rosterRows) +
    stat("Extra points", data ? data.extraPoints.length : "—") +
    "</div>" +
    '<div class="dbg-fetched">Data fetched: ' + escapeHtml(fetched) + "</div>"
  );
}

/**
 * Draw the diagnostics panel.
 *
 * Does nothing at all unless "?debug" is in the address — no markup, no work,
 * no effect on anything else on the page.
 *
 * `data` may be null: if the Sheet failed badly enough that the site cannot
 * render, this panel is exactly what a maintainer needs, so it still draws.
 */
function renderDebugPanel(data, warnings) {
  if (!isDebugRequested()) return;

  const issues = warnings || [];
  const counts = { fatal: 0, error: 0, warning: 0, advisory: 0 };
  issues.forEach(function (entry) {
    if (counts[entry.level] !== undefined) counts[entry.level]++;
  });

  const groups = DEBUG_LEVELS.map(function (level) {
    return debugGroupHtml(
      level,
      issues.filter(function (entry) {
        return entry.level === level.key;
      })
    );
  }).join("");

  // Nothing wrong at all — say so plainly rather than showing an empty panel.
  const body = issues.length === 0
    ? '<div class="dbg-clean">✓ No problems found — all data is reading correctly.</div>'
    : groups;

  const panel = document.getElementById("debug-panel");

  panel.innerHTML =
    '<div class="dbg-head">' +
    "<h2>Data check</h2>" +
    '<span class="dbg-note">Diagnostics for maintainers · add <code>?debug</code> to any page</span>' +
    "</div>" +
    debugSummaryHtml(data, counts) +
    body +
    '<div class="dbg-foot">This view is generated fresh from the Sheet every ' +
    "time it loads. Nothing here is saved, and there is no way to dismiss an " +
    "item — fix the data in the Sheet and reload, and it will disappear.</div>";

  panel.hidden = false;
}
