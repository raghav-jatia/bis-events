// data.js
// What this file does: this is the ONLY module in the whole site that knows
// Google Sheets exists. It fetches every tab, parses the CSV, and hands back
// one clean in-memory object shaped exactly like blueprint §5 (the "contract").
//
// Everything else in the site reads that object and nothing else. If the data
// source is ever swapped (V3: a real database), this file is the only one that
// needs rewriting — as long as it keeps returning the same shape.
//
// What this file does NOT do:
//   - No points maths. Not one addition. That is calculate.js's job.
//   - No DOM, no HTML, no colours-on-screen. That is render.js's job.
//   - No hard validation. Bad rows are carried through as-is (with a warning)
//     so validate.js can decide what to skip.
//
// Public entry point: loadSiteData()  →  Promise<canonical data object>

// =====================================================================
// SECTION 1 — CSV parsing
// =====================================================================

/**
 * Turn one big CSV string into a grid (array of rows, each row an array of
 * cell strings).
 *
 * We can't just do text.split(",") because a spreadsheet cell is allowed to
 * contain commas, line breaks and quote marks. The CSV rules Google follows:
 *
 *   - A field MAY be wrapped in double quotes. Google quotes every field.
 *   - Inside a quoted field, a comma or a newline is just ordinary text.
 *   - Inside a quoted field, a real double-quote character is written twice.
 *     e.g. the write-up  ...the motion "social media..."  arrives as
 *          "...the motion ""social media..."""
 *
 * So we walk the text one character at a time, remembering whether we are
 * currently inside quotes. That is the whole trick.
 */
function parseCsv(text) {
  // Some servers prefix the file with a byte-order-mark; strip it or it ends
  // up glued to the first header name and no column ever matches.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows = [];
  let row = []; // cells collected for the current line
  let field = ""; // characters collected for the current cell
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Two quotes in a row = one literal quote character in the data.
          field += '"';
          i++; // step over the second quote
        } else {
          // A lone quote ends the quoted section.
          inQuotes = false;
        }
      } else {
        // Commas and newlines in here are ordinary text — keep them.
        field += char;
      }
      continue;
    }

    // --- not inside quotes: the punctuation actually means something ---
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field); // end of a cell
      field = "";
    } else if (char === "\n") {
      row.push(field); // end of the last cell on this line
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Windows line endings are "\r\n"; ignore the "\r" and let "\n" do the work.
    } else {
      field += char;
    }
  }

  // Whatever is still in hand when the text runs out is the final cell/row.
  row.push(field);
  rows.push(row);

  return rows;
}

/**
 * Turn the CSV grid into a list of plain objects keyed by column name.
 *
 * Blueprint rule: the site matches columns BY HEADER NAME, never by position,
 * so a maintainer can safely reorder columns in the Sheet.
 *
 * Two quirks of Google's CSV export we clean up here:
 *   1. Every row is padded out to ~26 columns with empty strings. Those extra
 *      columns have a blank header, so we drop any blank-headered column.
 *   2. Sheets often contain leftover blank rows (the Events tab currently ends
 *      with a row holding a single space). We drop rows that are entirely blank.
 */
function gridToObjects(grid) {
  if (grid.length === 0) return [];

  // --- work out which columns are real, from the header row ---
  const headerRow = grid[0];
  const columns = []; // { index, key }
  headerRow.forEach((rawHeader, index) => {
    const key = normaliseHeader(rawHeader);
    if (key !== "") {
      columns.push({ index: index, key: key });
    }
  });

  // --- build one object per remaining row ---
  const objects = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const object = {};
    let hasContent = false;

    columns.forEach(function (column) {
      const value = cleanCell(cells[column.index]);
      object[column.key] = value;
      if (value !== "") hasContent = true;
    });

    if (hasContent) {
      objects.push(object); // skip fully-blank spacer rows
    }
  }

  return objects;
}

/**
 * Header names are normalised so small typing differences in the Sheet don't
 * break the site: "Event ID", "event_id" and " EVENT_ID " all become "event_id".
 */
