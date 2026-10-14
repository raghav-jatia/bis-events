// render-home.js
// What this file does: draws the Home view — everything a visitor sees when
// they arrive, top to bottom:
//
//     hero  →  live banner  →  Just In  →  leaderboard  →  by category
//           →  extra points  →  Recent Results  →  Upcoming
//
// renderHomepage() at the foot of this file follows exactly that order, so
// reading it tells you what the page looks like.
//
// Every section hides itself when it has nothing to show (blueprint §11), which
// is why a brand-new season with no results yet is a short tidy page rather
// than a screen of empty boxes and zeroes.
//
// NOT here: the site header and the footer line. They belong to every view, not
// to this one, so they live in render-shared.js and main.js draws them.
//
// Same rule as every render file: this never calculates and never fetches. If a
// number appears on screen, calculate.js worked it out. The one kind of
// arithmetic allowed here is layout geometry — how wide to draw a bar — which
// is a drawing decision and never changes a total.
//
// Nothing about this school is written into this file. House names and colours
// come from data.houses, which came from the Houses tab of the Sheet.
//
// Public entry point: renderHomepage(data)

// =====================================================================
// SECTION 1 — the hero
// =====================================================================
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
// SECTION 2 — Live banner (blueprint §14)
// =====================================================================

/**
 * The banner(s) pinned to the top of the homepage while an event is running.
 *
 * Shown ONLY while at least one event has status = Live, and hidden entirely
 * otherwise (§11) — which is the normal state of the site.
 *
 * WHERE THE LINK GOES is not decided here — eventDestination() in
 * render-shared.js decides it once for the whole site, so this banner and the
 * Calendar row for the same event can never say different things. For a Live
 * event that means: its mini-site if it has one ("Watch live"), otherwise its
 * Detail page ("View details"), and no link at all if that page would be empty.
 *
 * MORE THAN ONE LIVE EVENT: they are STACKED, one banner each, rather than
 * showing the first with an "and 2 others" note. Each live event has its own
 * name and its own destination, and a single banner cannot link to two places
 * at once — collapsing them would hide exactly the link somebody came for.
 * Simultaneous live events are rare and few, and the banners are compact.
 *
 * A Live event scores nothing: countsTowardsSeason() in calculate.js still
 * accepts Completed alone. This is display only.
 */
function renderLiveBanner(data) {
  const liveEvents = data.events.filter(function (event) {
    return event.status === STATUS.LIVE;
  });

  const html = liveEvents
    .map(function (event) {
      // The same rule the two event tables use, so the banner can never promise
      // something the Calendar row for the same event disagrees with.
      const destination = eventDestination(event);

      const inner =
        '<span class="lb-dot"></span>' +
        '<span class="lb-tag">Live now</span>' +
        '<span class="lb-name">' + escapeHtmlWithBreaks(event.name) + "</span>" +
        (destination.kind === "none"
          ? ""
          : '<span class="lb-link">' + escapeHtml(destination.label) + " " +
            icon("arrow") + "</span>");

      // A real link when there is somewhere external to go…
      if (destination.kind === "minisite") {
        return (
          '<a class="livebanner" href="' + escapeHtml(destination.url) + '" ' +
          'target="_blank" rel="noopener noreferrer">' + inner + "</a>"
        );
      }

      // …a div carrying the event id, which navigation.js turns into a click
      // through to the Detail page…
      if (destination.kind === "detail") {
        return (
          '<div class="livebanner" data-event-id="' + escapeHtml(event.id) + '">' +
          inner + "</div>"
        );
      }

      // …or, when that page would be empty, an announcement and nothing more.
      // The event is still worth telling people about; there is just nowhere
      // useful to send them yet, so nothing here invites a click.
      return '<div class="livebanner not-clickable">' + inner + "</div>";
    })
    .join("");

  fillOrHide("live-banners", "live-banners", html);
}

// =====================================================================
// SECTION 4 — House Points Leaderboard
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
 * is for placings, and is used in Recent Results below.)
 */
