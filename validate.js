// validate.js
// What this file does: takes the canonical data object from data.js and checks
// it BEFORE the rest of the site uses it (blueprint §17).
//
// The guiding principle is "defensive by default, robustness over strictness":
//   - One bad row must never take the page down. It is dropped or flagged, and
//     everything else still renders.
//   - Only a FUNDAMENTAL failure (no Config, no Houses) is fatal — that's the
//     one case where main.js shows the calm "temporarily unavailable" message.
//   - Every problem is written to the console for developers AND collected into
//     a list, so the ?debug view can show the same list on-screen to a student
//     maintainer who will never open the console.
//
// TWO RULES THAT GOVERN EVERY CHECK IN THIS FILE
//
// 1. Drop the SMALLEST unit possible.
//    A bad cell removes one placing — never the category row it sits in, never
//    the event, never the tab. The totals must always reflect the best correct
//    data available, so a single typo in silver_house cannot be allowed to take
//    the gold and bronze down with it and quietly distort every house's score.
//
//      bad silver_house  →  that one placing set aside; gold + bronze still count
//      NEVER             →  whole category row, whole event, or whole tab dropped
//
//    (The only whole-row drops are for problems that make a row meaningless in
//    itself: an event with no event_id, a duplicate event_id, a house with no
//    id/name, an Extra Points row whose points aren't a number.)
//
// 2. If it affects points, it is an ERROR — never a quiet warning.
//    Anything set aside that would otherwise have scored, and anything that
//    excludes an event from the leaderboards, is logged with console.error and
//    shown at "error" level in the ?debug panel, naming the tab, the row and the
//    exact column. Warnings are reserved for things that cost no points at all
//    (a roster name that can't be shown, a dodgy colour, a missing date).
//
// What this file does NOT do: no maths, no DOM, no fetching. It reads the data
// object, tidies it, and reports.
//
// Public entry point: validateSiteData(data) → { data, warnings, fatal, ok, counts }

// =====================================================================
// SECTION 1 — how a problem is described
// =====================================================================

/**
 * Four severities, chosen by CONSEQUENCE rather than by how odd the data looks:
 *
 *   fatal   → the site cannot show meaningful standings at all.
 *             main.js shows the friendly fallback message instead of the page.
 *   error   → something was DROPPED, and it would have affected points.
 *             (e.g. a placing awarded to a house that doesn't exist)
 *   warning → something looks wrong but nothing was lost, or only display
 *             detail was lost. (e.g. a dodgy colour, a missing venue)
 */
const VALIDATION_LEVEL = {
  FATAL: "fatal",
  ERROR: "error",
  WARNING: "warning",
  // advisory → a HUNCH, not a finding. Something looks unusual but is very
  //            probably fine, and we cannot tell without a human looking.
  //            Deliberately invisible: it is never logged to the console and
  //            never counted as a problem. It is collected only so the ?debug
  //            view can offer it to an admin who goes looking.
  //
  //            The bar for this level: if it can fire on correct data, it is
  //            advisory. A warning that cries wolf is worse than no warning.
  ADVISORY: "advisory",
};

/**
 * Every problem is recorded in the same shape so the ?debug view can render
 * them as a simple table without knowing anything about the individual checks:
 *
 *   level    — one of VALIDATION_LEVEL
 *   tab      — which Sheet tab the maintainer should go and look at
 *   subject  — the row's human handle, e.g. an event_id or a house name
 *   cell     — the exact column at fault, e.g. "silver_house" (blank if the
 *              problem is the whole row rather than one cell)
 *   message  — plain English: what is wrong and what the site did about it
 *
 * Together tab + subject + cell point at one square of the spreadsheet, so a
 * maintainer reading the ?debug panel knows exactly where to go and type.
 */
function createReport() {
  return {
    warnings: [],
    add: function (level, tab, subject, message, cell) {
      const entry = {
        level: level,
        tab: tab,
        subject: subject,
        cell: cell || "",
        message: message,
      };
      this.warnings.push(entry);

      // Advisories are collected but never announced — no console line, so a
      // normal page load stays clean. They surface only in the ?debug view.
      if (level === VALIDATION_LEVEL.ADVISORY) return entry;

      // Developer channel. Fatal problems and dropped data are errors; the
      // rest are warnings. Visitors never see any of this.
      const label =
        "[" +
        tab +
        (subject ? " — " + subject : "") +
        (entry.cell ? " — column " + entry.cell : "") +
        "] " +
        message;
      if (level === VALIDATION_LEVEL.WARNING) {
        console.warn("validate.js: " + label);
      } else {
        console.error("validate.js: " + label);
      }

      return entry;
    },
  };
}

// =====================================================================
// SECTION 2 — small checking helpers
// =====================================================================

// Colour and date checking both use utils.js — isHexColour() and
// parseSheetDate(). One parser each for the whole site, so "what counts as a
// valid colour/date" can never drift between the module that CHECKS a value and
// the module that DISPLAYS it. (This file used to carry its own copy of the
// colour test, which is exactly the kind of drift that invites.)

/**
 * Match a Sheet value against the allowed values in config.js, ignoring case
 * and stray spaces — so "completed" is quietly accepted as "Completed".
 *
 * Returns the OFFICIAL spelling, or null if it matches nothing at all. This is
 * tidying a typo, not inventing data: an unrecognised value is still reported.
 */
function matchAllowedValue(text, allowedValues) {
  const value = String(text || "").trim().toLowerCase();
  if (value === "") return null;

  const match = allowedValues.find(function (allowed) {
    return allowed.toLowerCase() === value;
  });
  return match || null;
}

/** The list of valid values from one of the config.js constant objects. */
function allowedValuesOf(constantObject) {
  return Object.keys(constantObject).map(function (key) {
    return constantObject[key];
  });
}

// =====================================================================
// SECTION 3 — Config checks
// =====================================================================

/**
 * Config is the one tab the site genuinely cannot work without: it holds the
 * point schemes and the season labelling. Missing keys here are the closest
 * thing V1 has to a fatal error.
 */
