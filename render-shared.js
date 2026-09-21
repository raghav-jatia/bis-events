// render-shared.js
// What this file does: the small drawing helpers that MORE THAN ONE view needs,
// plus the site chrome (the header and the footer line) that appears on every
// view whichever one is open.
//
// The rule for what belongs here: it is used by at least two of render-home.js,
// render-events.js and render-detail.js. Anything only one view needs lives in
// that view's own file, not here — otherwise this becomes a junk drawer and
// nobody can tell what is shared any more.
//
// Same rule as every render file: this never calculates and never fetches.
//
// Public entry point: renderSiteChrome(data)
//   — everything else here is a helper the view files call.

// =====================================================================
// SECTION 1 — tiny DOM helpers
// =====================================================================

/** Shorthand for "the element with this id". */
function el(id) {
  return document.getElementById(id);
}

/**
 * Show or hide a whole section.
 *
 * Blueprint §11: "show if present, else omit" — a section with nothing in it is
 * hidden completely rather than rendered empty or with a "coming soon" message.
 */
function showSection(id, hasContent) {
  const node = el(id);
  if (node) node.hidden = !hasContent;
}

/**
 * Put HTML into a container and show or hide its section depending on whether
 * there was anything to put there.
 *
 * The container is ALWAYS written to, even when the html is empty. That matters
 * if the page is ever drawn twice (V2 will refresh live scores): writing an
 * empty string clears out the previous contents, so a hidden section can never
 * be left holding stale markup that reappears later.
 *
 * Returns true if the section is now visible.
 */
function fillOrHide(sectionId, containerId, html) {
  const hasContent = html !== "";
  el(containerId).innerHTML = html;
  showSection(sectionId, hasContent);
  return hasContent;
}

/** One of the SVG icons defined once at the top of index.html. */
function icon(name) {
  return '<svg class="ic"><use href="#i-' + name + '"/></svg>';
}

/**
 * The little numbered medal circle: gold for 1st, silver 2nd, bronze 3rd.
 *
 * Ranks beyond 3rd get a plain neutral token — the site must not assume there
 * are only ever three houses, because the Houses tab decides that.
 */
function rankToken(rank) {
  const style = rank >= 1 && rank <= 3 ? "rt" + rank : "rt4";
  return '<span class="rt ' + style + '">' + rank + "</span>";
}

// =====================================================================
// SECTION 2 — questions about events
// =====================================================================

/**
 * Has this event already happened?
 *
 * Two statuses mean "it has taken place": Completed (results are in) and
 * Results Pending (it happened, the results just haven't been entered yet).
 * Both belong in the lists of events that have been and gone — Completed
 * Events, Recent Results — and neither belongs under Upcoming.
 *
 * Note this is a question about LISTING, not about scoring. Whether an event's
 * points count towards the season is decided in one place only, by
 * countsTowardsSeason() in calculate.js, and that still accepts Completed
 * alone — so a Results Pending event is shown but scores nothing.
 */
function hasTakenPlace(event) {
  return (
    event.status === STATUS.COMPLETED ||
    event.status === STATUS.RESULTS_PENDING
  );
}

/**
 * Does this event have RESULTS worth putting in a results list?
 *
 * Stricter than hasTakenPlace on purpose, and the difference matters. The
 * homepage's "Just In" and "Recent Results" are showcases OF RESULTS, so an
 * event belongs there only if it has some: it must be Completed (a Results
 * Pending event has happened but has nothing to show yet) AND it must actually
 * have placings (a Completed event nobody has typed results into yet would
 * otherwise appear as a card with a blank space where the medals go, which
 * reads as a broken site rather than as "not entered yet").
 *
 * Those events are not hidden from the site — they are still listed on
 * Completed Events and the Calendar, where a status pill explains them.
 */
function hasResultsToShow(event) {
  return (
    event.status === STATUS.COMPLETED &&
    (event.tier1Display || []).length > 0
  );
}

/**
 * Put anything carrying a `date` into date order — events, and the Extra Points
 * rows, which have a date column too.
 *
 * There are deliberately TWO of these rather than one that gets negated: an
 * undated row must sink to the BOTTOM in both directions, and negating a
 * comparator would flip that rule along with the dates, floating the rows
 * nobody has finished filling in up to the top of the page.
 */