function renderLeaderboard(data) {
  const table = data.standings.overall;

  const html = !hasAnyPoints(table) ? "" : table
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
// SECTION 5 — By Category (Sports / Co-curricular)
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
  if (!hasAnyPoints(table)) return "";

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
// SECTION 6 — Extra Points (collapsible cards)
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

      // This house's own rows, newest first. (Extra Points rows carry a date
      // just as events do, so they use the site's shared date comparator —
      // undated rows sink to the bottom, same as everywhere else.)
      const entries = data.extraPoints
        .filter(function (entry) {
          return entry.houseId === row.houseId;
        })
        .sort(byDateNewestFirst);

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
// SECTION 3 — Just In spotlight, and Recent Results
// =====================================================================

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
  // Same rule as the events table: an event awaiting its results shows none.
  if (event.status === STATUS.RESULTS_PENDING) return "";

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

// =====================================================================
// Recent Results spotlight
// =====================================================================

/** How recent an event must be to earn a spotlight, and how many can show. */
const SPOTLIGHT_WINDOW_DAYS = 7;
const SPOTLIGHT_MAX = 2;

/**
 * Which events get the promoted treatment at the top of the homepage.
 *
 * A STRICT window: everything Completed in the last 7 days, most recent first,
 * capped at 2. Nothing in that window means no spotlight, and the section hides.
 *
 * There used to be a fallback to the single most recent completed event, so
 * that something was always promoted. It was dropped deliberately: "Just In"
 * promises news, and an event from three weeks ago presented under that heading
 * is simply untrue. Events run roughly weekly, so the gap is short outside the
 * holidays, and on a homepage this busy a clean gap beats a stale card.
 *
 * Nothing is lost when it hides — the same events are still in Recent Results
 * immediately below, which no longer has anything excluded from it.
 *
 * "Results Pending" events are excluded by the status test: they have happened
 * but have no results, and a spotlight with nothing to show would be pointless.
 *
 * An event with no usable date can't be judged recent, so it never spotlights —
 * it still appears in Recent Results and the events table as normal.
 */
function chooseSpotlightEvents(data) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SPOTLIGHT_WINDOW_DAYS);

  return data.events
    .filter(function (event) {
      // hasResultsToShow, not just "Completed": a spotlight card is a big gold
      // celebration of a result, so an event with no placings entered yet has
      // nothing to celebrate and must not be promoted.
      if (!hasResultsToShow(event)) return false;
      const date = parseSheetDate(event.date);
      return date && date >= cutoff;
    })
    .sort(byDateNewestFirst)
    .slice(0, SPOTLIGHT_MAX);
}

/**
 * Draw the spotlight cards.
 *
 * Deliberately gold and celebratory, so it reads as a highlight — visibly
 * different from the red live banner above it, which is urgent.
 *
 * `carryAllEventsLink` is true when the "Recent Results" section further down
 * has been emptied by the spotlight and hidden; the "All events →" link moves
 * up here so it is never lost. Exactly one of the two sections shows it.
 */
function renderSpotlight(data, events, carryAllEventsLink) {
  const html = events
    .map(function (event) {
      const dateText = formatLongDate(event.date);
      const meta = [dateText, event.type].filter(Boolean).join(" · ");
      const placings = renderPlacings(data, event);

      return (
        '<div class="scard" data-event-id="' + escapeHtml(event.id) + '">' +
        // The gold tile keeps its treatment, but carries the event's OWN type
        // glyph so the card says what kind of event it was at a glance.
        '<div class="cup">' + icon(typeIconName(event)) + "</div>" +
        '<div class="sc-t">' +
        '<div class="sc-date">' + escapeHtml(meta) + "</div>" +
        '<div class="sc-name">' + escapeHtmlWithBreaks(event.name) + "</div>" +
        (placings ? '<div class="places">' + placings + "</div>" : "") +
        "</div>" +
        '<span class="go">' + icon("arrow") + "</span>" +
        "</div>"
      );
    })
    .join("");

  const shown = fillOrHide("sec-spotlight", "spotlight", html);
  el("spotlight-more").hidden = !(shown && carryAllEventsLink);
}

