// utils.js
// Small shared helpers — date handling, number handling, colour handling, and
// safe text output. Nothing in here knows anything about this school, the
// Google Sheet, or the page layout.
//
// Keep this file small. As a rule, a helper used by only one module belongs in
// that module. The number parsers below are the deliberate exception: the
// project's architecture (CLAUDE.md) names "safe number parsing" as this file's
// job, so they live here even though only data.js calls them today.

// =====================================================================
// The address bar
// =====================================================================

/**
 * Is "?debug" in the address?
 *
 * Lives here rather than in render-debug.js because three different modules now
 * need the answer and they must all agree: render-debug.js decides whether to
 * draw the panel, main.js decides whether to ask for the extra diagnostics, and
 * the extra diagnostics cost a second request per tab — so a disagreement would
 * mean ordinary visitors quietly paying for a panel they never see.
 */
function isDebugRequested() {
  return new URLSearchParams(window.location.search).has("debug");
}

// =====================================================================
// Text
// =====================================================================

/**
 * Make text safe to drop into HTML.
 *
 * Everything on this site comes from a spreadsheet that students and staff can
 * type into. If someone types "Ben & Jerry's" or an angle bracket, it must show
 * as those characters — not break the page or be treated as markup. Every piece
 * of Sheet text passes through here before it reaches the screen.
 */
function escapeHtml(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =====================================================================
// Dates
// =====================================================================

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

/**
 * Build a Date from year/month/day numbers, or null if that date doesn't exist.
 * The round-trip check is what rejects 31 February and 40/13/2026.
 */
function makeRealDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  const isReal =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isReal ? date : null;
}

/**
 * Turn a Sheet date cell into a Date, or null if it isn't a usable date.
 *
 * WHY THIS IS FUSSIER THAN IT LOOKS
 * Google's CSV export gives us the date as it is DISPLAYED in the Sheet, not in
 * any fixed format. Change the spreadsheet's locale or the column's format and
 * the text we receive changes with it: "2026-07-05" becomes "05/07/26".
 *
 * That matters because JavaScript's own Date.parse reads a slash date the
 * AMERICAN way, month first. Left to itself it would read "05/07/26" as 7 May
 * instead of 5 July, and would fail outright on "24/07/26" because there is no
 * month 24. So we never hand a slash date to Date.parse.
 *
 * Formats handled, in order:
 *   1. 2026-07-05          ISO, unambiguous — always tried first
 *   2. 5/7/2026, 05/07/26  DAY first (also - or . separators), matching the
 *                          Indian convention the Sheet is set to
 *   3. anything else       handed to the browser ("5 July 2026", "Jul 5 2026")
 *
 * ASSUMPTION WORTH KNOWING: rule 2 is day-first. A Sheet switched to American
 * month-first formatting would be misread for days of 12 or less. If that ever
 * happens, the fix belongs here, in this one function.
 */
function parseSheetDate(text) {
  const value = String(text || "").trim();
  if (value === "") return null;

  // --- 1. ISO, e.g. "2026-07-05" ---
  const isoParts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (isoParts) {
    return makeRealDate(Number(isoParts[1]), Number(isoParts[2]), Number(isoParts[3]));
  }

  // --- 2. Day-first, e.g. "05/07/26", "5/7/2026", "05-07-2026", "05.07.2026" ---
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    let year = Number(dayFirst[3]);

    // A two-digit year: 00-69 means this century, 70-99 the last one. Every
    // date this site deals with is well inside 2000-2069.
    if (dayFirst[3].length === 2) {
      year = year <= 69 ? 2000 + year : 1900 + year;
    }

    return makeRealDate(year, month, day);
  }

  // --- 3. Reject a bare run of digits BEFORE handing anything to the browser ---
  //
  // A date cell formatted as a plain number exports as a spreadsheet serial
  // number: 5 July 2026 becomes "46203". Date.parse reads that as the YEAR
  // 46203 and cheerfully returns a real date, so the site would show a
  // nonsense far-future date with nothing to say it was wrong. A bare number
  // is never a date this site can honestly read, so it fails here instead.
  if (/^\d+$/.test(value)) return null;

  // --- 4. Anything else the browser understands, e.g. "5 July 2026" ---
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

/** "2026-07-05" → "5 July". Returns "" for an unusable date. */
function formatLongDate(text) {
  const date = parseSheetDate(text);
  if (!date) return "";
  return date.getDate() + " " + MONTH_NAMES[date.getMonth()];
}

/** "2026-07-03" → "3 Jul". Returns "" for an unusable date. */
function formatShortDate(text) {
  const date = parseSheetDate(text);
  if (!date) return "";
  return date.getDate() + " " + MONTH_NAMES[date.getMonth()].slice(0, 3);
}

