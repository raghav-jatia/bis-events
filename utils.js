// utils.js
// Small shared helpers used by more than one module — date handling, colour
// handling, and safe text output. Nothing in here knows anything about this
// school, the Google Sheet, or the page layout.
//
// Keep this file small. If a helper is only ever used by one module, it belongs
// in that module, not here.

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
 * Turn a Sheet date cell into a Date, or null if it isn't a usable date.
 *
 * The Sheet's date cells arrive as "2026-07-05". We accept that, plus anything
 * else the browser can parse, but reject text that isn't a date at all (or an
 * impossible one like 2026-13-40).
 */
function parseSheetDate(text) {
  const value = String(text || "").trim();
  if (value === "") return null;

  const isoParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoParts) {
    const year = Number(isoParts[1]);
    const month = Number(isoParts[2]);
    const day = Number(isoParts[3]);
    const date = new Date(year, month - 1, day);
    // If the parts survive the round trip, the date really exists.
    const isReal =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;
    return isReal ? date : null;
  }

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