function checkConfig(data, report) {
  const config = data.config;
  const rawRows = (config && config.rawRows) || [];

  // --- nothing at all: fatal ---
  if (rawRows.length === 0) {
    report.add(
      VALIDATION_LEVEL.FATAL,
      "Config",
      "",
      "The Config tab is empty or missing. The site cannot run without it."
    );
    return;
  }

  // --- the same key typed twice: the site silently used the last one ---
  const seenKeys = {};
  rawRows.forEach(function (row) {
    const key = row.key || "";
    if (key === "") return;
    if (seenKeys[key]) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Config",
        key,
        'The key "' +
          key +
          '" appears more than once. The site used the LAST value ("' +
          (config.raw[key] || "") +
          '"). Delete the duplicate row.'
      );
    }
    seenKeys[key] = true;
  });

  // --- keys that only affect wording on screen ---
  const textKeys = [
    { key: "school_name", value: config.schoolName },
    { key: "site_title", value: config.siteTitle },
    { key: "season_label", value: config.seasonLabel },
    { key: "current_year", value: config.currentYear },
  ];
  textKeys.forEach(function (entry) {
    if (!entry.value) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Config",
        entry.key,
        'Missing "' + entry.key + '". That part of the page will be blank.'
      );
    }
  });

  // --- the point schemes: the most dangerous cells in the whole Sheet ---
  //
  // A broken scheme does not break the page; it multiplies quietly into every
  // event and produces a complete, believable, WRONG leaderboard. So each one
  // is checked in detail and the exact fault is named — see readScheme() in
  // utils.js for the list of ways a scheme can look fine and not be.
  let validSchemes = 0;
  ["sports_scheme", "cocurricular_scheme", "tier2_scheme"].forEach(function (key) {
    const typed = String((config.raw && config.raw[key]) || "").trim();

    if (typed === "") {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Config",
        key,
        'Missing "' + key + '". It must be numbers separated by commas, ' +
          'e.g. "10,7,4". Events relying on it cannot be scored.'
      );
      return;
    }

    const problem = describeSchemeProblem(typed);
    if (problem) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Config",
        key,
        'The point scheme "' + typed + '" cannot be used because ' + problem +
          ". Events relying on it score nothing until this is fixed."
      );
      return;
    }

    validSchemes++;
  });

  // Every scheme broken means nothing anywhere can be scored — that's fatal.
  if (validSchemes === 0) {
    report.add(
      VALIDATION_LEVEL.FATAL,
      "Config",
      "",
      "None of the point schemes could be read, so no standings can be calculated."
    );
  }

  // --- term dates (used by the Calendar) ---
  [
    { key: "term_start", value: config.termStart },
    { key: "term_end", value: config.termEnd },
  ].forEach(function (entry) {
    if (entry.value && parseSheetDate(entry.value) === null) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Config",
        entry.key,
        '"' + entry.value + '" is not a date the site understands. Use YYYY-MM-DD.'
      );
    }
  });
}

// =====================================================================
// SECTION 4 — Houses checks
// =====================================================================

/**
 * Houses drive every colour and every points column on the site. An empty
 * Houses tab is fatal; individual broken rows are dropped.
 *
 * Returns the cleaned list of houses.
 */
function checkHouses(data, report) {
  const houses = data.houses || [];

  if (houses.length === 0) {
    report.add(
      VALIDATION_LEVEL.FATAL,
      "Houses",
      "",
      "No houses found. The site cannot show standings without houses."
    );
    return [];
  }

  const keptHouses = [];
  const seenIds = {};
  const seenNames = {};

  houses.forEach(function (house) {
    // --- a house with no id or no name cannot be matched or labelled ---
    if (!house.id || !house.name) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Houses",
        house.name || house.id || "(blank row)",
        "This house is missing its house_id or its name, so it has been left out. Every placing naming it will be set aside too.",
        !house.id ? "house_id" : "name"
      );
      return;
    }

    // --- duplicates would make house lookups ambiguous ---
    const idKey = house.id.toLowerCase();
    const nameKey = house.name.toLowerCase();
    if (seenIds[idKey] || seenNames[nameKey]) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Houses",
        house.name,
        'Duplicate house (id "' +
          house.id +
          '", name "' +
          house.name +
          '"). Only the first one is used.',
        "house_id"
      );
      return;
    }
    seenIds[idKey] = true;
    seenNames[nameKey] = true;

    // --- a bad colour is cosmetic: keep the house, flag the colour ---
    if (!isHexColour(house.color)) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Houses",
        house.name,
        '"' +
          house.color +
          '" is not a valid hex colour (expected something like #ff5158). This house will fall back to the default colour.',
        "color_hex"
      );
    }

    keptHouses.push(house);
  });

  return keptHouses;
}

// =====================================================================
// SECTION 5 — Events checks
// =====================================================================

/**
 * Check every event, and clean up the parts that would otherwise corrupt the
 * points calculation. Returns the cleaned list of events.
 *
 * `knownHouseIds` is the set of house ids that survived checkHouses().
 */
function checkEvents(data, report, knownHouseIds) {
  const events = data.events || [];
  const keptEvents = [];
  const seenEventIds = {};

  const allowedStatuses = allowedValuesOf(STATUS);
  const allowedTypes = allowedValuesOf(EVENT_TYPE);
  const allowedModes = allowedValuesOf(RESULTS_MODE);

  events.forEach(function (event) {
    // --- an event with no id cannot own results, rosters or photos ---
    if (!event.id) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Events",
        event.name || "(unnamed row)",
        "This event has no event_id, so it has been left out. Every event needs a unique code (e.g. SWIM)."
      );
      return;
    }

    // --- duplicate ids: the second one's rows would be a mystery ---
    if (seenEventIds[event.id]) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Events",
        event.id,
        'The event_id "' +
          event.id +
          '" is used more than once. Only the first event is shown — give the other one its own code.'
      );
      return;
    }
    seenEventIds[event.id] = true;

    checkEventName(event, report);
    checkEventDropdowns(event, report, allowedStatuses, allowedTypes, allowedModes);
    checkEventDate(event, report);
    checkEventSchemeOverrides(event, report);

    // Clean the scoring data. Order matters: placings are cleaned before we
    // ask whether a completed event has any placings left.
    event.tier2 = cleanTier2(event, report, knownHouseIds);
    event.directPlacings = cleanDirectPlacings(event, report, knownHouseIds);
    event.roster = cleanRoster(event, report, knownHouseIds);

    checkCompletedEventHasResults(event, report);
    checkResultsWithoutCompletedStatus(event, report);

    keptEvents.push(event);
  });

  return keptEvents;
}