/**
 * Split a date into the pieces the Upcoming cards show separately:
 * "2026-07-18" → { day: "18", month: "Jul" }. Null for an unusable date.
 */
function dateParts(text) {
  const date = parseSheetDate(text);
  if (!date) return null;
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTH_NAMES[date.getMonth()].slice(0, 3),
  };
}

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "2026-07-05" → "Saturday, 5 July 2026", for an event's meta line. */
function formatFullDate(text) {
  const date = parseSheetDate(text);
  if (!date) return "";
  return (
    DAY_NAMES[date.getDay()] + ", " + date.getDate() + " " +
    MONTH_NAMES[date.getMonth()] + " " + date.getFullYear()
  );
}

/** "2026-07-05" → "5 July 2026". Used for the header's "results as of" line. */
function formatDateWithYear(text) {
  const date = parseSheetDate(text);
  if (!date) return "";
  return date.getDate() + " " + MONTH_NAMES[date.getMonth()] + " " + date.getFullYear();
}

/** "2026-07-05" → "05 Jul", the zero-padded form the event tables use. */
function formatTableDate(text) {
  const parts = dateParts(text);
  return parts ? parts.day + " " + parts.month : "";
}

/** A friendly "last updated" stamp for the header, from an ISO timestamp. */
function formatTimestamp(isoText) {
  const date = new Date(isoText);
  if (!Number.isFinite(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return "Updated " + date.getDate() + " " +
    MONTH_NAMES[date.getMonth()].slice(0, 3) + ", " + time;
}

// =====================================================================
// Numbers
// =====================================================================

// A point scheme lists what 1st, 2nd, 3rd… are worth. Fewer than two places
// isn't a scheme (write "10,0,0" if only the winner scores), and no school has
// more than ten placings worth naming.
const SCHEME_MIN_PLACES = 2;
const SCHEME_MAX_PLACES = 10;

/**
 * Read a point scheme AND say what is wrong with it: "10,7,4" → [10, 7, 4].
 *
 * WHY THIS IS SO FUSSY. A scheme is the most dangerous cell in the whole Sheet:
 * it multiplies into every event, and a mistake in it produces a complete,
 * plausible-looking leaderboard that happens to be wrong. Rejecting only
 * non-numeric text is not enough, because the dangerous typos still look
 * numeric once split on the commas:
 *
 *   ",10,7,4"        one stray comma  → [0,10,7,4]  1st worth NOTHING, 2nd worth 10
 *   "10,,4"          double comma     → [10,0,4]    silver silently worth nothing
 *   "1,000,500,100"  thousands commas → [1,0,500,100] 1st worth 1, 2nd worth 0
 *   "0,0,0"                           → nothing ever scores, in silence
 *
 * So every rule below exists to catch a specific way of being silently wrong:
 *
 *   1. no empty pieces      — catches a stray, doubled or trailing comma
 *   2. every piece a number — catches "ten,seven,four", "10;7;4", "₹10,7,4"
 *   3. 2 to 10 places       — catches "10" on its own, where 2nd and 3rd would
 *                             quietly score zero
 *   4. never goes UP        — catches thousands separators, because a real
 *                             scheme is worth less for each lower place
 *   5. something above zero — catches "0,0,0" and all-negative schemes
 *
 * Decimals are fine throughout (fractional point schemes are supported), and
 * equal values are allowed ("5,5,3"), because only an INCREASE is nonsense.
 *
 * Returns { scheme, problem, blank }:
 *   scheme  — the numbers, or null if unusable
 *   problem — a plain-English reason, or null if it is fine (or blank)
 *   blank   — true when the cell is simply empty, which some callers allow
 */
function readScheme(text) {
  const value = String(text == null ? "" : text).trim();

  if (value === "") return { scheme: null, problem: null, blank: true };

  const pieces = value.split(",");

  // --- 1. no empty pieces ---
  const emptyAt = pieces.findIndex(function (piece) {
    return piece.trim() === "";
  });
  if (emptyAt !== -1) {
    return {
      scheme: null,
      blank: false,
      problem:
        'there is a missing value between the commas (piece ' + (emptyAt + 1) +
        ' of ' + pieces.length + ' is empty). A stray, doubled or trailing ' +
        'comma does this. Write it as numbers separated by single commas, ' +
        'e.g. "10,7,4"',
    };
  }

  // --- 2. every piece a number ---
  const numbers = pieces.map(function (piece) {
    return Number(piece.trim());
  });
  const badAt = numbers.findIndex(function (n) {
    return !Number.isFinite(n);
  });
  if (badAt !== -1) {
    return {
      scheme: null,
      blank: false,
      problem:
        '"' + pieces[badAt].trim() + '" is not a number. A scheme must be ' +
        'plain numbers separated by commas, e.g. "10,7,4" — no words, no ' +
        'currency symbols, and commas (not semicolons) between the places',
    };
  }

  // --- 3. a believable number of places ---
  if (numbers.length < SCHEME_MIN_PLACES || numbers.length > SCHEME_MAX_PLACES) {
    return {
      scheme: null,
      blank: false,
      problem:
        'it lists ' + numbers.length + ' place' + (numbers.length === 1 ? '' : 's') +
        ', which does not look right. A scheme needs between ' +
        SCHEME_MIN_PLACES + ' and ' + SCHEME_MAX_PLACES + ' values — one per ' +
        'place. If only the winner should score, write it out in full, ' +
        'e.g. "10,0,0"',
    };
  }

  // --- 4. never worth MORE for a lower place ---
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] > numbers[i - 1]) {
      return {
        scheme: null,
        blank: false,
        problem:
          'place ' + (i + 1) + ' is worth more (' + numbers[i] + ') than place ' +
          i + ' (' + numbers[i - 1] + '), which cannot be right. The usual ' +
          'cause is writing thousands with commas — "1,000,500,100" is read as ' +
          'four separate places worth 1, 0, 500 and 100. Write plain numbers ' +
          'with no thousands separators',
      };
    }
  }

  // --- 5. something has to be worth having ---
  const anyPositive = numbers.some(function (n) {
    return n > 0;
  });
  if (!anyPositive) {
    return {
      scheme: null,
      blank: false,
      problem:
        'every place is worth zero or less, so nothing using this scheme could ' +
        'ever score. At least the first place must be worth more than zero',
    };
  }

  return { scheme: numbers, problem: null, blank: false };
}

