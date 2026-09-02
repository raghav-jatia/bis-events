// render.js
// What this file does: turns values that have ALREADY been worked out into
// things you can see on the page.
//
// The one rule that matters here: this file never calculates and never fetches.
// If a number appears on screen, calculate.js worked it out; render.js only
// decides what it looks like. If you find yourself adding a "+" between two
// point values in this file, it belongs in calculate.js instead.
//
// (The one kind of arithmetic that IS allowed here is layout geometry — how
// wide to draw a bar in pixels or percent. That is a drawing decision, not a
// points decision, and it never changes a total.)
//
// Nothing about this school is written into this file. House names and colours
// come from data.houses, which came from the Houses tab of the Sheet.
//
// Public entry point (so far): renderHomepage(data)
//
// STILL TO COME: the Completed Events, Event Detail and Calendar views, and the
// wiring of the nav links / mobile menu (navigation.js).

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
function showSection(id, hasSomethingToShow) {
  const node = el(id);
  if (node) node.hidden = !hasSomethingToShow;
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

/** Look a house up by id. Returns null if it isn't in the Houses tab. */
function findHouse(data, houseId) {
  return data.houses.find(function (house) {
    return house.id === houseId;
  }) || null;
}

/** A house's name, safely escaped for putting into HTML. */
function houseNameHtml(data, houseId) {
  const house = findHouse(data, houseId);
  return escapeHtml(house ? house.name : "");
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

// =====================================================================
// SECTION 2 — header and hero
// =====================================================================

/**
 * The sticky header. Every word of it comes from the Config tab.
 *
 * The logo is the gold tile built from school_short, unless a logo_url has
 * been filled in, in which case that image is used instead.
 */
function renderHeader(data) {
  const config = data.config;

  const markNode = el("brand-mark");
  if (config.logoUrl) {
    markNode.innerHTML =
      '<img src="' + escapeHtml(config.logoUrl) + '" alt="' +
      escapeHtml(config.schoolName) + ' logo">';
  } else {
    markNode.textContent = config.schoolShort || "";
  }

  el("brand-title").textContent = config.siteTitle || "";
  el("brand-sub").textContent = config.schoolName || "";

  // The season pill. (How current the results are is shown in the site footer
  // instead — see renderResultsAsOf.)
  el("year-pill").textContent = config.seasonLabel || "";
  renderResultsAsOf(data);

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
 * The hero: trophy, big championship title, season underneath.
 *
 * The title uses an optional `hero_title` key from Config if one has been
 * added, and otherwise falls back to site_title — so the wording stays a
 * spreadsheet decision either way.
 */
function renderHero(data) {
  const config = data.config;
  const heroTitle = (config.raw && config.raw.hero_title) || config.siteTitle || "";

  el("hero-title").textContent = heroTitle;
  el("hero-year").textContent = config.seasonLabel || "";
  showSection("hero-year", !!config.seasonLabel);
}

// =====================================================================
// SECTION 3 — House Points Leaderboard
// =====================================================================

/**
 * The three big boxes at the top, in rank order, leader outlined in gold.
 *
 * Every value here is read straight from standings.overall — the rank, the
 * points and the order were all decided by calculate.js.
 *
 * Joint first place: because these boxes are one-per-house rather than
 * one-per-placing, two houses tied at rank 1 each get their own gold "1" token
 * and each get the gold winner outline. (The "Beta & Alpha" single-badge style
 * is for placings, and is used in Latest Results below.)
 */
function renderLeaderboard(data) {
  const table = data.standings.overall;

  // Nothing scored yet → hide the section rather than show a row of zeros.
  const anyPoints = table.some(function (row) {
    return row.points !== 0;
  });

  const html = !anyPoints ? "" : table
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      const colour = houseColour(house);
      const isLeader = row.rank === 1;

      return (
        '<div class="hbox' + (isLeader ? " win" : "") + '">' +
        '<div class="strip" style="background:' + colour + '"></div>' +
        '<div class="rankbadge">' + rankToken(row.rank) + "</div>" +
        '<div class="bname" style="color:' + colour + '">' +
        escapeHtml(house ? house.name : "") +
        "</div>" +
        '<div class="bpts" style="color:' + colour + '">' +
        formatPoints(row.points) +
        "</div>" +
        '<div class="blab">Points</div>' +
        "</div>"
      );
    })
    .join("");

  fillOrHide("sec-leaderboard", "leaderboard", html);
}

// =====================================================================
// SECTION 4 — By Category (Sports / Co-curricular)
// =====================================================================

/**
 * One panel per strand, each a rank-ordered list of houses with a bar.
 *
 * The bar WIDTH is the only number this file works out, and it is pure
 * geometry: the leader's bar is full width and everyone else is drawn in
 * proportion to it. It never changes anybody's points.
 */
function buildCategoryPanel(data, title, iconName, table) {
  // A strand with nothing scored in it produces no panel at all.
  const anyPoints = table.some(function (row) {
    return row.points !== 0;
  });
  if (!anyPoints) return "";

  const highest = Math.max.apply(
    null,
    table.map(function (row) {
      return row.points;
    })
  );

  const rows = table
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      const colour = houseColour(house);

      // Proportional bar. Guarded so an all-zero table cannot divide by zero.
      const width = highest > 0 ? Math.max(0, (row.points / highest) * 100) : 0;

      return (
        '<div class="minirow"><div>' +
        '<div class="mh" style="color:' + colour + '">' +
        rankToken(row.rank) +
        escapeHtml(house ? house.name : "") +
        "</div>" +
        '<div class="mt"><div class="fill" style="width:' + width.toFixed(1) + "%;" +
        "background:linear-gradient(90deg," + hexToRgba(colour, 0.5) + "," + colour + ");" +
        "box-shadow:0 0 12px " + hexToRgba(colour, 0.4) + '"></div></div>' +
        "</div>" +
        '<div class="mp" style="color:' + colour + '">' +
        formatPoints(row.points) +
        "</div></div>"
      );
    })
    .join("");

  return "<h3><span class='ico'>" + icon(iconName) + "</span>" + title + "</h3>" + rows;
}