/** An unnamed event would render as a blank card. */
function checkEventName(event, report) {
  if (!event.name) {
    report.add(
      VALIDATION_LEVEL.WARNING,
      "Events",
      event.id,
      "This event has no name, so it will appear with a blank title."
    );
  }
}

/**
 * status / type / results_mode must match the values in config.js.
 *
 * A near-miss of capitalisation is corrected in place; anything unrecognised is
 * reported and left exactly as typed (we never guess what was meant).
 */
function checkEventDropdowns(event, report, allowedStatuses, allowedTypes, allowedModes) {
  // An unrecognised status is an ERROR, not a warning: the season leaderboards
  // only count events whose status is Completed, so a status the site cannot
  // read quietly leaves this event's points out of every total.
  const status = matchAllowedValue(event.status, allowedStatuses);
  if (status === null) {
    report.add(
      VALIDATION_LEVEL.ERROR,
      "Events",
      event.id,
      'Status "' +
        event.status +
        '" is not one of: ' +
        allowedStatuses.join(", ") +
        ". The event still appears on the Calendar, but nowhere else — not in " +
        "Completed Events, Recent Results or Upcoming — and its points will not " +
        "reach the leaderboards.",
      "status"
    );
  } else {
    event.status = status;
  }

  const type = matchAllowedValue(event.type, allowedTypes);
  if (type === null) {
    report.add(
      VALIDATION_LEVEL.ERROR,
      "Events",
      event.id,
      'Type "' +
        event.type +
        '" is not one of: ' +
        allowedTypes.join(", ") +
        ". Its points cannot be added to either leaderboard.",
      "type"
    );
  } else {
    event.type = type;
  }

  // results_mode is only *required* once results are expected.
  //
  // A blank cell on an Upcoming or Live event is not a mistake — the format
  // often isn't decided until the results are being entered — so we say
  // nothing. Once the event is marked Completed the mode must be there, and a
  // missing one is an error, because the event cannot be scored without it.
  //
  // A value that is present but unrecognised (a typo like "Auto") is always an
  // error, whatever the status: that is wrong now and will stay wrong.
  const modeIsBlank = String(event.resultsMode || "").trim() === "";
  const mode = matchAllowedValue(event.resultsMode, allowedModes);

  if (mode !== null) {
    event.resultsMode = mode;
  } else if (modeIsBlank && event.status !== STATUS.COMPLETED) {
    // Nothing to say yet — the event hasn't happened.
  } else {
    report.add(
      VALIDATION_LEVEL.ERROR,
      "Events",
      event.id,
      modeIsBlank
        ? "This event is marked Completed but has no results_mode, so the site cannot score it. Set it to " +
          allowedModes.join(" or ") + "."
        : 'Results mode "' +
          event.resultsMode +
          '" is not one of: ' +
          allowedModes.join(", ") +
          ". The site will not know how to score this event.",
      "results_mode"
    );
  }
}

/**
 * The two per-event point schemes — and the second and third places a malformed
 * scheme can do damage.
 *
 *   tier1_override → what this event is worth to the SEASON, by house position.
 *   tier2_override → what one PLACING inside this event's categories is worth.
 *
 * Both are checked exactly as strictly as the Config schemes, because the
 * failure is the same shape every time: a stray comma here would not break the
 * page, it would quietly award points in the wrong order. The only difference
 * from Config is that BLANK is perfectly normal here — almost every event uses
 * the season defaults — so a blank cell says nothing at all.
 *
 * ONE function for both, rather than a copy each, so "as strict as Config"
 * cannot drift apart between the two columns. If a third override is ever
 * added, it joins this list and inherits the same rules for free.
 */
const EVENT_SCHEME_OVERRIDES = [
  {
    column: "tier1_override",
    rawField: "tier1OverrideRaw",
    fallback:
      "This event has been scored with the normal scheme for its type instead.",
  },
  {
    column: "tier2_override",
    rawField: "tier2OverrideRaw",
    fallback:
      "This event's categories have been tallied with the Config tier2_scheme " +
      "instead.",
  },
];

function checkEventSchemeOverrides(event, report) {
  EVENT_SCHEME_OVERRIDES.forEach(function (override) {
    const typed = String(event[override.rawField] || "").trim();
    if (typed === "") return; // the normal case: use the season default

    const problem = describeSchemeProblem(typed);
    if (!problem) return;

    report.add(
      VALIDATION_LEVEL.ERROR,
      "Events",
      event.id,
      "The " + override.column + ' "' + typed + '" cannot be used because ' +
        problem + ". " + override.fallback + " Either fix it or clear the cell.",
      override.column
    );
  });
}

/**
 * Results are in, but the event has not been marked Completed.
 *
 * THE MOST LIKELY MISTAKE ANYONE WILL MAKE. Points only count once the status
 * says Completed, so an event with a full set of results and the wrong status
 * scores nothing — the site is behaving exactly as designed and the leaderboard
 * is simply missing that event, with nothing on screen to say why.
 *
 * WHICH STATUSES THIS FIRES ON, and why it is not noise:
 *
 *   Upcoming        → WARNING. An event that has not happened yet should not
 *                     have results. If it does, either the status is stale or
 *                     somebody typed into the wrong row. Correctly-kept data
 *                     never looks like this, so this can be a real warning.
 *   Results Pending → ADVISORY. This status MEANS "happened, results still to
 *                     come", so results appearing part-way through is exactly
 *                     what normal entry looks like. Firing a warning here would
 *                     go off every time somebody entered results over two
 *                     sittings, and a warning that cries wolf is worse than no
 *                     warning — so it is kept for the ?debug view only.
 *   Live            → SILENT. Entering scores while an event is running is the
 *                     whole point of the status.
 *   Completed       → SILENT. Nothing to say.
 *   anything else   → SILENT. An unrecognised status is already an error
 *                     against this same row; saying it twice helps nobody.
 */
