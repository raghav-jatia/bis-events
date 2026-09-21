// render-events.js
// What this file does: draws the two views that are LISTS OF EVENTS —
// Completed Events, and the Calendar.
//
// They live together because they are the same thing twice over. Both are a
// .tablecard table of events; both put the event name in a gold header bar when
// the table reflows into cards on a phone; both use the shared status pill and
// event-type icon. Splitting them would mean keeping that knowledge in step
// across two files.
//
// What separates them is only WHICH events and in WHAT order:
//   Completed Events — events that have taken place, newest first, with their
//                      house placings and the season totals underneath.
//   Calendar         — every event of the season whatever its status, earliest
//                      first, which is what makes it a schedule rather than a
//                      results list.
//
// Same rule as every render file: this never calculates and never fetches.
//
// Public entry points:
//   renderCompletedEvents(data)
//   renderCalendar(data)

// =====================================================================
// SECTION 1 — Completed Events
// =====================================================================

/**
 * One placing cell of the table — the Gold, Silver or Bronze column.
 *
 * The TIE DISPLAY in a table works out naturally: the column heading is the
 * badge, so tied houses share one cell with their names joined by "&"
 * ("Beta & Alpha" under Gold), and the Silver column carries on as normal.
 *
 * A placing that was never awarded — or that validate.js set aside — leaves a
 * quiet dash rather than an error or a shuffled-up house (blueprint §11).
 */
function placingCellHtml(data, event, position, label) {
  // An event whose results are still awaited shows dashes, whatever happens to
  // be in the Sheet. Announcing placings for an event that is explicitly marked
  // "Results Pending" would contradict its own status pill.
  const group =
    event.status === STATUS.RESULTS_PENDING
      ? null
      : event.tier1Display.find(function (entry) {
          return entry.position === position;
        });

  if (!group) {
    return '<td data-label="' + label + '" class="hcell empty">—</td>';
  }

  const names = group.houseIds
    .map(function (houseId) {
      return houseNameColoured(data, houseId);
    })
    .join(' <span class="empty">&amp;</span> ');

  return '<td data-label="' + label + '" class="hcell">' + names + "</td>";
}

/**
 * The table of events that have taken place, latest first.
 *
 * This includes Results Pending events: the event happened, so it belongs in
 * the list. Its Gold/Silver/Bronze cells come out as quiet dashes, because
 * placingCellHtml finds nothing in tier1Display, and its status pill is the
 * neutral blue one rather than the green "Completed".
 *
 * Each row carries data-event-id so navigation.js can open that event's
 * Detail page.
 */
function renderCompletedEventsTable(data) {
  const completed = data.events
    .filter(hasTakenPlace)
    .sort(byDateNewestFirst);

  const rows = completed
    .map(function (event) {
      return (
        "<tr" + eventTargetAttr(event) + ">" +
        // Date
        '<td data-label="Date" class="ev-date">' +
        escapeHtml(formatTableDate(event.date)) +
        "</td>" +
        // Event name — becomes the gold header bar when the table reflows
        // into cards on mobile, hence the mobile-head class.
        '<td class="mobile-head" data-label=""><div class="ev-name">' +
        typeIconHtml(event) +
        escapeHtml(event.name) +
        "</div></td>" +
        // Details pill, wording and destination from the shared rule in
        // render-shared.js. Empty for an event with nothing on its page, so
        // nothing here looks clickable when there is nowhere to go.
        '<td data-label="Details">' + eventLinkHtml(event, "viewcue") + "</td>" +
        // The three placings
        placingCellHtml(data, event, 1, "Gold") +
        placingCellHtml(data, event, 2, "Silver") +
        placingCellHtml(data, event, 3, "Bronze") +
        // Status — the shared pill helper, so Completed reads green and
        // Results Pending reads neutral blue. (This used to hardcode the green
        // "done" style, which was fine when only Completed events appeared.)
        '<td data-label="Status">' + statusPillHtml(event.status) + "</td>" +
        "</tr>"
      );
    })
    .join("");

  el("events-rows").innerHTML = rows;
  showSection("events-table-card", rows !== "");
  showSection("events-none", rows === "");

  return completed.length;
}

/**
 * The House Totals band beneath the table: one box per house in rank order,
 * rank badge sitting in the left third, name and points centred, leader gold.
 *
 * These are the SEASON overall standings — the same numbers as the homepage
 * leaderboard, shown in the prototype's wider box style.
 */