function renderByCategory(data) {
  const standings = data.standings;

  const sportsHtml = buildCategoryPanel(data, "Sports", "medal", standings.sports);
  const cocurricularHtml = buildCategoryPanel(
    data, "Co-curriculars", "star", standings.cocurricular
  );

  // Each panel appears only if its own strand has something in it, and the
  // whole section disappears if neither does.
  const hasSports = fillOrHide("cat-sports", "cat-sports", sportsHtml);
  const hasCocurricular = fillOrHide(
    "cat-cocurricular", "cat-cocurricular", cocurricularHtml
  );
  showSection("sec-category", hasSports || hasCocurricular);
}

// =====================================================================
// SECTION 5 — Extra Points (collapsible cards)
// =====================================================================

/**
 * One collapsible card per house that has any extra points, in rank order.
 *
 * The TOTAL on the card comes from standings.extra (calculated). The individual
 * reason/date/points lines are the raw rows from the Extra Points tab, simply
 * filtered to this house and shown newest first — no adding up happens here.
 */
function renderExtraPoints(data) {
  const cards = data.standings.extra
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      if (!house) return "";

      // This house's own rows, newest first.
      const entries = data.extraPoints
        .filter(function (entry) {
          return entry.houseId === row.houseId;
        })
        .sort(function (a, b) {
          const dateA = parseSheetDate(a.date);
          const dateB = parseSheetDate(b.date);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1; // undated rows sink to the bottom
          if (!dateB) return -1;
          return dateB - dateA;
        });

      // A house with no awards at all gets no card (blueprint §11).
      if (entries.length === 0) return "";

      const colour = houseColour(house);

      const lines = entries
        .map(function (entry) {
          return (
            '<div class="erow">' +
            '<span class="rr">' + escapeHtml(entry.reason) + "</span>" +
            '<span class="rd">' + escapeHtml(formatShortDate(entry.date)) + "</span>" +
            '<span class="rp">' + formatSignedPoints(entry.points) + "</span>" +
            "</div>"
          );
        })
        .join("");

      return (
        '<div class="ecard" style="border-top-color:' + colour + '">' +
        '<button class="ehead" type="button" aria-expanded="false">' +
        '<span class="eh" style="color:' + colour + '">' +
        escapeHtml(house.name) +
        "</span>" +
        '<span class="ehright"><span class="etot" style="color:' + colour + '">' +
        formatSignedPoints(row.points) +
        '</span><span class="chev">' + icon("chev") + "</span></span>" +
        "</button>" +
        '<div class="edetails">' +
        '<div class="ehdr"><span>Reason</span><span>Date</span><span>Pts</span></div>' +
        lines +
        "</div></div>"
      );
    })
    .join("");

  if (!fillOrHide("sec-extra", "extra", cards)) return;

  // Expand/collapse. This is a component behaviour belonging to this card, not
  // page navigation, so it is wired here rather than in navigation.js.
  Array.prototype.forEach.call(
    el("extra").querySelectorAll(".ehead"),
    function (button) {
      button.addEventListener("click", function () {
        const card = button.closest(".ecard");
        const nowOpen = card.classList.toggle("open");
        button.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      });
    }
  );
}

