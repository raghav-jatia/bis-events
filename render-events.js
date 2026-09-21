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
// SECTION 0 — the type filter, shared by both tables
// =====================================================================

/**
 * The three pills above each table. `type` null means "show everything".
 *
 * The icons and colour names are the ones the site already uses for an event's
 * type beside its name (typeIconHtml in render-shared.js) — a Sports pill and
 * a Sports row are marked the same way, so the pill explains itself.
 */
const EVENT_TYPE_FILTERS = [
  { key: "all", label: "All", type: null, tone: "all", icon: "" },
  {
    key: "sport",
    label: "Sports",
    type: EVENT_TYPE.SPORT,
    tone: "sport",
    icon: "medal",
  },
  {
    key: "cocurricular",
    label: "Co-curricular",
    type: EVENT_TYPE.COCURRICULAR,
    tone: "cc",
    icon: "star",
  },
];

/**
 * Which filter is chosen — ONE value for both pages, not one each.
 *
 * WHY SHARED. Completed Events and the Calendar are two views of the same list,
 * and somebody narrowing to Sports is usually doing that for as long as they
 * are thinking about sport, not for as long as they happen to be on one page.
 * It survives opening an event and pressing Back, too, which is the whole point:
 * browsing a filtered list, looking at one of its events and returning is the
 * ordinary way these pages get used.
 *
 * It is safe to share because the pills are on both pages and always show which
 * one is active — nothing is hidden without something on screen saying so.
 *
 * WHERE IT ENDS. Going Home clears it (navigation.js does that, on the one
 * function every view change goes through). Home is where somebody arrives and
 * where they go to start again, so it is the natural full stop — and it means a
 * filter can never be left on from a session the visitor has forgotten about.
 * It is not remembered across a reload either.
 */
let activeEventTypeFilter = "all";

/**
 * Clear the filter. Returns true only if it actually changed, so the caller
 * knows whether the tables need redrawing — reaching Home with nothing filtered
 * is the common case and must not cost a redraw.
 */
function resetEventTypeFilter() {
  if (activeEventTypeFilter === "all") return false;
  activeEventTypeFilter = "all";
  return true;
}

function eventTypeFilterByKey(key) {
  return EVENT_TYPE_FILTERS.find(function (entry) {
    return entry.key === key;
  }) || EVENT_TYPE_FILTERS[0];
}

/** Set the chosen filter. navigation.js calls this, then redraws both tables. */
function setEventTypeFilter(key) {
  activeEventTypeFilter = eventTypeFilterByKey(key).key;
}

/**
 * Is filtering meaningful on this page at all?
 *
 * Only when BOTH recognised types are present. With one type (or none), the
 * pills would be three buttons where two of them empty the table, so the row is
 * hidden — and, just as importantly, the filter is then ignored for this page.
 *
 * That second half matters because the choice is shared between the two pages:
 * without it, picking Co-curricular on the Calendar could leave a
 * Sports-only Completed Events page showing an empty table with no visible
 * control to undo it.
 */
function eventTypesPresent(events) {
  const known = [EVENT_TYPE.SPORT, EVENT_TYPE.COCURRICULAR];
  return known.filter(function (type) {
    return events.some(function (event) {
      return event.type === type;
    });
  });
}

/**
 * The events this page should actually draw.
 *
 * Note an event whose `type` is blank or unrecognised matches neither specific
 * filter, so it appears under "All" only. That is a data fault validate.js has
 * already reported against the exact cell; this is not the place to paper over
 * it, and "All" still shows it.
 */
function eventsPassingTypeFilter(events) {
  if (eventTypesPresent(events).length < 2) return events;

  const chosen = eventTypeFilterByKey(activeEventTypeFilter);
  if (!chosen.type) return events;

  return events.filter(function (event) {
    return event.type === chosen.type;
  });
}

/**
 * Draw one page's pill row, or hide it when this page has only one type.
 *
 * `events` is the page's FULL list, before filtering — otherwise choosing
 * Sports would leave only sports on the page, which would then look like a
 * one-type page and hide the very control needed to get back.
 */
function renderTypeFilter(containerId, events) {
  const container = el(containerId);
  if (!container) return;

  if (eventTypesPresent(events).length < 2) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }

  // ALREADY DRAWN: update the pressed state in place rather than rebuilding.
  //
  // This is a keyboard-accessibility fix, not an optimisation. Replacing the
  // markup destroys the very button the visitor just pressed Enter on, so focus
  // falls back to <body> and their next Tab starts again from the top of the
  // page — which makes the filter effectively unusable without a mouse. The
  // labels never change, so there is nothing to rebuild anyway.
  const existing = container.querySelectorAll(".tpill");
  if (existing.length === EVENT_TYPE_FILTERS.length) {
    Array.prototype.forEach.call(existing, function (button) {
      button.setAttribute(
        "aria-pressed",
        button.dataset.typeFilter === activeEventTypeFilter ? "true" : "false"
      );
    });
    container.hidden = false;
    return;
  }

  container.innerHTML = EVENT_TYPE_FILTERS.map(function (entry) {
    const isOn = entry.key === activeEventTypeFilter;
    return (
      '<button type="button" class="tpill ' + entry.tone + '" ' +
      'data-type-filter="' + entry.key + '" ' +
      'aria-pressed="' + (isOn ? "true" : "false") + '">' +
      (entry.icon ? '<span class="tico">' + icon(entry.icon) + "</span>" : "") +
      escapeHtml(entry.label) +
      "</button>"
    );
  }).join("");

  container.hidden = false;
}

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
function renderCompletedEventsTable(data, completed) {
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
  const completed = data.events
    .filter(hasTakenPlace)
    .sort(byDateNewestFirst);

  // The pills are built from the FULL list, and the table from the filtered
  // one. House Totals below are decided by `completed` too, never by what the
  // filter left on screen: the totals are the season standings, and narrowing
  // the table to Sports must not make the leaderboard look different.
  renderTypeFilter("events-filter", completed);
  renderCompletedEventsTable(data, eventsPassingTypeFilter(completed));

  if (completed.length === 0) {
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
  const all = data.events.slice().sort(byDateEarliestFirst);

  // Pills from the full season, rows from the filtered list — same split as
  // the Completed Events page above, and the same shared choice.
  renderTypeFilter("calendar-filter", all);
  const events = eventsPassingTypeFilter(all);

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