function normaliseHeader(rawHeader) {
  return String(rawHeader == null ? "" : rawHeader)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Every cell value is trimmed; a missing cell reads as an empty string. */
function cleanCell(rawValue) {
  return String(rawValue == null ? "" : rawValue).trim();
}

// =====================================================================
// SECTION 2 — fetching the tabs
// =====================================================================

/**
 * Fetch one tab and return it as a list of row-objects.
 *
 * The "&headers=1" is important and easy to lose: without it Google *guesses*
 * how many header rows there are, and on a text-only tab like Config it guesses
 * wrong — it swallows the first several data rows into the header.
 */
async function fetchTab(tabName) {
  const url =
    SHEET_CSV_BASE_URL +
    "?tqx=out:csv&headers=1&sheet=" +
    encodeURIComponent(tabName);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      'Could not load the "' + tabName + '" tab (HTTP ' + response.status + ")."
    );
  }

  const text = await response.text();

  // If the Sheet isn't shared publicly, Google serves a sign-in HTML page with
  // a 200 status instead of CSV. Catch that here so the error is understandable.
  if (text.trim().startsWith("<")) {
    throw new Error(
      'The Sheet returned a web page instead of data for the "' +
        tabName +
        '" tab. Check the workbook is shared as "anyone with the link can view".'
    );
  }

  return gridToObjects(parseCsv(text));
}

// =====================================================================
// SECTION 3 — small shared helpers
// =====================================================================
// (These are deliberately tiny. When utils.js is created they can move there.)

/** "10,7,4" → [10, 7, 4]. Anything unparseable → null, so callers can fall back. */
function parseScheme(text) {
  if (!text) return null;
  const numbers = text.split(",").map(function (part) {
    return Number(part.trim());
  });
  const allValid = numbers.length > 0 && numbers.every(function (n) {
    return Number.isFinite(n);
  });
  return allValid ? numbers : null;
}