function checkResultsWithoutCompletedStatus(event, report) {
  const isUpcoming = event.status === STATUS.UPCOMING;
  const isPending = event.status === STATUS.RESULTS_PENDING;
  if (!isUpcoming && !isPending) return;

  // Count what has actually survived validation — a placing that was set aside
  // is not evidence that anybody entered results.
  const placingCount = (event.tier2 || []).reduce(function (total, category) {
    return total + category.places.length;
  }, 0);
  const directCount = (event.directPlacings || []).length;
  if (placingCount === 0 && directCount === 0) return;

  const found = [];
  if (placingCount > 0) {
    found.push(placingCount + " result placing" + (placingCount === 1 ? "" : "s") +
      " on the Results tab");
  }
  if (directCount > 0) {
    found.push(directCount + " house placing" + (directCount === 1 ? "" : "s") +
      " in direct_1st/2nd/3rd");
  }

  const summary = 'This event has ' + found.join(" and ") +
    ', but its status is "' + event.status + '", so it scores NOTHING and its ' +
    "points are missing from the leaderboard.";

  if (isUpcoming) {
    report.add(
      VALIDATION_LEVEL.WARNING,
      "Events",
      event.id,
      summary + " An event that has not happened yet should not have results — " +
        "either set the status to Completed, or check the results were entered " +
        "against the right event.",
      "status"
    );
    return;
  }

  report.add(
    VALIDATION_LEVEL.ADVISORY,
    "Events",
    event.id,
    summary + " That is perfectly normal while you are still typing them in. " +
      "When the results are final, set the status to Completed and the points " +
      "will appear.",
    "status"
  );
}

/** The Calendar needs a usable date; a missing one is only a display problem. */
function checkEventDate(event, report) {
  if (!event.date) {
    report.add(
      VALIDATION_LEVEL.WARNING,
      "Events",
      event.id,
      "No date, so this event cannot be placed on the Calendar.",
      "date"
    );
    return;
  }

  if (parseSheetDate(event.date) === null) {
    report.add(
      VALIDATION_LEVEL.WARNING,
      "Events",
      event.id,
      'The date "' +
        event.date +
        '" could not be read. Use the date picker, or type it as YYYY-MM-DD.',
      "date"
    );
  }
}

/**
 * Clean the Tier-2 (individual) results of one event.
 *
 * GRANULARITY — this is deliberate and important: the smallest unit is dropped.
 * One bad cell removes ONE placing. The rest of that category row still counts,
 * the other categories still count, and the event still scores. A typo in
 * silver_house must never quietly delete the gold and bronze alongside it,
 * because that would distort every house's total without anyone noticing.
 *
 *   bad silver_house  →  silver placing dropped; gold + bronze kept
 *   NEVER             →  the category row dropped, or the event dropped
 *
 * IMPORTANT — what is NOT an error here: the same house winning two places in
 * the same category is completely legitimate. Two different swimmers from Beta
 * can take gold and silver of the Under-14. So we do NOT flag a repeated house
 * within a category. (The equivalent check for whole-event placings, where a
 * repeat really is a double-count, is in cleanDirectPlacings below.)
 *
 * What we DO drop: a placing awarded to a house that doesn't exist, because it
 * would silently award Tier-2 points to nobody.
 */
function cleanTier2(event, report, knownHouseIds) {
  const RANK_LABELS = { 1: "gold", 2: "silver", 3: "bronze" };
  const RANK_COLUMNS = { 1: "gold_house", 2: "silver_house", 3: "bronze_house" };

  return (event.tier2 || []).map(function (category) {
    const keptPlaces = [];
    const namesSeen = {};

    category.places.forEach(function (place) {
      if (!place.houseId || !knownHouseIds[place.houseId]) {
        report.add(
          VALIDATION_LEVEL.ERROR,
          "Results",
          event.id + " / " + category.category,
          'The ' +
            (RANK_LABELS[place.rank] || "rank " + place.rank) +
            ' place names house "' +
            place.houseRaw +
            '", which is not in the Houses tab. ONLY this placing has been set aside — the other places in this category still count. Check the spelling.',
          RANK_COLUMNS[place.rank] || ""
        );
        return;
      }

      // The same PERSON at two places in one category is a genuine slip.
      const nameKey = (place.name || "").toLowerCase();
      if (nameKey && namesSeen[nameKey]) {
        report.add(
          VALIDATION_LEVEL.WARNING,
          "Results",
          event.id + " / " + category.category,
          '"' +
            place.name +
            '" is listed in more than one place in this category. One person cannot win two places — check the row. (Nothing has been dropped.)',
          RANK_COLUMNS[place.rank] || ""
        );
      }
      namesSeen[nameKey] = true;

      keptPlaces.push(place);
    });

    return { category: category.category, places: keptPlaces };
  });
}

/**
 * Clean the whole-event house placings of a Direct event (direct_1st/2nd/3rd).
 *
 * This is where a repeated house IS an error: a house cannot finish both 1st
 * and 3rd overall, and leaving it in would award it two lots of Tier-1 points.
 *
 * A TIE is different and perfectly legal: two DIFFERENT houses sharing one
 * place (e.g. direct_1st = "Alpha, Beta") passes through untouched, because the
 * house ids differ.
 *
 * GRANULARITY, same rule as Tier 2: one bad cell removes ONE placing. A typo in
 * direct_2nd never removes the 1st and 3rd places alongside it, and never
 * removes the event. The places that remain are NOT re-ranked — if 2nd place is
 * set aside, the 3rd-place house still receives third-place points rather than
 * being silently promoted. Guessing at a promotion would invent a result.
 */