// =====================================================================
// SECTION 6 — Latest Results
// =====================================================================

/**
 * Sort helpers. There are deliberately TWO of these rather than one that gets
 * negated: an undated event must sink to the bottom in BOTH directions, and
 * negating a comparator would flip that rule along with the dates, floating
 * undated events to the top.
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

/**
 * The placings for one event, as coloured medal badges.
 *
 * This is where the confirmed TIE DISPLAY lives: calculate.js has already
 * grouped tied houses into a single placing, so a tie renders as ONE medal
 * token followed by the tied house names joined by "&" — "1 Beta & Alpha" —
 * and the next placing carries on normally. Each name still shows in its own
 * house colour, so a tie doesn't lose that.
 */
function renderPlacings(data, event) {
  return event.tier1Display
    .map(function (group) {
      const names = group.houseIds
        .map(function (houseId) {
          return houseNameColoured(data, houseId);
        })
        .join('<span class="amp">&amp;</span>');

      return '<span class="pl">' + rankToken(group.position) + names + "</span>";
    })
    .join("");
}

/**
 * The last two completed events, with their house placings.
 *
 * Note this deliberately shows the EVENT's placings (who came 1st/2nd/3rd in
 * that event), not season standings — blueprint §4's one exception to
 * rank-ordering everything by season position.
 */
function renderLatestResults(data) {
  const completed = data.events
    .filter(function (event) {
      return event.status === STATUS.COMPLETED;
    })
    .sort(byDateNewestFirst)
    .slice(0, 2);

  const html = completed
    .map(function (event) {
      const dateText = formatLongDate(event.date);
      const meta = [dateText, event.type].filter(Boolean).join(" · ");
      const placings = renderPlacings(data, event);

      return (
        // data-event-id is what navigation.js will use to open the Detail view.
        '<div class="lcard" data-event-id="' + escapeHtml(event.id) + '">' +
        '<div class="cup">' + icon("trophy") + "</div>" +
        '<div class="lc-t">' +
        '<div class="lc-date">' + escapeHtml(meta) + "</div>" +
        '<div class="lc-name">' + escapeHtml(event.name) + "</div>" +
        (placings ? '<div class="places">' + placings + "</div>" : "") +
        "</div>" +
        '<span class="go">' + icon("arrow") + "</span>" +
        "</div>"
      );
    })
    .join("");

  fillOrHide("sec-latest", "latest", html);
}

// =====================================================================
// SECTION 7 — Upcoming
// =====================================================================