/** Safe number parse. Returns null (never NaN) so bad data is obvious downstream. */
function parseNumber(text) {
  if (text === "" || text == null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * The Sheet's placing columns hold house NAMES ("Beta"), because that's what the
 * dropdowns offer — but the canonical shape stores house IDs ("B"). This looks a
 * token up either way, case-insensitively.
 *
 * A place cell may hold TWO comma-separated houses (a tie), so this always
 * returns an array.
 *
 * Unrecognised text is kept as `houseRaw` with `houseId: null` rather than
 * thrown away — validate.js decides what to do about it, not this file.
 */
function resolveHouses(cellText, houseLookup) {
  if (!cellText) return [];

  return cellText.split(",").map(function (token) {
    const raw = token.trim();
    const match = houseLookup[raw.toLowerCase()];
    if (!match) {
      console.warn(
        'data.js: "' + raw + '" does not match any house in the Houses tab.'
      );
    }
    return { houseId: match ? match.id : null, houseRaw: raw };
  });
}

/** Build a lookup so a house can be found by either its id ("A") or name ("Alpha"). */
function buildHouseLookup(houses) {
  const lookup = {};
  houses.forEach(function (house) {
    if (house.id) lookup[house.id.toLowerCase()] = house;
    if (house.name) lookup[house.name.toLowerCase()] = house;
  });
  return lookup;
}

// =====================================================================
// SECTION 4 — turning raw rows into the canonical shape (blueprint §5)
// =====================================================================

/**
 * Config tab is key/value pairs, one setting per row. We map the keys the site
 * relies on into named properties, and keep every raw key as well so a new
 * setting added to the Sheet is still reachable without a code change.
 */
function buildConfig(configRows) {
  const values = {};
  configRows.forEach(function (row) {
    if (row.key) values[row.key] = row.value || "";
  });

  return {
    schoolName: values.school_name || "",
    schoolShort: values.school_short || "",
    siteTitle: values.site_title || "",
    logoUrl: values.logo_url || "",
    seasonLabel: values.season_label || "",
    currentYear: values.current_year || "",
    termStart: values.term_start || "",
    termEnd: values.term_end || "",
    timezone: values.timezone || "",
    schemes: {
      sports: parseScheme(values.sports_scheme),
      cocurricular: parseScheme(values.cocurricular_scheme),
      tier2: parseScheme(values.tier2_scheme),
    },
    raw: values, // every Config key exactly as typed, for debugging / future keys

    // The untouched key/value rows. `raw` above collapses duplicates (last one
    // wins), which would hide a maintainer accidentally typing the same key
    // twice — so validate.js reads these rows instead to spot that.
    rawRows: configRows,
  };
}

/** Houses tab → [{ id, name, color }] in Sheet order. */
function buildHouses(houseRows) {
  return houseRows.map(function (row) {
    return {
      id: row.house_id || "",
      name: row.name || "",
      color: row.color_hex || "",
    };
  });
}

/**
 * Results tab → the tier2 structure, grouped by event and then by category.
 *
 * One Sheet row = one category (e.g. "Under 14") with up to three placings.
 * The canonical shape flattens those into a places[] list:
 *     { rank: 1, name: "Rehan Desai", houseId: "B" }
 *
 * Blank place cells simply produce no entry (a place that wasn't awarded).
 * Ties (two houses in one cell) produce one entry per house at the same rank;
 * where the name cell also lists two names they are paired up in order.
 */
function buildTier2ByEvent(resultRows, houseLookup) {
  const byEvent = {}; // event_id → [ { category, places } ]

  const PLACES = [
    { rank: 1, nameColumn: "gold_name", houseColumn: "gold_house" },
    { rank: 2, nameColumn: "silver_name", houseColumn: "silver_house" },
    { rank: 3, nameColumn: "bronze_name", houseColumn: "bronze_house" },
  ];

  resultRows.forEach(function (row) {
    const eventId = row.event_id || "";
    const places = [];

    PLACES.forEach(function (place) {
      const houses = resolveHouses(row[place.houseColumn], houseLookup);
      if (houses.length === 0) return; // place not awarded — nothing to record

      // A tie may also carry two participant names, comma-separated.
      const names = (row[place.nameColumn] || "")
        .split(",")
        .map(function (part) {
          return part.trim();
        });

      houses.forEach(function (house, index) {
        places.push({
          rank: place.rank,
          // Pair names to houses by position; if only one name was given for a
          // tie, both entries keep that name rather than losing it.
          name: names[index] !== undefined ? names[index] : names[0] || "",
          houseId: house.houseId,
          houseRaw: house.houseRaw,
        });
      });
    });

    if (!byEvent[eventId]) byEvent[eventId] = [];
    byEvent[eventId].push({ category: row.category || "", places: places });
  });

  return byEvent;
}

/** Rosters tab → event_id → [ { houseId, name } ]. */
function buildRosterByEvent(rosterRows, houseLookup) {
  const byEvent = {};

  rosterRows.forEach(function (row) {
    const eventId = row.event_id || "";
    // A roster cell names exactly one house, but reuse the same resolver so the
    // name→id rule lives in one place only.
    const house = resolveHouses(row.house, houseLookup)[0];

    if (!byEvent[eventId]) byEvent[eventId] = [];
    byEvent[eventId].push({
      houseId: house ? house.houseId : null,
      houseRaw: house ? house.houseRaw : "",
      name: row.participant_name || "",
    });
  });

  return byEvent;
}

/** Photos tab → event_id → [ { url, caption } ]. */
function buildPhotosByEvent(photoRows) {
  const byEvent = {};

  photoRows.forEach(function (row) {
    const eventId = row.event_id || "";
    if (!byEvent[eventId]) byEvent[eventId] = [];
    byEvent[eventId].push({
      url: row.image_url || "",
      caption: row.caption || "",
    });
  });

  return byEvent;
}

/**
 * Events tab → the events[] array, with Results / Rosters / Photos rows attached
 * to their event by matching event_id (blueprint §2: "adding an event = adding
 * rows, never adding tabs").
 */
function buildEvents(eventRows, tier2ByEvent, rosterByEvent, photosByEvent, houseLookup) {
  return eventRows.map(function (row) {
    const eventId = row.event_id || "";

    // For Direct events the house placings are typed straight into the Events
    // tab. We carry them through untouched — turning a placing into POINTS is
    // calculate.js's job, not ours.
    const directPlacings = [];
    [
      { position: 1, column: "direct_1st" },
      { position: 2, column: "direct_2nd" },
      { position: 3, column: "direct_3rd" },
    ].forEach(function (place) {
      resolveHouses(row[place.column], houseLookup).forEach(function (house) {
        directPlacings.push({
          position: place.position,
          houseId: house.houseId,
          houseRaw: house.houseRaw,
        });
      });
    });

    return {
      id: eventId,
      year: row.year || "",
      name: row.name || "",
      type: row.type || "",
      date: row.date || "", // kept as the Sheet's own string; utils.js formats it
      grades: row.grades || "",
      venue: row.venue || "",
      status: row.status || "",
      resultsMode: row.results_mode || "",

      // --- inputs the points engine needs ---
      tier1Override: parseScheme(row.tier1_override), // null = use the default by type
      directPlacings: directPlacings, // only meaningful when resultsMode = Direct

      // --- PLACEHOLDER: filled in by calculate.js ---
      // Per blueprint §5 this ends up as [ { houseId, position, points } ].
      // data.js never computes points, so it starts empty.
      tier1: [],

      // --- raw data attached by event_id ---
      tier2: tier2ByEvent[eventId] || [], // Calculated events only
      roster: rosterByEvent[eventId] || [],
      photos: photosByEvent[eventId] || [],

      writeup: row.writeup || "",
      photoFolder: row.photo_folder || "", // Drive folder (blueprint §9)

      // Optional link to this event's live mini-site. The column may not exist
      // in the Sheet at all, which simply reads as "" and hides the section.
      minisiteUrl: row.minisite_url || "",
    };
  });
}

/**
 * Find Results / Rosters / Photos rows whose event_id matches no event.
 *
 * Those rows are invisible to the site — buildEvents() only attaches rows whose
 * event_id it recognises — so without this they would disappear without trace
 * and a maintainer would never learn they mistyped an event code. We simply
 * report what was left over; validate.js decides how loudly to complain.
 */
function findUnlinkedRows(events, tier2ByEvent, rosterByEvent, photosByEvent) {
  const knownEventIds = {};
  events.forEach(function (event) {
    knownEventIds[event.id] = true;
  });

  function leftovers(byEvent) {
    return Object.keys(byEvent)
      .filter(function (eventId) {
        return !knownEventIds[eventId];
      })
      .map(function (eventId) {
        return { eventId: eventId, rowCount: byEvent[eventId].length };
      });
  }

  return {
    results: leftovers(tier2ByEvent),
    rosters: leftovers(rosterByEvent),
    photos: leftovers(photosByEvent),
  };
}

/** Extra Points tab → [ { year, houseId, reason, date, points } ]. */
function buildExtraPoints(extraRows, houseLookup) {
  return extraRows.map(function (row) {
    const house = resolveHouses(row.house, houseLookup)[0];
    return {
      year: row.year || "",
      houseId: house ? house.houseId : null,
      houseRaw: house ? house.houseRaw : "",
      reason: row.reason || "",
      date: row.date || "",
      points: parseNumber(row.points), // may be negative (a deduction)
    };
  });
}

// =====================================================================
// SECTION 5 — the one public function
// =====================================================================

/**
 * Load everything and return the canonical site data object (blueprint §5).
 *
 * This is the only function anything else in the site should call, and the only
 * place a network request is made. Rejects if the Sheet cannot be read at all —
 * main.js turns that into the calm fallback message described in blueprint §17.
 */
async function loadSiteData() {
  // All seven tabs are fetched at the same time rather than one after another,
  // so the page waits for the slowest single request, not the sum of them.
  const [
    configRows,
    houseRows,
    eventRows,
    resultRows,
    extraRows,
    rosterRows,
    photoRows,
  ] = await Promise.all([
    fetchTab(SHEET_TABS.CONFIG),
    fetchTab(SHEET_TABS.HOUSES),
    fetchTab(SHEET_TABS.EVENTS),
    fetchTab(SHEET_TABS.RESULTS),
    fetchTab(SHEET_TABS.EXTRA_POINTS),
    fetchTab(SHEET_TABS.ROSTERS),
    fetchTab(SHEET_TABS.PHOTOS),
  ]);

  // Houses must be built first: everything else translates house names → ids.
  const houses = buildHouses(houseRows);
  const houseLookup = buildHouseLookup(houses);

  const tier2ByEvent = buildTier2ByEvent(resultRows, houseLookup);
  const rosterByEvent = buildRosterByEvent(rosterRows, houseLookup);
  const photosByEvent = buildPhotosByEvent(photoRows);

  const events = buildEvents(
    eventRows,
    tier2ByEvent,
    rosterByEvent,
    photosByEvent,
    houseLookup
  );

  return {
    config: buildConfig(configRows),
    houses: houses,
    events: events,
    extraPoints: buildExtraPoints(extraRows, houseLookup),

    // Rows that referenced an event_id no event has. Not shown anywhere on the
    // site — kept only so validate.js can report them (see findUnlinkedRows).
    unlinked: findUnlinkedRows(
      events,
      tier2ByEvent,
      rosterByEvent,
      photosByEvent
    ),

    // --- PLACEHOLDER: filled in by calculate.js ---
    // Becomes { overall:[{houseId,points,rank}], sports:[…], cocurricular:[…],
    // extra:[{houseId,points}] }. It is null (not {}) so any view that reads it
    // before the maths has run fails loudly in development instead of silently
    // rendering zeros.
    standings: null,

    // When this data was pulled — the header's "last updated" timestamp.
    loadedAt: new Date().toISOString(),
  };
}