function byDateNewestFirst(a, b) {
  const dateA = parseSheetDate(a.date);
  const dateB = parseSheetDate(b.date);
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1; // undated always last
  if (!dateB) return -1;
  return dateB - dateA;
}

function byDateEarliestFirst(a, b) {
  const dateA = parseSheetDate(a.date);
  const dateB = parseSheetDate(b.date);
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1; // undated always last, here too
  if (!dateB) return -1;
  return dateA - dateB;
}

// =====================================================================
// SECTION 3 — houses on screen
// =====================================================================

/** Look a house up by id. Returns null if it isn't in the Houses tab. */
function findHouse(data, houseId) {
  return data.houses.find(function (house) {
    return house.id === houseId;
  }) || null;
}

/**
 * The house name, painted in that house's own colour from the Sheet.
 * This is the ONLY way a house colour reaches the screen — there is no house
 * colour anywhere in styles.css.
 */
function houseNameColoured(data, houseId) {
  const house = findHouse(data, houseId);
  if (!house) return "";
  return (
    '<span style="color:' + houseColour(house) + '">' +
    escapeHtml(house.name) +
    "</span>"
  );
}

/**
 * Has anything actually been scored in this standings table?
 *
 * Asked before drawing any leaderboard: a table of straight zeroes is hidden
 * rather than shown (§11), because a row of noughts reads as a broken site
 * rather than as "the season hasn't started".
 */
function hasAnyPoints(table) {
  return table.some(function (row) {
    return row.points !== 0;
  });
}

/**
 * The inline style for a house-coloured result box — used by the House Totals
 * band on Completed Events and by the result boxes on an event's own page.
 *
 * The border rule is the subtle part, and the reason this lives in one place:
 * for the LEADER we deliberately set no border at all, because an inline style
 * would beat the `.win` rule in the stylesheet and the gold winner outline
 * would silently never appear.
 */
function houseBoxStyle(colour, isLeader) {
  const background =
    "background:linear-gradient(180deg," +
    hexToRgba(colour, 0.2) + "," + hexToRgba(colour, 0.04) + ");";
  const border = isLeader ? "" : "border-color:" + hexToRgba(colour, 0.4) + ";";
  return background + border;
}

// =====================================================================
// SECTION 4 — the status pill and the event-type icon
// =====================================================================
// Both of these describe an EVENT rather than a house, and both appear on more
// than one view, which is why they live here rather than with either view.

/**
 * The coloured status pill: green Completed, orange Upcoming, red Live, neutral
 * blue Results Pending. Used by the Completed Events table and the Calendar.
 *
 * The statuses come from config.js, never from text typed here, so if the
 * Sheet's dropdown wording ever changes there is one place to update. A status
 * the site doesn't recognise still gets a calm neutral pill rather than no pill
 * at all — validate.js has already reported it to the maintainer.
 */
function statusPillHtml(status) {
  let styleClass = "st-other";
  let dot = "";

  if (status === STATUS.COMPLETED) {
    styleClass = "st-done";
  } else if (status === STATUS.UPCOMING) {
    styleClass = "st-up";
  } else if (status === STATUS.LIVE) {
    styleClass = "st-live";
    dot = '<span class="d"></span>'; // the gently pulsing red dot
  } else if (status === STATUS.RESULTS_PENDING) {
    // Neutral blue: the event happened, so this is not a warning — only the
    // results are still to come.
    styleClass = "st-pending";
  }

  return (
    '<span class="statusdot ' + styleClass + '">' + dot +
    escapeHtml(status || "—") + "</span>"
  );
}

/**
 * Which glyph represents this event's type: a medal for Sport, a star for
 * Co-curricular.
 *
 * Kept in one place because four different parts of the site need the same
 * answer: the Completed Events table, the Calendar, the homepage's Upcoming
 * cards and the Just In spotlight.
 */
function typeIconName(event) {
  return event.type === EVENT_TYPE.SPORT ? "medal" : "star";
}