function cleanDirectPlacings(event, report, knownHouseIds) {
  const PLACE_LABELS = { 1: "1st", 2: "2nd", 3: "3rd" };
  const PLACE_COLUMNS = { 1: "direct_1st", 2: "direct_2nd", 3: "direct_3rd" };
  const keptPlacings = [];
  const positionByHouse = {}; // houseId → the place it was first seen at

  (event.directPlacings || []).forEach(function (placing) {
    // --- unknown house: drop it, it would score for nobody ---
    if (!placing.houseId || !knownHouseIds[placing.houseId]) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Events",
        event.id,
        'The ' +
          (PLACE_LABELS[placing.position] || "place " + placing.position) +
          ' place names house "' +
          placing.houseRaw +
          '", which is not in the Houses tab. ONLY this placing has been set aside — the other places for this event still count. Check the spelling.',
        PLACE_COLUMNS[placing.position] || ""
      );
      return;
    }

    // --- same house placed twice: a real double-count ---
    const firstPosition = positionByHouse[placing.houseId];
    if (firstPosition !== undefined) {
      const message =
        firstPosition === placing.position
          ? '"' +
            placing.houseRaw +
            '" is listed twice in the ' +
            (PLACE_LABELS[placing.position] || "place " + placing.position) +
            " place. The repeat has been ignored."
          : '"' +
            placing.houseRaw +
            '" is placed both ' +
            (PLACE_LABELS[firstPosition] || firstPosition) +
            " and " +
            (PLACE_LABELS[placing.position] || placing.position) +
            ". A house can only finish once, so the " +
            (PLACE_LABELS[placing.position] || placing.position) +
            " entry has been ignored — check which is correct.";

      report.add(
        VALIDATION_LEVEL.ERROR,
        "Events",
        event.id,
        message,
        PLACE_COLUMNS[placing.position] || ""
      );
      return;
    }

    positionByHouse[placing.houseId] = placing.position;
    keptPlacings.push(placing);
  });

  return keptPlacings;
}

/**
 * Clean an event's roster. A roster entry only affects who is LISTED on the
 * Detail page, never points — so a bad one is a warning, not an error.
 */
function cleanRoster(event, report, knownHouseIds) {
  return (event.roster || []).filter(function (member) {
    if (!member.houseId || !knownHouseIds[member.houseId]) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Rosters",
        event.id,
        '"' +
          member.name +
          '" is listed under house "' +
          member.houseRaw +
          '", which is not in the Houses tab. This name will not be shown — check the spelling. (No points are affected.)',
        "house"
      );
      return false;
    }
    return true;
  });
}

/**
 * A finished event with nothing to score will quietly contribute zero points to
 * everybody, which looks like a site bug but is really a data-entry gap.
 */
function checkCompletedEventHasResults(event, report) {
  if (event.status !== STATUS.COMPLETED) return;

  if (event.resultsMode === RESULTS_MODE.CALCULATED) {
    const hasAnyPlace = (event.tier2 || []).some(function (category) {
      return category.places.length > 0;
    });
    if (!hasAnyPlace) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Results",
        event.id,
        "This event is marked Completed but has no usable results rows, so it will award no points."
      );
    }
  }

  // Direct and Override both score from the direct placings, so both need them.
  //
  // Deliberately NOT checked: whether an Override event's category table agrees
  // with its direct placings. Disagreeing is the entire purpose of the mode —
  // a human authority set the house order and the categories are published for
  // information — so a mismatch is valid data and must never be reported.
  if (
    event.resultsMode === RESULTS_MODE.DIRECT ||
    event.resultsMode === RESULTS_MODE.OVERRIDE
  ) {
    if ((event.directPlacings || []).length === 0) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Events",
        event.id,
        "This event is marked Completed and " + event.resultsMode +
          " but has no house placings in direct_1st/2nd/3rd, so it will award no points."
      );
    }
  }
}

// =====================================================================
// SECTION 5b — spotting a date that was typed differently from the rest
// =====================================================================

/**
 * Describe the SHAPE of a date value, ignoring the actual numbers.
 *
 * Google formats every real date cell in a column the same way, so all of them
 * share one shape. A date typed or pasted in as plain text usually doesn't —
 * and that difference is the only signal we have that a cell might not mean
 * what the site assumes.
 */
function dateShapeOf(text) {
  const value = String(text || "").trim();
  if (value === "") return "";

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return "YYYY-MM-DD";

  const numeric = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(value);
  if (numeric) {
    return (
      "number" + numeric[2] + "number" + numeric[2] +
      (numeric[4].length === 2 ? "2-digit year" : "4-digit year")
    );
  }

  return "words (e.g. 24 July 2026)";
}

/**
 * Warn about any event whose date is written differently from all the others.
 *
 * WHY THIS EXISTS. The site reads a slash date DAY first, because that is how
 * the Sheet is formatted (Indian convention): "5/7/26" is 5 July. That is right
 * for anything the Sheet itself formatted. But a student pasting a date in as
 * text from another app — an American site, say — could paste "7/5/26" meaning
 * 7 May, and the site would read it as 7 May too... or paste "5/7/26" meaning
 * 5 July and be right by luck. Where both numbers are 12 or less, NOTHING in
 * the text can tell us which was meant.
 *
 * We cannot read minds, so we do the next best thing: notice when one cell is
 * written unlike all its neighbours. A pasted date usually looks different from
 * the Sheet-formatted ones.
 *
 * ADVISORY ONLY, and deliberately so. This check fires happily on perfectly
 * correct data — a maintainer who simply types "5/7/2026" instead of using the
 * date picker gets flagged even though the date is right. Since this school
 * types dates the Indian way, the American-paste case it guards against is
 * unlikely in the first place. A warning that goes off on correct data is worse
 * than no warning at all, so it never reaches the console or the site: it is
 * collected for the ?debug view and nothing else.
 */
