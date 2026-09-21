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
//   - No DOM, no HTML, no colours-on-screen. That is the render files' job.
//   - No validation and no complaining. Bad rows are carried through exactly as
//     they arrived, and validate.js decides what to skip and what to report.
//     This file does not even warn about them: it would be reporting the same
//     fault validate.js reports properly, naming the tab, row and column.
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
 * The column names a tab actually arrived with, normalised the same way
 * gridToObjects normalises them.
 *
 * Worth keeping separately because the row objects can't answer the question.
 * A column that is present but empty and a column that is absent altogether
 * both read as "" on every row — yet one is a blank cell and the other is a
 * whole field the site has silently stopped seeing. validate.js needs to tell
 * those two apart, and only the header row can.
 */
function gridColumns(grid) {
  if (grid.length === 0) return [];
  return grid[0]
    .map(normaliseHeader)
    .filter(function (key) {
      return key !== "";
    });
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

/** The primary route: the plain CSV export, addressed by the tab's gid. */
function tabUrlByGid(tab) {
  return SHEET_EXPORT_BASE_URL + "&gid=" + encodeURIComponent(tab.gid);
}

/**
 * The fallback route: gviz, addressed by tab name.
 *
 * The "&headers=1" is important and easy to lose: without it Google *guesses*
 * how many header rows there are, and on a text-only tab like Config it guesses
 * wrong — it swallows the first several data rows into the header.
 */
function tabUrlByName(tab) {
  return (
    SHEET_CSV_BASE_URL +
    "?tqx=out:csv&headers=1&sheet=" +
    encodeURIComponent(tab.name)
  );
}

/** Fetch one URL as CSV text, turning every kind of failure into a clear error. */
async function fetchCsv(url, tabName) {
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

  return text;
}

/** CSV text → the rows the site works from, plus the columns they came with. */
function parseTab(text) {
  const grid = parseCsv(text);
  return { rows: gridToObjects(grid), columns: gridColumns(grid) };
}

/**
 * Fetch one tab, by gid if we have one and by name if we don't.
 *
 * WHY THE GID COMES FIRST. Reading by name goes through gviz, which quietly
 * drops hidden or filtered-out rows and blanks any cell that doesn't match the
 * type it guessed for the column (config.js has the measurements). Neither shows
 * up anywhere on the page: the site just computes from less data than the Sheet
 * holds. Reading by gid is the ordinary CSV download and has neither problem.
 *
 * The name route is kept as a safety net rather than dropped, because a gid can
 * legitimately stop working — delete a tab and retype it and it gets a new one —
 * and losing the whole tab would be a worse failure than reading it the old way.
 * Whenever that happens we record a note, so the compromise is never silent.
 *
 * Returns { rows, columns, note } — note is null on the normal path.
 */
async function fetchTab(tab) {
  if (tab.gid) {
    try {
      const result = parseTab(await fetchCsv(tabUrlByGid(tab), tab.name));
      result.note = null;
      return result;
    } catch (gidError) {
      // The gid didn't work. Try the name before giving up — but say so.
      const result = parseTab(await fetchCsv(tabUrlByName(tab), tab.name));
      result.note = {
        tab: tab.name,
        reason:
          "its gid (" + tab.gid + ") no longer works, so it was read by name " +
          "instead. (" + gidError.message + ")",
      };
      return result;
    }
  }

  const result = parseTab(await fetchCsv(tabUrlByName(tab), tab.name));
  result.note = {
    tab: tab.name,
    reason: "no gid is recorded for it in config.js, so it was read by name.",
  };
  return result;
}

// =====================================================================
// SECTION 2b — event photos, from Drive (blueprint §9)
// =====================================================================

/**
 * Fetch a URL, but give up after a set time.
 *
 * Without this a slow or hanging photo script would keep the page waiting
 * indefinitely. AbortController lets us walk away.
 */
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask the Apps Script for one event's photos.
 *
 * Always resolves — never rejects. A missing folder, a script that is down, a
 * network blip, a timeout: all of them come back as an empty list plus a
 * console note. Photos are decoration, and decoration must never take a page
 * down with it.
 */
async function fetchPhotosForFolder(eventId, folderLink) {
  const separator = PHOTO_SCRIPT_URL.indexOf("?") === -1 ? "?" : "&";
  const url = PHOTO_SCRIPT_URL + separator + "folder=" + encodeURIComponent(folderLink);

  try {
    const response = await fetchWithTimeout(url, PHOTO_FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error("HTTP " + response.status);

    const payload = await response.json();

    // The script answers with { ok: false, error: "..." } for ordinary
    // problems like a folder nobody shared. That is information, not a crash.
    if (!payload || payload.ok !== true) {
      console.warn(
        'data.js: no photos for event "' + eventId + '" — ' +
        ((payload && payload.error) || "the photo script gave no answer.")
      );
      return [];
    }

    return (payload.photos || []).map(function (photo) {
      return {
        url: photo.url || "",
        // Google has changed which Drive address works for embedding more than
        // once; render-detail.js tries this if the first one fails to load.
        fallbackUrl: photo.fallbackUrl || "",
        // The filename stands in as the caption when nobody wrote one.
        caption: photo.name || "",
      };
    });
  } catch (error) {
    const reason = error.name === "AbortError"
      ? "the photo script took too long to answer"
      : error.message;
    console.warn(
      'data.js: could not load photos for event "' + eventId + '" — ' + reason +
      ". The rest of the page is unaffected."
    );
    return [];
  }
}

/**
 * Load photos for every event that names a Drive folder, all at once.
 *
 * Events without a photo_folder are not asked about at all. If the script URL
 * has not been configured yet, nothing is requested and the feature is simply
 * dormant.
 *
 * The results are written straight onto the events. Folder photos REPLACE the
 * rows from the Photos tab, because the folder is the primary route; if the
 * folder yields nothing, whatever the Photos tab provided is left in place as
 * the fallback.
 */
async function loadEventPhotos(events) {
  if (!PHOTO_SCRIPT_URL) return;

  const eventsWithFolders = events.filter(function (event) {
    return event.photoFolder;
  });
  if (eventsWithFolders.length === 0) return;

  await Promise.all(
    eventsWithFolders.map(async function (event) {
      const photos = await fetchPhotosForFolder(event.id, event.photoFolder);
      if (photos.length > 0) {
        event.photos = photos;
      }
    })
  );
}

// =====================================================================
// SECTION 3 — matching Sheet text to houses
// =====================================================================
// (The number parsers this section used to hold — parseScheme and parseNumber —
// now live in utils.js, which is where shared parsing belongs.)

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
 *
 * Deliberately SILENT about a name it doesn't recognise. validate.js reports
 * exactly that fault already, and reports it far better: it knows whether the
 * name was in a result, a roster or an extra-points row, and it names the tab,
 * the row and the column to go and fix. Warning here as well would put the same
 * mistake in the console twice, in two different wordings.
 */
function resolveHouses(cellText, houseLookup) {
  if (!cellText) return [];

  return cellText.split(",").map(function (token) {
    const raw = token.trim();
    const match = houseLookup[raw.toLowerCase()];
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
      // Optional age/section grouping, e.g. "Under 14". The column may not
      // exist in the Sheet at all, which simply reads as "" — and an event
      // whose roster rows are all blank here renders as one flat list per
      // house, exactly as before this column existed.
      category: row.category || "",
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
      // The cell exactly as typed. Kept because a scheme that FAILS to parse
      // becomes null above, and validate.js needs the original text to explain
      // what is wrong with it.
      tier1OverrideRaw: row.tier1_override || "",

      // The same idea one tier down: what each individual PLACING inside this
      // event's categories is worth. null = use Config's tier2_scheme.
      // Only meaningful when resultsMode = Calculated, because that is the only
      // mode that tallies category results at all.
      tier2Override: parseScheme(row.tier2_override),
      tier2OverrideRaw: row.tier2_override || "",

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

      // Optional free-text note shown with the results — e.g. explaining why a
      // house order was set by hand, or a scoring quirk worth mentioning.
      // Plain text only: unlike `writeup` it takes no <highlight> markup.
      resultNote: row.result_note || "",
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
 * Which tabs the site cannot live without, and which it can manage without.
 *
 * WHY THE DISTINCTION. Without Config there are no point schemes, without
 * Houses there is nobody to score, and without Events there is nothing to show:
 * any of those missing means there is no site, so they are fatal. Everything
 * else only makes the page *less complete*, and taking the whole site down
 * because a decorative tab is missing would be a worse failure than the one it
 * is reacting to.
 *
 * `affectsPoints` says how loudly validate.js should complain: losing Results
 * or Extra Points changes the standings and is an error; losing Rosters only
 * removes something from a page and is a warning.
 */
const SHEET_TAB_PLAN = [
  { key: "config",  tab: SHEET_TABS.CONFIG,       required: true },
  { key: "houses",  tab: SHEET_TABS.HOUSES,       required: true },
  { key: "events",  tab: SHEET_TABS.EVENTS,       required: true },
  { key: "results", tab: SHEET_TABS.RESULTS,      required: false, affectsPoints: true },
  { key: "extra",   tab: SHEET_TABS.EXTRA_POINTS, required: false, affectsPoints: true },
  { key: "rosters", tab: SHEET_TABS.ROSTERS,      required: false, affectsPoints: false },
  // No Photos entry: the tab is deliberately not fetched while the photos
  // feature is dormant. config.js explains why and how to put it back.
];

/**
 * Fetch every tab at once, and survive the loss of an optional one.
 *
 * allSettled rather than all: Promise.all rejects the moment ANY request fails,
 * which used to mean that deleting the unused Photos tab took the entire site
 * down. Now a failed optional tab simply arrives as no rows, and the reason is
 * recorded for validate.js to report.
 *
 * A failed REQUIRED tab still throws, because there is genuinely nothing to
 * draw — main.js turns that into the calm fallback message (blueprint §17).
 *
 * Returns { rows, columns, tabErrors, tabNotes, viewDifferences }.
 *
 * `compareSheetView` asks for the extra diagnostic pass described under
 * fetchTabAsViewed — OFF for ordinary visitors, and only ever switched on for
 * ?debug, so a normal page load makes exactly one request per tab.
 */
async function fetchAllTabs(compareSheetView) {
  // Both sets of requests are started BEFORE either is awaited, so the
  // diagnostic pass runs alongside the real one rather than after it.
  const mainRequests = Promise.allSettled(
    SHEET_TAB_PLAN.map(function (plan) {
      return fetchTab(plan.tab);
    })
  );

  const viewRequests = compareSheetView
    ? Promise.allSettled(
        SHEET_TAB_PLAN.map(function (plan) {
          return fetchTabAsViewed(plan.tab);
        })
      )
    : Promise.resolve([]);

  const bothSets = await Promise.all([mainRequests, viewRequests]);
  const settled = bothSets[0];
  const viewSettled = bothSets[1];

  const rows = {};
  const columns = {};
  const tabErrors = [];
  const tabNotes = [];

  settled.forEach(function (outcome, index) {
    const plan = SHEET_TAB_PLAN[index];

    if (outcome.status === "fulfilled") {
      rows[plan.key] = outcome.value.rows;
      // Keyed by the tab's NAME, because that is what validate.js reports and
      // what the maintainer sees on the tab at the bottom of the workbook.
      columns[plan.tab.name] = outcome.value.columns;
      if (outcome.value.note) {
        tabNotes.push({
          tab: plan.tab.name,
          affectsPoints: plan.affectsPoints === true,
          required: plan.required === true,
          reason: outcome.value.note.reason,
        });
      }
      return;
    }

    const reason = (outcome.reason && outcome.reason.message) || String(outcome.reason);

    if (plan.required) {
      throw new Error(
        'The "' + plan.tab.name + '" tab could not be read, and the site cannot ' +
        "run without it. " + reason
      );
    }

    // Optional tab: carry on with nothing from it, and remember why.
    rows[plan.key] = [];
    columns[plan.tab.name] = [];
    tabErrors.push({
      tab: plan.tab.name,
      affectsPoints: plan.affectsPoints === true,
      message: reason,
    });
  });

  return {
    rows: rows,
    columns: columns,
    tabErrors: tabErrors,
    tabNotes: tabNotes,
    viewDifferences: compareViews(viewSettled, rows, tabNotes),
  };
}

/**
 * Read a tab the way the SHEET IS BEING VIEWED, rather than the way it is
 * stored: through gviz, which omits rows that are hidden or filtered out.
 *
 * This is not how the site gets its data — it is the opposite of that, and
 * deliberately so. Fetching a tab BOTH ways and comparing the two row counts is
 * the only way to notice that somebody has left a filter on, because the real
 * route (by gid) correctly ignores filters and therefore cannot tell.
 *
 * Nothing here is ever used to build the page. It exists purely so ?debug can
 * tell a maintainer "your view of the Sheet is not what the site sees" — which
 * costs them nothing but is confusing if nobody says it.
 */
async function fetchTabAsViewed(tab) {
  return parseTab(await fetchCsv(tabUrlByName(tab), tab.name));
}

/**
 * Compare what the site read against what the Sheet currently shows.
 *
 * ROWS ONLY, and deliberately so. A HIDDEN COLUMN cannot be detected this way
 * and there is no point trying: hiding a column does not remove it from either
 * route — measured both ways round, with `venue` hidden and again with
 * `direct_1st` hidden, and the column arrived complete every time. So the two
 * column lists are always identical, a comparison of them could never fire, and
 * a check that can never fire is worse than no check because it reads like
 * cover that isn't there. (Hiding a column has no effect on the site either,
 * which is why nothing needs to report it. A column genuinely renamed or
 * deleted IS caught — that is checkMissingColumns in validate.js, and it works
 * on the headers themselves rather than on this comparison.)
 *
 * Only ever reports the SITE having MORE rows than the view. The reverse would
 * mean gviz found rows the export didn't, which cannot happen from hiding — and
 * a row whose cells all fail gviz's column-type guess could produce it, so
 * reporting that direction would be crying wolf.
 *
 * Returns [] when the comparison wasn't asked for, which is the normal case.
 */
function compareViews(viewSettled, rows, tabNotes) {
  if (viewSettled.length === 0) return [];

  // A tab that fell back to the name route was ALREADY read through gviz, so
  // comparing it with gviz would only ever compare it with itself.
  const readByName = {};
  tabNotes.forEach(function (note) {
    readByName[note.tab] = true;
  });

  const differences = [];

  viewSettled.forEach(function (outcome, index) {
    const plan = SHEET_TAB_PLAN[index];
    const tabName = plan.tab.name;

    // The diagnostic pass is allowed to fail without consequence: it informs
    // nothing on the page, so a failure is simply "no comparison available".
    if (outcome.status !== "fulfilled") return;
    if (readByName[tabName]) return;

    const siteRows = (rows[plan.key] || []).length;
    const viewedRows = outcome.value.rows.length;

    if (siteRows > viewedRows) {
      differences.push({
        tab: tabName,
        siteRows: siteRows,
        viewedRows: viewedRows,
      });
    }
  });

  return differences;
}

/**
 * Load everything and return the canonical site data object (blueprint §5).
 *
 * This is the only function anything else in the site should call, and the only
 * place a network request is made. Rejects only if a REQUIRED tab cannot be
 * read — main.js turns that into the calm fallback message (blueprint §17).
 */
async function loadSiteData(options) {
  // All six tabs are fetched at the same time rather than one after another,
  // so the page waits for the slowest single request, not the sum of them.
  const loaded = await fetchAllTabs(!!(options && options.compareSheetView));

  const configRows = loaded.rows.config;
  const houseRows  = loaded.rows.houses;
  const eventRows  = loaded.rows.events;
  const resultRows = loaded.rows.results;
  const extraRows  = loaded.rows.extra;
  const rosterRows = loaded.rows.rosters;

  // The Photos TAB is not fetched (config.js explains why), so there are never
  // any rows from it. The rest of the photos code is untouched and still works:
  // this is simply the empty list it would have received anyway, and the Drive
  // route below is independent of the tab.
  const photoRows  = [];

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

    // Optional tabs that would not load. Empty in the normal case. Recorded
    // rather than reported, because reporting is validate.js's job.
    tabErrors: loaded.tabErrors,

    // Tabs that loaded, but by the fallback name route rather than by gid — so
    // they may be missing hidden rows or type-mismatched cells. Empty in the
    // normal case. Recorded, not reported: validate.js decides how loud to be.
    tabNotes: loaded.tabNotes,

    // Tab name → the column headers that tab actually arrived with. Kept so
    // validate.js can spot a key column that has gone missing entirely, which
    // no amount of looking at the rows would reveal.
    tabColumns: loaded.columns,

    // Tabs where the Sheet's current VIEW shows less than the site reads —
    // rows hidden or filtered out, or a hidden column. Nothing is wrong when
    // this is non-empty; it only means the maintainer's screen and the site
    // disagree. Empty unless ?debug asked for the comparison.
    viewDifferences: loaded.viewDifferences,

    // Photos are fetched from Drive SEPARATELY and deliberately NOT awaited
    // here. The page renders immediately with everything else; when this
    // promise settles, each event's `photos` array has been filled in.
    //
    // It works out neatly because the Event Detail page is drawn at the moment
    // somebody opens an event, which is almost always well after this has
    // finished. main.js redraws that page if it happens to be open already.
    //
    // It never rejects: loadEventPhotos swallows every failure.
    photosReady: loadEventPhotos(events),

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