/**
 * Just the numbers, or null if the scheme is blank or unusable.
 * data.js uses this; validate.js uses describeSchemeProblem() to say why.
 */
function parseScheme(text) {
  return readScheme(text).scheme;
}

/**
 * Why is this scheme unusable? Returns null if it is fine, or if it is simply
 * blank — whether a blank scheme is allowed depends on which cell it came from,
 * so that is the caller's decision, not this function's.
 */
function describeSchemeProblem(text) {
  return readScheme(text).problem;
}

/**
 * Read a single number from a Sheet cell.
 *
 * Returns null (never NaN) for anything unusable, because NaN spreads silently
 * through arithmetic while null shows up immediately as a missing value.
 */
function parseNumber(text) {
  if (text === "" || text == null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Format a points value for display.
 *
 * calculate.js has already rounded these to 2 decimal places, so this only
 * decides how they READ: a whole number shows as "20", not "20.00", while a
 * fractional total keeps its decimals ("9.99").
 */
function formatPoints(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "0";
  return String(value);
}

/** Extra Points are shown with a sign, and may be negative ("+3", "−2"). */
function formatSignedPoints(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 0) return "−" + formatPoints(Math.abs(value)); // proper minus sign
  return "+" + formatPoints(value);
}

// =====================================================================
// Colours
// =====================================================================

/** Is this a usable CSS hex colour? */
function isHexColour(text) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(text || "").trim());
}

/**
 * A house's colour, or a neutral grey if the Sheet's value is unusable.
 *
 * validate.js has already warned the maintainer about a bad colour; this makes
 * sure the page still looks deliberate rather than breaking.
 */
function houseColour(house) {
  return house && isHexColour(house.color) ? house.color.trim() : "#8b96ab";
}

/**
 * Turn a hex colour into "rgba(r, g, b, alpha)" so we can build the translucent
 * gradients and glows the design uses, from a colour that came from the Sheet.
 */
function hexToRgba(hex, alpha) {
  let value = String(hex || "").trim().replace("#", "");

  // Expand the three-digit form (#abc → #aabbcc) so parsing is uniform.
  if (value.length === 3) {
    value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
  }
  if (value.length !== 6) return "rgba(139, 150, 171, " + alpha + ")";

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
}

// =====================================================================
// Links
// =====================================================================

/**
 * Make a link from the Sheet safe to put on the page.
 *
 * A URL typed into a spreadsheet cell is untrusted text. Pasting it straight
 * into an href would allow "javascript:…" — so only ordinary web addresses are
 * allowed through, and anything else returns "" (which callers treat as "no
 * link", hiding the section entirely).
 *
 * A maintainer who types "www.example.com" without the https:// still gets a
 * working link; a maintainer who types something odd gets nothing at all.
 */
function safeExternalUrl(url) {
  const value = String(url || "").trim();
  if (value === "") return "";

  // No scheme at all? Assume the ordinary case and add https://.
  // (Anything that DOES carry a scheme keeps it, and is checked below.)
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    return ""; // not a usable address
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  return parsed.href;
}