function checkDateFormatConsistency(events, report) {
  const dated = events.filter(function (event) {
    if (String(event.date || "").trim() === "") return false;

    // A date that cannot be read at all has already been reported by
    // checkEventDate, as a warning against the same cell. Saying "and it looks
    // unusual too" would be the same fault counted twice.
    return parseSheetDate(event.date) !== null;
  });

  // With only a couple of dates there is no "usual" shape to compare against.
  if (dated.length < 3) return;

  const counts = {};
  dated.forEach(function (event) {
    const shape = dateShapeOf(event.date);
    counts[shape] = (counts[shape] || 0) + 1;
  });

  const shapes = Object.keys(counts);
  if (shapes.length < 2) return; // everything matches — nothing to say

  const usual = shapes.reduce(function (best, shape) {
    return counts[shape] > counts[best] ? shape : best;
  }, shapes[0]);

  dated.forEach(function (event) {
    const shape = dateShapeOf(event.date);
    if (shape === usual) return;

    const reading = parseSheetDate(event.date);
    report.add(
      VALIDATION_LEVEL.ADVISORY,
      "Events",
      event.id,
      "FYI only, probably nothing: the date \"" + event.date + '" is written ' +
        'differently from the other events (which look like "' + usual + '"), ' +
        "which can mean it was typed or pasted by hand rather than picked with " +
        "the date picker. The site reads it as " +
        (reading
          ? reading.getDate() + "/" + (reading.getMonth() + 1) + "/" + reading.getFullYear() +
            " (day/month/year)"
          : "an unusable date") +
        ". That is almost certainly what was meant — this note exists only for " +
        "the rare case of a date pasted from a month-first (American) source.",
      "date"
    );
  });
}

// =====================================================================
// SECTION 6 — Extra Points and orphaned rows
// =====================================================================

/**
 * Extra Points go straight into the overall standings, so anything unusable is
 * dropped rather than guessed at. Returns the cleaned list.
 */
function checkExtraPoints(data, report, knownHouseIds) {
  return (data.extraPoints || []).filter(function (entry) {
    const subject = entry.reason || entry.houseRaw || "(row)";

    if (!entry.houseId || !knownHouseIds[entry.houseId]) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Extra Points",
        subject,
        'House "' +
          entry.houseRaw +
          '" is not in the Houses tab, so these points have been ignored — check the spelling.',
        "house"
      );
      return false;
    }

    // parseNumber() in data.js gives null for anything that isn't a number.
    if (entry.points === null) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Extra Points",
        subject,
        "The points value is blank or not a number, so this row has been ignored.",
        "points"
      );
      return false;
    }

    if (!entry.date) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Extra Points",
        subject,
        "No date given. The points still count; only the listing date is blank.",
        "date"
      );
    } else if (parseSheetDate(entry.date) === null) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Extra Points",
        subject,
        'The date "' + entry.date + '" could not be read. Use YYYY-MM-DD.',
        "date"
      );
    }

    return true;
  });
}

/**
 * Report an OPTIONAL tab that would not load at all.
 *
 * data.js no longer gives up when one of these fails (deleting the unused
 * Photos tab used to take the whole site down). It carries on with nothing from
 * that tab and records why — which means the page now renders happily while
 * quietly missing a chunk of its data, so saying so here is essential.
 *
 * Results and Extra Points feed the standings, so losing either is an ERROR and
 * the message says the leaderboard is incomplete. Rosters only fills in part of
 * an event's page, so losing it is a warning.
 *
 * (Config, Houses and Events never reach here: data.js treats those as fatal
 * and the site shows the calm fallback instead.)
 */
function checkTabErrors(data, report) {
  (data.tabErrors || []).forEach(function (entry) {
    const consequence = entry.affectsPoints
      ? " Points from that tab are MISSING, so the standings shown on the site " +
        "are incomplete until it loads again."
      : " Only display detail is missing; no points are affected.";

    report.add(
      entry.affectsPoints ? VALIDATION_LEVEL.ERROR : VALIDATION_LEVEL.WARNING,
      entry.tab,
      "",
      'The "' + entry.tab + '" tab could not be read, so the site carried on ' +
        "without it." + consequence +
        " Check the tab has not been deleted, and that the workbook is still " +
        'shared as "anyone with the link can view". (' + entry.message + ")"
    );
  });
}

/**
 * Which tabs feed the leaderboard.
 *
 * Read straight off data.js's own tab plan rather than listed again here, so
 * the two can never drift apart. The three REQUIRED tabs all affect points too
 * — without Config there are no schemes and without Houses there is nobody to
 * score — so they count as points-bearing even though the plan only marks the
 * optional tabs with a flag.
 */
function tabAffectsPoints(tabName) {
  const plan = SHEET_TAB_PLAN.find(function (candidate) {
    return candidate.tab.name === tabName;
  });
  if (!plan) return false;
  return plan.required === true || plan.affectsPoints === true;
}

/**
 * A tab that loaded through the FALLBACK route (by name) rather than by gid.
 *
 * The name route goes through gviz, which drops hidden and filtered-out rows
 * and blanks cells that don't match the type it guessed for their column. So
 * the tab is here, and it looks complete, but nothing can promise it is.
 *
 * A points-bearing tab in that state is worth a warning: nothing is known to be
 * lost, but the thing that would have stopped it being lost is switched off.
 * For Rosters and Photos it is only an advisory, because a blank gid is a
 * perfectly correct state to be in — the Photos tab is deliberately in it — and
 * a warning that fires on correct data is worse than no warning at all.
 */
function checkTabNotes(data, report) {
  (data.tabNotes || []).forEach(function (entry) {
    const pointsAtStake = tabAffectsPoints(entry.tab);

    report.add(
      pointsAtStake ? VALIDATION_LEVEL.WARNING : VALIDATION_LEVEL.ADVISORY,
      entry.tab,
      "",
      'The "' + entry.tab + '" tab was read the older, less reliable way — ' +
        entry.reason +
        " Read that way, any rows that are hidden or filtered out in the Sheet " +
        "do not reach the site at all, and cells that don't match the rest of " +
        "their column can arrive blank." +
        (pointsAtStake
          ? " That can change the standings without anything on the page " +
            "showing it, so this is worth fixing: put the tab's gid into " +
            "config.js (click the tab in Google Sheets and copy the number " +
            'after "#gid=" in the address bar).'
          : " No points come from this tab, so nothing on the leaderboard can " +
            "be affected.")
    );
  });
}