/**
 * The small type icon beside an event name in a table. The colours are
 * event-TYPE colours from styles.css, not house colours — an event type doesn't
 * belong to a house.
 */
function typeIconHtml(event) {
  const isSport = event.type === EVENT_TYPE.SPORT;
  return (
    '<span class="tico ' + (isSport ? "sport" : "cc") + '">' +
    icon(typeIconName(event)) +
    "</span>"
  );
}

// =====================================================================
// SECTION 4b — where an event links to, in ONE place
// =====================================================================

/**
 * Would this event's Detail page actually show anything?
 *
 * The rule: is there ANYTHING on that page beyond the name, date and venue the
 * visitor can already read in the row they are looking at? If not, a link there
 * is a promise the page cannot keep, so no link is drawn at all — better a row
 * that plainly isn't clickable than one that invites a click and disappoints.
 *
 * Note this is a question about CONTENT, never about status. An Upcoming event
 * with a write-up is worth opening; a Completed event with nothing entered yet
 * is not.
 */
function hasSomethingToShow(event) {
  if (safeExternalUrl(event.minisiteUrl)) return true;
  if (String(event.writeup || "").trim() !== "") return true;
  if (String(event.resultNote || "").trim() !== "") return true;
  if ((event.roster || []).length > 0) return true;
  if ((event.photos || []).length > 0) return true;

  // Results only count when the page would really SHOW them. A Results Pending
  // event hides its results behind the "final results are awaited" message, so
  // whatever happens to be in the Sheet is not visible content yet.
  if (event.status !== STATUS.RESULTS_PENDING) {
    if ((event.tier1Display || []).length > 0) return true;
    if ((event.tier2 || []).some(function (category) {
      return (category.places || []).length > 0;
    })) return true;
  }

  return false;
}

/**
 * Where does this event's row lead, and what should the link honestly say?
 *
 * ONE answer for the whole site, so the Calendar, the Completed Events table
 * and the homepage's live banner can never drift apart.
 *
 * Returns { kind, label, url }:
 *   "minisite" → an external live page; url is set, open it in a new tab
 *   "detail"   → this site's own Event Detail view
 *   "none"     → draw no link and make nothing look clickable
 *
 * WHY ONLY *LIVE* EVENTS GO TO THE MINI-SITE. A mini-site is a live scoreboard,
 * which is exactly what somebody wants while an event is running — so for a Live
 * event it wins, and the label says "Watch live". Once the event is over, this
 * site's own Detail page is the better destination: it holds the results table,
 * the house placings and the write-up, and it links onward to the mini-site
 * anyway. Sending "View results" off-site would take the reader AWAY from the
 * results, and the label would stop being true.
 */
function eventDestination(event) {
  const minisite = safeExternalUrl(event.minisiteUrl);

  if (event.status === STATUS.LIVE && minisite) {
    return { kind: "minisite", label: "Watch live", url: minisite };
  }

  if (!hasSomethingToShow(event)) {
    return { kind: "none", label: "", url: "" };
  }

  // Only a Completed event has results to promise.
  const label = event.status === STATUS.COMPLETED ? "View results" : "View details";
  return { kind: "detail", label: label, url: "" };
}

/**
 * The link itself, as a table cell's worth of markup — or an empty string when
 * there is nowhere worth going.
 *
 * `pillClass` lets each table keep its own pill styling while the destination
 * and the wording stay shared.
 */
function eventLinkHtml(event, pillClass) {
  const destination = eventDestination(event);
  if (destination.kind === "none") return "";

  if (destination.kind === "minisite") {
    return (
      '<a class="' + pillClass + '" href="' + escapeHtml(destination.url) + '" ' +
      'target="_blank" rel="noopener noreferrer">' +
      escapeHtml(destination.label) + " " + icon("arrow") + "</a>"
    );
  }

  // Internal: navigation.js opens the Detail view from the data-event-id.
  return (
    '<span class="' + pillClass + '" data-event-id="' + escapeHtml(event.id) + '">' +
    escapeHtml(destination.label) + " " + icon("arrow") + "</span>"
  );
}