/**
 * The next three events that haven't happened yet, soonest first.
 * The icon follows the event type, using the values from config.js.
 */
function renderUpcoming(data) {
  const upcoming = data.events
    .filter(function (event) {
      return event.status === STATUS.UPCOMING;
    })
    .sort(byDateEarliestFirst) // soonest first
    .slice(0, 3);

  const html = upcoming
    .map(function (event) {
      const parts = dateParts(event.date);
      const iconName = event.type === EVENT_TYPE.SPORT ? "medal" : "star";

      return (
        '<div class="ucard" data-event-id="' + escapeHtml(event.id) + '">' +
        '<span class="evicon">' + icon(iconName) + "</span>" +
        '<div class="en">' + escapeHtml(event.name) + "</div>" +
        (parts
          ? '<div class="datebox"><span class="d">' + parts.day +
            '</span><span class="mo">' + parts.month + "</span></div>"
          : "") +
        "</div>"
      );
    })
    .join("");

  fillOrHide("sec-upcoming", "upcoming", html);
}

// =====================================================================
// SECTION 8 — Completed Events view
// =====================================================================

/**
 * The small type icon beside an event name: a medal for Sport, a star for
 * Co-curricular. The colours are event-TYPE colours from styles.css, not house
 * colours — an event type doesn't belong to a house.
 */
