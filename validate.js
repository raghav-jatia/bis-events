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
 * Three severities, chosen by CONSEQUENCE rather than by how odd the data looks:
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

/** A valid CSS hex colour: #abc or #aabbcc. */
function isValidHexColour(text) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(text || "").trim());
}

// Date checking uses parseSheetDate() from utils.js — one date parser for the
// whole site, so "what counts as a valid date" can never drift between the
// module that checks dates and the module that displays them.

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

  // --- the point schemes: without these, events cannot be scored ---
  const schemeKeys = [
    { key: "sports_scheme", value: config.schemes.sports },
    { key: "cocurricular_scheme", value: config.schemes.cocurricular },
    { key: "tier2_scheme", value: config.schemes.tier2 },
  ];
  let validSchemes = 0;
  schemeKeys.forEach(function (entry) {
    if (entry.value === null) {
      report.add(
        VALIDATION_LEVEL.ERROR,
        "Config",
        entry.key,
        'Missing or unreadable "' +
          entry.key +
          '". It must be numbers separated by commas, e.g. "10,7,4". Events relying on it cannot be scored.'
      );
    } else {
      validSchemes++;
    }
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
    if (!isValidHexColour(house.color)) {
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

    // Clean the scoring data. Order matters: placings are cleaned before we
    // ask whether a completed event has any placings left.
    event.tier2 = cleanTier2(event, report, knownHouseIds);
    event.directPlacings = cleanDirectPlacings(event, report, knownHouseIds);
    event.roster = cleanRoster(event, report, knownHouseIds);

    checkCompletedEventHasResults(event, report);

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
        ". This event will not appear in any view, and its points will not reach the leaderboards.",
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

  const mode = matchAllowedValue(event.resultsMode, allowedModes);
  if (mode === null) {
    report.add(
      VALIDATION_LEVEL.ERROR,
      "Events",
      event.id,
      'Results mode "' +
        event.resultsMode +
        '" is not one of: ' +
        allowedModes.join(", ") +
        ". The site will not know how to score this event.",
      "results_mode"
    );
  } else {
    event.resultsMode = mode;
  }
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

  if (event.resultsMode === RESULTS_MODE.DIRECT) {
    if ((event.directPlacings || []).length === 0) {
      report.add(
        VALIDATION_LEVEL.WARNING,
        "Events",
        event.id,
        "This event is marked Completed and Direct but has no house placings in direct_1st/2nd/3rd, so it will award no points."
      );
    }
  }
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
 * Report Results / Rosters / Photos rows that point at an event_id no event
 * has — almost always a typo in the event code. The rows are invisible on the
 * site, so this is the only way the maintainer will ever find out.
 */
function checkUnlinkedRows(data, report) {
  const unlinked = data.unlinked || { results: [], rosters: [], photos: [] };

  const tabs = [
    { tab: "Results", entries: unlinked.results },
    { tab: "Rosters", entries: unlinked.rosters },
    { tab: "Photos", entries: unlinked.photos },
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

  checkConfig(data, report);

  // Houses first: every later check needs to know which house ids are real.
  data.houses = checkHouses(data, report);
  const knownHouseIds = {};
  data.houses.forEach(function (house) {
    knownHouseIds[house.id] = true;
  });

  data.events = checkEvents(data, report, knownHouseIds);
  data.extraPoints = checkExtraPoints(data, report, knownHouseIds);
  checkUnlinkedRows(data, report);

  return buildResult(data, report);
}

/** Package the report up, and leave one summary line in the console. */
function buildResult(data, report) {
  const counts = { fatal: 0, error: 0, warning: 0 };
  report.warnings.forEach(function (entry) {
    counts[entry.level]++;
  });

  const isFatal = counts.fatal > 0;

  if (report.warnings.length === 0) {
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