/**
 * The last two events that have taken place, with their house placings.
 *
 * Note this deliberately shows the EVENT's placings (who came 1st/2nd/3rd in
 * that event), not season standings — blueprint §4's one exception to
 * rank-ordering everything by season position.
 *
 * ONLY Completed events appear here, and that is the point: this is a RESULTS
 * list, so an event with no results yet has nothing to contribute. A Results
 * Pending event used to appear as a card with an empty space where the placings
 * belong, which read as a fault rather than as information. It is still listed
 * on Completed Events and the Calendar, where its status pill explains it.
 * (The Just In spotlight above has always been Completed-only.)
 *
 * `excludeIds` are the events already promoted into the spotlight above. They
 * are left out so the same result never appears twice on one page; if that
 * empties this section entirely it hides, and the spotlight carries the
 * "All events →" link instead.
 */
function renderLatestResults(data, excludeIds) {
  const skip = excludeIds || [];

  const completed = data.events
    .filter(hasResultsToShow)
    .filter(function (event) {
      return skip.indexOf(event.id) === -1;
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
        '<div class="lc-name">' + escapeHtmlWithBreaks(event.name) + "</div>" +
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
 *
 * SAME SHAPE AS A RECENT RESULTS CARD: an icon down the left, vertically
 * centred against the whole text block, with the name and then the date stacked
 * beside it. Sharing that pattern is what makes the two rows of cards read as
 * one page rather than two unrelated designs — an icon pinned to the top-left
 * with text flowing around it is anchored to nothing.
 *
 * The text block is deliberately short: these cards carry the least information
 * on the homepage — a name and a date — so having them stand taller than the
 * Recent Results cards, which carry a date, a name AND three house placings,
 * had it exactly backwards.
 *
 * WHETHER THE CARD IS CLICKABLE is decided by eventTargetAttr(), the same
 * function the two event tables use. Most upcoming events have nothing on their
 * Detail page beyond the name and date already on this card, and these cards
 * used to open it anyway — a click that appeared to do nothing. Now a card only
 * leads somewhere when there is genuinely something there (a write-up, a roster,
 * a mini-site), and navigation.js marks only those as clickable.
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

      return (
        '<div class="ucard"' + eventTargetAttr(event) + ">" +
        '<span class="evicon">' + icon(typeIconName(event)) + "</span>" +
        '<div class="uc-t">' +
        '<div class="en">' + escapeHtmlWithBreaks(event.name) + "</div>" +
        (parts
          ? '<div class="datebox"><span class="d">' + parts.day +
            '</span><span class="mo">' + parts.month + "</span></div>"
          : "") +
        "</div>" +
        "</div>"
      );
    })
    .join("");

  fillOrHide("sec-upcoming", "upcoming", html);
}

// =====================================================================
// SECTION 8 — the public entry point
// =====================================================================

/**
 * Draw the whole Homepage from the finished data object.
 *
 * Read top to bottom, this is the page: header, hero, leaderboard, the two
 * category panels, extra points, latest results, upcoming.
 */
function renderHomepage(data) {
  renderLiveBanner(data); // pinned above everything else on the page
  renderHero(data);

  // The spotlight and Recent Results are decided together: whatever the
  // spotlight promotes is removed from the list below, so no result is shown
  // twice, and the "All events →" link follows whichever section survives.
  const spotlight = chooseSpotlightEvents(data);
  const spotlightIds = spotlight.map(function (event) {
    return event.id;
  });
  // Must use the SAME test renderLatestResults uses, or the two disagree about
  // whether that section will be empty and the "All events" link goes missing.
  const remainingForLatest = data.events
    .filter(hasResultsToShow)
    .filter(function (event) {
      return spotlightIds.indexOf(event.id) === -1;
    });

  renderSpotlight(data, spotlight, remainingForLatest.length === 0);
  renderLeaderboard(data);
  renderByCategory(data);
  renderExtraPoints(data);
  renderLatestResults(data, spotlightIds);
  renderUpcoming(data);

  // The divider only earns its place if there is something on both sides of it.
  const hasPointsAbove = !el("sec-leaderboard").hidden || !el("sec-extra").hidden;
  const hasEventsBelow = !el("sec-latest").hidden || !el("sec-upcoming").hidden;
  showSection("home-divider", hasPointsAbove && hasEventsBelow);
}