function typeIconHtml(event) {
  const isSport = event.type === EVENT_TYPE.SPORT;
  return (
    '<span class="tico ' + (isSport ? "sport" : "cc") + '">' +
    icon(isSport ? "medal" : "star") +
    "</span>"
  );
}

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
  const group = event.tier1Display.find(function (entry) {
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
 * The table of completed events, latest first.
 *
 * Each row carries data-event-id so navigation.js can later make the row open
 * that event's Detail page. Nothing is wired up yet, which is why the row is
 * not marked clickable — it would look interactive without being so.
 */
function renderCompletedEventsTable(data) {
  const completed = data.events
    .filter(function (event) {
      return event.status === STATUS.COMPLETED;
    })
    .sort(byDateNewestFirst);

  const rows = completed
    .map(function (event) {
      return (
        '<tr data-event-id="' + escapeHtml(event.id) + '">' +
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
        // Details pill (inert until navigation.js)
        '<td data-label="Details"><span class="viewcue">View details ' +
        icon("arrow") +
        "</span></td>" +
        // The three placings
        placingCellHtml(data, event, 1, "Gold") +
        placingCellHtml(data, event, 2, "Silver") +
        placingCellHtml(data, event, 3, "Bronze") +
        // Status
        '<td data-label="Status"><span class="statusdot st-done">' +
        escapeHtml(event.status) +
        "</span></td>" +
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

  const anyPoints = table.some(function (row) {
    return row.points !== 0;
  });

  const html = !anyPoints ? "" : table
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      const colour = houseColour(house);
      const isLeader = row.rank === 1;

      // The house's own tinted background, built from its Sheet colour.
      //
      // Note the border: for the leader we deliberately DON'T set it inline,
      // because an inline style would beat the .win rule in the stylesheet and
      // the gold winner outline would never appear.
      const background =
        "background:linear-gradient(180deg," +
        hexToRgba(colour, 0.2) + "," + hexToRgba(colour, 0.04) + ");";
      const border = isLeader ? "" : "border-color:" + hexToRgba(colour, 0.4) + ";";

      return (
        '<div class="tbox' + (isLeader ? " win" : "") + '" style="' +
        background + border + '">' +
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
// SECTION 9 — Event Detail view
// =====================================================================

/**
 * The house result boxes at the top of a detail page.
 *
 * Two shapes, per blueprint §6.3:
 *   Calculated — house name AND its Tier-2 tally for this event (the number of
 *                individual points its competitors earned).
 *   Direct     — house name only. There is no per-house tally to show, because
 *                the placings were entered directly rather than added up.
 *
 * Ordering and rank badges come from the finishing order calculate.js worked
 * out; the leader keeps the gold outline.
 */
function renderDetailTotals(data, event) {
  const isCalculated = event.resultsMode === RESULTS_MODE.CALCULATED;

  // Calculated events rank on the Tier-2 tally; Direct events have only the
  // placings themselves. Either way we end up with rows of {houseId, rank}.
  const rows = isCalculated
    ? event.tier2Tally
        .filter(function (entry) {
          return entry.rank !== null; // houses that scored nothing don't place
        })
        .map(function (entry) {
          return { houseId: entry.houseId, rank: entry.rank, points: entry.points };
        })
    : event.tier1.map(function (award) {
        return { houseId: award.houseId, rank: award.position, points: null };
      });

  const html = rows
    .map(function (row) {
      const house = findHouse(data, row.houseId);
      const colour = houseColour(house);
      const isLeader = row.rank === 1;

      // Same inline-vs-.win rule as the Completed Events totals: never set the
      // leader's border inline, or it would beat the gold .win rule.
      const background =
        "background:linear-gradient(180deg," +
        hexToRgba(colour, 0.2) + "," + hexToRgba(colour, 0.04) + ");";
      const border = isLeader ? "" : "border-color:" + hexToRgba(colour, 0.4) + ";";

      return (
        '<div class="dtbox' + (isLeader ? " win" : "") + '" style="' +
        background + border + '">' +
        rankToken(row.rank) +
        '<span class="ph" style="color:' + colour + '">' +
        escapeHtml(house ? house.name : "") +
        "</span>" +
        (row.points === null
          ? ""
          : '<span class="score" style="color:' + colour + '">' +
            formatPoints(row.points) + "</span>") +
        "</div>"
      );
    })
    .join("");

  fillOrHide("detail-totals", "detail-totals", html);
}

/**
 * One cell of the "Results by category" table.
 *
 * The participant's NAME is shown, painted in their house's colour — this
 * table is about who won, so the name leads and the colour says which house.
 *
 * A tie at a place puts both winners in the same cell joined by "&" (the
 * column heading is the badge). A place that was never awarded — SWIM's
 * Under-19 bronze, for instance — renders as a quiet dash, never an error and
 * never by promoting somebody up into the gap.
 */
function categoryCellHtml(data, category, rank, label) {
  const places = category.places.filter(function (place) {
    return place.rank === rank;
  });

  if (places.length === 0) {
    return '<td data-label="' + label + '" class="empty">—</td>';
  }

  const names = places
    .map(function (place) {
      const house = findHouse(data, place.houseId);
      return (
        '<span style="color:' + houseColour(house) + ';font-weight:700">' +
        escapeHtml(place.name) +
        "</span>"
      );
    })
    .join(' <span class="empty">&amp;</span> ');

  return '<td data-label="' + label + '">' + names + "</td>";
}

/** The Sport variant's category table. Hidden entirely for Direct events. */
function renderDetailCategories(data, event) {
  // Only Calculated events have individual results to show.
  const categories =
    event.resultsMode === RESULTS_MODE.CALCULATED ? event.tier2 || [] : [];

  const rows = categories
    .map(function (category) {
      return (
        "<tr>" +
        // The category name doubles as the gold header bar on mobile.
        '<td class="mobile-head cat-name" data-label="">' +
        escapeHtml(category.category) +
        "</td>" +
        categoryCellHtml(data, category, 1, "Gold") +
        categoryCellHtml(data, category, 2, "Silver") +
        categoryCellHtml(data, category, 3, "Bronze") +
        "</tr>"
      );
    })
    .join("");

  fillOrHide("detail-categories", "detail-category-rows", rows);
}

/**
 * Turn a write-up from the Sheet into safe HTML.
 *
 * The ONE piece of markup a maintainer may type is <highlight>…</highlight>,
 * which renders gold. Everything else must appear as literal text.
 *
 * The order here is the important part: escape the whole string FIRST, so
 * anything typed into the cell is inert, and only THEN turn the escaped
 * <highlight> markers back into a real span. That way no other tag can ever
 * survive, however the cell was filled in.
 */
function renderWriteupHtml(text) {
  let safe = escapeHtml(text);

  const openCount = (safe.match(/&lt;highlight&gt;/g) || []).length;
  const closeCount = (safe.match(/&lt;\/highlight&gt;/g) || []).length;

  safe = safe
    .replace(/&lt;highlight&gt;/g, '<span class="hl">')
    .replace(/&lt;\/highlight&gt;/g, "</span>");

  // A forgotten closing tag would otherwise turn the rest of the page gold.
  for (let i = closeCount; i < openCount; i++) {
    safe += "</span>";
  }

  // Blank lines become new paragraphs; single line breaks stay line breaks.
  return safe
    .split(/\n{2,}/)
    .map(function (paragraph) {
      return "<p>" + paragraph.replace(/\n/g, "<br>") + "</p>";
    })
    .join("");
}

/** The Highlights write-up. Shown only if one has been written (§11). */
function renderDetailHighlights(event) {
  const html = event.writeup ? renderWriteupHtml(event.writeup) : "";
  fillOrHide("detail-highlights", "detail-writeup", html);
}

/**
 * Team rosters, one card per house, in the event's finishing order.
 *
 * A house with nobody listed gets no card at all, so a partly-filled Rosters
 * tab still looks deliberate.
 */
function renderDetailRosters(data, event) {
  // Finishing order first, then any remaining houses in Houses-tab order, so
  // every house with a roster appears even if it didn't place.
  const placedOrder = event.tier1.map(function (award) {
    return award.houseId;
  });
  const orderedHouses = data.houses.slice().sort(function (a, b) {
    const rankA = placedOrder.indexOf(a.id);
    const rankB = placedOrder.indexOf(b.id);
    if (rankA === -1 && rankB === -1) return 0;
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  });

  const cards = orderedHouses
    .map(function (house) {
      const members = (event.roster || []).filter(function (member) {
        return member.houseId === house.id;
      });
      if (members.length === 0) return "";

      const colour = houseColour(house);

      return (
        '<div class="roster">' +
        '<h4 style="color:' + colour + ";background:" + hexToRgba(colour, 0.14) + '">' +
        '<span class="dot" style="background:' + colour + '"></span>' +
        escapeHtml(house.name) +
        "</h4><ul>" +
        members
          .map(function (member) {
            return (
              '<li style="color:' + colour + ';font-weight:700">' +
              escapeHtml(member.name) +
              "</li>"
            );
          })
          .join("") +
        "</ul></div>"
      );
    })
    .join("");

  fillOrHide("detail-teams", "detail-rosters", cards);
}

/**
 * The photo gallery. Hidden until there are photos — the Drive-folder script
 * (blueprint §9) is not wired up yet, so today this only shows rows from the
 * Photos tab.
 */
function renderDetailPhotos(event) {
  const photos = (event.photos || []).filter(function (photo) {
    return !!photo.url;
  });

  const html = photos
    .map(function (photo) {
      return (
        '<img class="photo" src="' + escapeHtml(photo.url) +
        '" alt="' + escapeHtml(photo.caption || "") + '" loading="lazy">'
      );
    })
    .join("");

  fillOrHide("detail-photos", "detail-gallery", html);
}

/**
 * The optional "Live Mini-Site" section, from the Events tab's minisite_url.
 *
 * Shown only when a usable web address has been entered (§11). The address is
 * put through safeExternalUrl first, so a mistyped or unsafe value hides the
 * section rather than producing a broken or dangerous link. The link opens in a
 * new tab with rel="noopener", so the mini-site can never reach back into this
 * page through window.opener.
 */
function renderDetailMinisite(event) {
  const url = safeExternalUrl(event.minisiteUrl);

  // Just the button — no heading, no explanatory box. The wording says what it
  // is, and it sits directly under the results where it will be seen.
  const html = !url ? "" :
    '<a class="minisite-btn" href="' + escapeHtml(url) + '" ' +
    'target="_blank" rel="noopener noreferrer">' +
    "Click here for further event details " + icon("arrow") + "</a>";

  fillOrHide("detail-minisite", "detail-minisite-body", html);
}

/**
 * Draw the Event Detail view for one event.
 *
 * The same function serves both variants — a Sport shows its category table,
 * a Co-curricular shows its write-up and team rosters — because each section
 * simply hides itself when the event has no data for it.
 *
 * Returns false if the event id doesn't exist, so the caller can decide what
 * to do rather than leaving a half-drawn page.
 */
function renderEventDetail(data, eventId) {
  const event = data.events.find(function (candidate) {
    return candidate.id === eventId;
  });
  if (!event) {
    console.warn('render.js: no event with id "' + eventId + '".');
    return false;
  }

  el("detail-title").textContent = event.name;

  // Date · venue, with either part left out if it isn't filled in (§11).
  // Deliberately no type or status flag here, per blueprint §6.3.
  const meta = [formatFullDate(event.date), event.venue].filter(Boolean).join(" · ");
  el("detail-meta").textContent = meta;
  el("detail-meta").hidden = meta === "";

  renderDetailTotals(data, event);
  renderDetailCategories(data, event);
  renderDetailHighlights(event);
  renderDetailMinisite(event); // sits directly below the results
  renderDetailRosters(data, event);
  renderDetailPhotos(event);

  return true;
}

// =====================================================================
// SECTION 10 — Calendar view
// =====================================================================

/**
 * The coloured status pill: green Completed, orange Upcoming, red Live.
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
  }

  return (
    '<span class="statusdot ' + styleClass + '">' + dot +
    escapeHtml(status || "—") + "</span>"
  );
}

/**
 * The Details cell of a calendar row:
 *   Completed → a gold "View results" pill linking to the event's Detail page
 *   Live      → a red "View live" pill (V2 will point it at the live mini-site)
 *   Upcoming  → nothing at all; there is nothing to look at yet
 *
 * Both pills carry data-event-id for navigation.js. The cell is deliberately
 * left completely empty for Upcoming, because the mobile stylesheet hides an
 * empty cell rather than showing a bare "Details" label.
 */
function calendarDetailsCellHtml(event) {
  if (event.status === STATUS.COMPLETED) {
    return (
      '<td data-label="Details"><span class="cal-link" data-event-id="' +
      escapeHtml(event.id) + '">View results ' + icon("arrow") + "</span></td>"
    );
  }

  if (event.status === STATUS.LIVE) {
    // Inert for now — V2 wires this to that sport's live mini-site.
    return (
      '<td data-label="Details"><span class="cal-link live" data-event-id="' +
      escapeHtml(event.id) + '">View live ' + icon("arrow") + "</span></td>"
    );
  }

  return '<td data-label="Details"></td>';
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
        '<tr data-event-id="' + escapeHtml(event.id) + '">' +
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

// =====================================================================
// SECTION 11 — the public functions
// =====================================================================

/**
 * Draw the whole Homepage from the finished data object.
 *
 * Read top to bottom, this is the page: header, hero, leaderboard, the two
 * category panels, extra points, latest results, upcoming.
 */
function renderHomepage(data) {
  renderHeader(data);
  renderHero(data);
  renderLeaderboard(data);
  renderByCategory(data);
  renderExtraPoints(data);
  renderLatestResults(data);
  renderUpcoming(data);

  // The divider only earns its place if there is something on both sides of it.
  const hasPointsAbove = !el("sec-leaderboard").hidden || !el("sec-extra").hidden;
  const hasEventsBelow = !el("sec-latest").hidden || !el("sec-upcoming").hidden;
  showSection("home-divider", hasPointsAbove && hasEventsBelow);
}