/**
 * The attribute that makes a whole ROW or CARD lead somewhere — the counterpart
 * to eventLinkHtml above, which draws the link INSIDE it.
 *
 * Returns one of:
 *   data-event-id  → opens this site's Detail view
 *   data-event-url → opens an external mini-site in a new tab
 *   ""             → nowhere to go, so nothing is marked clickable at all
 *
 * A Live event's row used to get nothing here, on the reasoning that opening a
 * new tab from a whole row would be a surprise. In practice it was the surprise
 * the other way round: every other row on the Calendar responds to a click
 * anywhere along it, and the one Live row responded only on the pill. Being
 * consistent with the rest of the table matters more than the theory, so a Live
 * row now carries its mini-site address and navigation.js opens it.
 *
 * Used by both event tables and the homepage's Upcoming cards, so all three
 * agree on what is clickable and none of them can invite a dead click.
 */
function eventTargetAttr(event) {
  const destination = eventDestination(event);

  if (destination.kind === "detail") {
    return ' data-event-id="' + escapeHtml(event.id) + '"';
  }
  if (destination.kind === "minisite") {
    return ' data-event-url="' + escapeHtml(destination.url) + '"';
  }
  return "";
}

// =====================================================================
// SECTION 5 — the site chrome (header and footer)
// =====================================================================
// These sit OUTSIDE the four views in index.html, so they are drawn once by
// main.js and stay on screen whichever view is open. They deliberately do not
// belong to the Home view: a view rendered without Home would otherwise lose
// the site's header.

/**
 * The sticky header. Every word of it comes from the Config tab.
 *
 * The logo is the gold tile built from school_short, unless a logo_url has
 * been filled in, in which case that image is used instead.
 */
function renderHeader(data) {
  const config = data.config;

  // The logo address is checked the same way as the mini-site link: a value
  // typed into a spreadsheet cell is untrusted, so only an ordinary web address
  // is allowed through. Anything else falls back to the gold school_short tile,
  // which is a perfectly good logo rather than a broken image.
  const markNode = el("brand-mark");
  const logoUrl = safeExternalUrl(config.logoUrl);
  if (logoUrl) {
    markNode.innerHTML =
      '<img src="' + escapeHtml(logoUrl) + '" alt="' +
      escapeHtml(config.schoolName) + ' logo">';
  } else {
    markNode.textContent = config.schoolShort || "";
  }

  el("brand-title").textContent = config.siteTitle || "";
  el("brand-sub").textContent = config.schoolName || "";

  // The season pill. (How current the results are is shown in the site footer
  // instead — see renderResultsAsOf.)
  el("year-pill").textContent = config.seasonLabel || "";

  // The browser tab title comes from the Sheet too.
  if (config.siteTitle) document.title = config.siteTitle;
}

/**
 * The quiet line in the SITE FOOTER saying how current the results are.
 *
 * It deliberately reports how current the RESULTS are, not when the page was
 * opened. A page-load clock would say "Updated 3:47 PM" even when the newest
 * result was three weeks ago, which tells a visitor nothing and implies the
 * standings are changing minute by minute.
 *
 * So it shows the date of the most recently completed event — the point up to
 * which these standings are complete — and says so in words. If nothing has
 * been completed yet there is nothing honest to say, so the line is hidden.
 *
 * It sits in the footer rather than the header because it is a footnote about
 * the data, not a headline; the footer is also outside the four views, so it
 * appears once on every page, on desktop and mobile alike.
 */
function renderResultsAsOf(data) {
  const latestCompleted = data.events
    .filter(function (event) {
      return event.status === STATUS.COMPLETED && parseSheetDate(event.date);
    })
    .sort(byDateNewestFirst)[0];

  const stamp = el("site-stamp");

  if (!latestCompleted) {
    stamp.textContent = "";
    stamp.hidden = true;
    return;
  }

  stamp.textContent = "Results as of " + formatDateWithYear(latestCompleted.date);
  stamp.hidden = false;
}

/**
 * Draw the parts of the page that belong to no single view: the header at the
 * top and the "results as of" line in the footer.
 *
 * main.js calls this once, before it draws any view.
 */
function renderSiteChrome(data) {
  renderHeader(data);
  renderResultsAsOf(data);
}