function renderEventsTotals(data) {
  const table = data.standings.overall;

  const html = !hasAnyPoints(table) ? "" : table
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      const colour = houseColour(house);
      const isLeader = row.rank === 1;

      return (
        '<div class="tbox' + (isLeader ? " win" : "") + '" style="' +
        houseBoxStyle(colour, isLeader) + '">' +
        rankToken(row.rank) +
        '<span class="tl" style="color:' + colour + '">' +
        escapeHtml(house ? house.name : "") +
        "</span>" +
        '<span class="tv" style="color:' + colour + '">' +
        formatPoints(row.points) +
        "</span>" +
        "</div>"
      );
    })
    .join("");

  fillOrHide("events-totals-band", "events-totals", html);
}

/**
 * The light footnote under the totals: a small chip per house that has any
 * extra points, making clear those points are already inside the totals above.
 */
function renderEventsExtraNote(data) {
  const chips = data.standings.extra
    .filter(function (row) {
      return row.points !== 0;
    })
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      if (!house) return "";
      const colour = houseColour(house);

      return (
        '<span class="echip" style="color:' + colour +
        ";border-color:" + hexToRgba(colour, 0.4) + '">' +
        escapeHtml(house.name) + " " + formatSignedPoints(row.points) +
        "</span>"
      );
    })
    .join("");

  fillOrHide("events-extranote", "events-chips", chips);
}

/**
 * Draw the whole Completed Events view: table, totals band, extra-points note.
 *
 * If nothing has been completed yet, the table is replaced by a short calm
 * line and the totals band and footnote are hidden — rather than an empty
 * table with headings and no rows.
 */
function renderCompletedEvents(data) {
  const completedCount = renderCompletedEventsTable(data);

  if (completedCount === 0) {
    // Clear as well as hide, so nothing stale can reappear on a later redraw.
    fillOrHide("events-totals-band", "events-totals", "");
    fillOrHide("events-extranote", "events-chips", "");
    return;
  }

  renderEventsTotals(data);
  renderEventsExtraNote(data);
}

// =====================================================================
// SECTION 2 — Calendar
// =====================================================================

/**
 * The Details cell of a calendar row.
 *
 * Where it goes and what it says are NOT decided here — eventDestination() in
 * render-shared.js answers that once for the whole site, so this table, the
 * Completed Events table and the homepage's live banner always agree.
 *
 * The cell comes out completely empty when the event has nothing on its page,
 * which is deliberate: the mobile stylesheet hides an empty cell rather than
 * showing a bare "Details" label with nothing beside it.
 */
function calendarDetailsCellHtml(event) {
  const destination = eventDestination(event);

  // A Live event heading to its mini-site keeps the red "watch this now"
  // treatment; everything else uses the ordinary gold pill.
  const pillClass = destination.kind === "minisite" ? "cal-link live" : "cal-link";

  return '<td data-label="Details">' + eventLinkHtml(event, pillClass) + "</td>";
}

/**
 * The whole season's schedule, earliest first — every event whatever its
 * status, which is what makes this the calendar rather than a results list.
 *
 * Events with no usable date sort to the bottom instead of disappearing, so a
 * half-filled row is still visible to whoever needs to fix it.
 */
function renderCalendar(data) {
  const events = data.events.slice().sort(byDateEarliestFirst);

  const rows = events
    .map(function (event) {
      return (
        "<tr" + eventTargetAttr(event) + ">" +
        '<td data-label="Date" class="ev-date">' +
        escapeHtml(formatTableDate(event.date)) +
        "</td>" +
        // The event name becomes the gold header bar when the table reflows
        // into cards on mobile.
        '<td class="mobile-head" data-label=""><div class="ev-name">' +
        typeIconHtml(event) +
        escapeHtml(event.name) +
        "</div></td>" +
        '<td data-label="Grades" class="ev-grades">' +
        escapeHtml(event.grades) +
        "</td>" +
        calendarDetailsCellHtml(event) +
        '<td data-label="Status">' + statusPillHtml(event.status) + "</td>" +
        "</tr>"
      );
    })
    .join("");

  el("calendar-rows").innerHTML = rows;
  showSection("calendar-table-card", rows !== "");
  showSection("calendar-none", rows === "");
}