/**
 * Rows or columns hidden (or filtered out) in the Sheet.
 *
 * NOTHING IS WRONG WHEN THIS FIRES, and the message has to say so in its first
 * breath. The site reads the tab as it is STORED, so hidden rows are read and
 * counted exactly like any other — this note exists only because a maintainer
 * looking at a filtered Sheet sees fewer rows than the site does, and would
 * otherwise have no way of knowing the two differ.
 *
 * It matters most in the opposite direction to the obvious one: without this,
 * somebody who filtered the Results tab and then noticed the leaderboard "didn't
 * match" would go hunting for a bug that isn't there.
 *
 * Advisory, and only ever advisory — a filter left on is not a fault. One line
 * per tab. Costs nothing on a normal page load: the comparison it reads is only
 * gathered when ?debug is in the address (see data.js → fetchTabAsViewed).
 *
 * ROWS ONLY. A hidden COLUMN is not reported, because it cannot be detected —
 * hiding a column removes it from neither route — and because it has no effect
 * on the site either way. data.js → compareViews has the measurements.
 */
function checkSheetViewDifferences(data, report) {
  (data.viewDifferences || []).forEach(function (entry) {
    const hiddenRows = entry.siteRows - entry.viewedRows;

    report.add(
      VALIDATION_LEVEL.ADVISORY,
      entry.tab,
      "",
      "On this tab in the Sheet, " + hiddenRows + " of its " + entry.siteRows +
        " rows " + (hiddenRows === 1 ? "is" : "are") + " hidden or filtered " +
        "out of your view. THIS DOES NOT AFFECT THE SITE — " +
        "every row and column is read and counted, including the hidden ones. " +
        "It only means your view of the Sheet differs from what the site sees, " +
        "so don't be surprised if the two look different. Nothing needs fixing; " +
        "clear the filter or unhide if you want them to match."
    );
  });
}

/**
 * A key column that is not there at all.
 *
 * This is the quietest way the site can go wrong. Every row reads a missing
 * column as an empty string — exactly as it would read a genuinely blank cell —
 * so a renamed or deleted heading doesn't break anything, it just removes a
 * whole field from the site's view and lets it carry on computing confidently
 * from what is left. Nothing else in this file can see it, because by the time
 * the rows are built the column is simply gone.
 *
 * It also catches a tab resolving to the WRONG tab: read by name, a tab that no
 * longer exists comes back as the first tab in the workbook, with HTTP 200 and
 * a full set of rows. Config's columns are not Results' columns, so this fires.
 */
function checkMissingColumns(data, report) {
  const arrived = data.tabColumns || {};

  // "a", "a or b", "a, b or c" — so the message reads as a sentence however
  // many columns turn out to be missing.
  function joinList(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
  }

  Object.keys(SHEET_KEY_COLUMNS).forEach(function (tabName) {
    const found = arrived[tabName];

    // No headers at all means the tab did not load, or is completely empty.
    // Both are already reported by something better placed to explain them,
    // and listing every column as missing on top of that is just noise.
    if (!found || found.length === 0) return;

    const missing = SHEET_KEY_COLUMNS[tabName].filter(function (key) {
      return found.indexOf(key) === -1;
    });
    if (missing.length === 0) return;

    const pointsAtStake = tabAffectsPoints(tabName);
    const columnWord = missing.length === 1 ? "column" : "columns";

    report.add(
      pointsAtStake ? VALIDATION_LEVEL.ERROR : VALIDATION_LEVEL.WARNING,
      tabName,
      "",
      'The "' + tabName + '" tab has no ' + joinList(missing) + " " +
        columnWord + ", so every row read as blank there" +
        (pointsAtStake
          ? " and the standings on the site are wrong."
          : " and that detail is missing from the pages that show it.") +
        " The headings it does have are: " + found.join(", ") + ". Either the " +
        "heading in row 1 was renamed or deleted, or this is not the " + tabName +
        " tab at all. Put the heading back exactly as " + joinList(missing) +
        " and reload.",
      missing.join(", ")
    );
  });
}

/**
 * Report Results / Rosters rows that point at an event_id no event has —
 * almost always a typo in the event code. The rows are invisible on the site,
 * so this is the only way the maintainer will ever find out.
 *
 * NO PHOTOS ENTRY. The Photos tab is not fetched at all while that feature is
 * dormant (config.js explains why), so `unlinked.photos` is always empty and a
 * Photos line here could never fire. Same rule as everywhere else in this file:
 * a check that cannot fire is worse than no check, because it reads like cover
 * that isn't there. Re-enabling photos means putting this line back — CLAUDE.md
 * lists it with the other steps.
 */
function checkUnlinkedRows(data, report) {
  const unlinked = data.unlinked || { results: [], rosters: [] };

  const tabs = [
    { tab: "Results", entries: unlinked.results },
    { tab: "Rosters", entries: unlinked.rosters },
  ];

  tabs.forEach(function (group) {
    (group.entries || []).forEach(function (entry) {
      const eventId = entry.eventId === "" ? "(blank)" : entry.eventId;
      report.add(
        VALIDATION_LEVEL.WARNING,
        group.tab,
        eventId,
        entry.rowCount +
          " row(s) use event_id " +
          (entry.eventId === "" ? "(blank)" : '"' + entry.eventId + '"') +
          ", which matches no event in the Events tab. These rows are not shown anywhere."
      );
    });
  });
}

// =====================================================================
// SECTION 6b — checks that can only run AFTER the maths
// =====================================================================

/**
 * Write out a placing order in words: "1: Beta, 2: Alpha, 3: Gamma".
 *
 * Used to compare two orders by eye AND in code — if the two strings match, the
 * orders match, which keeps the comparison and the message that reports it from
 * ever disagreeing with each other.
 */
function describePlacingOrder(byPosition, houses) {
  return Object.keys(byPosition)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    })
    .map(function (position) {
      const names = byPosition[position]
        .slice()
        .sort()
        .map(function (houseId) {
          const house = houses.find(function (candidate) {
            return candidate.id === houseId;
          });
          return house ? house.name : houseId;
        });
      return position + ": " + names.join(" & ");
    })
    .join(", ");
}

/**
 * A Calculated event that ALSO has direct_1st/2nd/3rd filled in.
 *
 * Those cells do nothing on a Calculated event — the house order is worked out
 * from the Results tab — so somebody who filled them expecting them to count is
 * quietly getting a different answer from the one they typed.
 *
 * TWO LEVELS, because the two cases are genuinely different:
 *
 *   they AGREE with the computed order    → ADVISORY. Nothing is wrong; the
 *     cells are simply redundant. This fires on data that is completely correct
 *     (the live Sheet has exactly this today), and by this project's rule a
 *     check that can fire on correct data must not be a warning.
 *
 *   they DISAGREE                         → WARNING. The published house order
 *     is not the one someone typed, which almost always means the wrong
 *     results_mode was chosen. Nothing was dropped and no points are wrong —
 *     the Results are being scored exactly as they should be — so this is a
 *     warning rather than an error.
 *
 * WHY THIS LIVES HERE AND NOT WITH THE OTHER EVENT CHECKS: it needs the answer
 * calculate.js works out, which does not exist while the ordinary checks run.
 * main.js calls this after the maths — see validateScoredData below.
 */
function checkIgnoredDirectPlacings(event, houses, report) {
  if (event.resultsMode !== RESULTS_MODE.CALCULATED) return;

  const placings = event.directPlacings || [];
  if (placings.length === 0) return; // the normal case: cells left blank

  // What somebody typed into the Events tab…
  const typed = {};
  placings.forEach(function (placing) {
    if (!typed[placing.position]) typed[placing.position] = [];
    typed[placing.position].push(placing.houseId);
  });

  // …and what the site actually awarded, from the Results tab.
  const computed = {};
  (event.tier1Display || []).forEach(function (group) {
    computed[group.position] = group.houseIds.slice();
  });

  const typedOrder = describePlacingOrder(typed, houses);
  const computedOrder = describePlacingOrder(computed, houses);

  const preamble =
    "This event is scored as Calculated, so its house order comes from the " +
    "Results tab — the direct_1st/2nd/3rd cells are not used and have no effect. ";

  if (typedOrder === computedOrder) {
    report.add(
      VALIDATION_LEVEL.ADVISORY,
      "Events",
      event.id,
      preamble +
        "They happen to match what the Results add up to (" + computedOrder +
        "), so nothing is wrong — you can leave them or clear them.",
      "direct_1st"
    );
    return;
  }

  report.add(
    VALIDATION_LEVEL.WARNING,
    "Events",
    event.id,
    preamble +
      "They say " + (typedOrder || "nothing usable") + ", but the Results add " +
      "up to " + (computedOrder || "no placings at all") + " — and it is the " +
      "Results that are published. If the typed order is the official one, set " +
      "results_mode to Override; otherwise you can clear those cells.",
    "results_mode"
  );
}

/**
 * The second pass: everything that can only be judged once calculate.js has
 * produced its answers.
 *
 * main.js calls this immediately after calculateAll, and adds what it returns to
 * the same warnings list the first pass produced — so the ?debug panel shows
 * both together and neither module has to know about the other.
 *
 * Returns an array of warnings, in the same shape as validateSiteData's.
 */
function validateScoredData(data) {
  const report = createReport();
  if (!data) return report.warnings;

  const houses = data.houses || [];
  (data.events || []).forEach(function (event) {
    checkIgnoredDirectPlacings(event, houses, report);
  });

  return report.warnings;
}

// =====================================================================
// SECTION 7 — the one public function
// =====================================================================

/**
 * Check and clean the canonical data object.
 *
 * The object is cleaned IN PLACE and handed back, so main.js can simply do:
 *     const { data, warnings, ok } = validateSiteData(await loadSiteData());
 *
 * Returns:
 *   data     — the same object, with unusable rows removed
 *   warnings — every problem found, in report order (for the ?debug view)
 *   fatal    — true if the site should show the friendly fallback instead
 *   ok       — the opposite of fatal, for readability at the call site
 *   counts   — how many of each level, handy for a debug summary line
 */
function validateSiteData(data) {
  const report = createReport();

  // --- guard: nothing to check at all ---
  if (!data) {
    report.add(
      VALIDATION_LEVEL.FATAL,
      "Sheet",
      "",
      "No data was loaded from the Sheet."
    );
    return buildResult(null, report);
  }

  // First: did every tab actually arrive, whole, and by the reliable route? A
  // tab that failed to load, came back missing a column, or had to fall back to
  // reading by name all mean the page is about to render from less than the
  // Sheet holds — and none of them are visible anywhere else.
  checkTabErrors(data, report);
  checkTabNotes(data, report);
  checkMissingColumns(data, report);
  checkSheetViewDifferences(data, report);

  checkConfig(data, report);

  // Houses first: every later check needs to know which house ids are real.
  data.houses = checkHouses(data, report);
  const knownHouseIds = {};
  data.houses.forEach(function (house) {
    knownHouseIds[house.id] = true;
  });

  data.events = checkEvents(data, report, knownHouseIds);
  checkDateFormatConsistency(data.events, report);
  data.extraPoints = checkExtraPoints(data, report, knownHouseIds);
  checkUnlinkedRows(data, report);

  return buildResult(data, report);
}

/** Package the report up, and leave one summary line in the console. */
function buildResult(data, report) {
  const counts = { fatal: 0, error: 0, warning: 0, advisory: 0 };
  report.warnings.forEach(function (entry) {
    counts[entry.level]++;
  });

  const isFatal = counts.fatal > 0;

  // Advisories are deliberately left out of this summary. They are hunches, not
  // problems, and mentioning them here would put a number on the console that
  // implies something is wrong when nothing is.
  const realProblems = counts.fatal + counts.error + counts.warning;

  if (realProblems === 0) {
    console.log("validate.js: data checked — no problems found.");
  } else {
    console.log(
      "validate.js: data checked — " +
        counts.fatal +
        " fatal, " +
        counts.error +
        " error(s), " +
        counts.warning +
        " warning(s). Add ?debug to the site URL to see these on screen."
    );
  }

  return {
    data: data,
    warnings: report.warnings,
    fatal: isFatal,
    ok: !isFatal,
    counts: counts,
  };
}
