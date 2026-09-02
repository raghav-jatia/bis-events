// main.js
// The conductor. Reading this one file should explain the whole site:
//
//     load  →  validate  →  calculate  →  render
//
// Each step is one module's job, and each hands its result to the next. No
// step reaches past its neighbour: main.js is the only file that knows the
// order they run in.
//
// It also decides what the VISITOR sees when something goes wrong. Blueprint
// §17: a bad row is skipped quietly and the page still renders; only a
// fundamental failure (the Sheet won't load, or Config is missing) shows a calm
// message. A visitor never sees a raw error or a broken page.

/**
 * Everything found by validate.js and calculate.js, kept together so the
 * ?debug view (still to be built) can list it on screen for a maintainer.
 */
let siteWarnings = [];

/** The finished data object, kept so a view can be drawn on demand. */
let siteData = null;

/**
 * Swap between the three top-level states of the page: the loading message,
 * the site itself, and the calm fallback message.
 *
 * Which VIEW of the site is on screen is navigation.js's business, not this
 * file's — main.js only decides whether the site is shown at all.
 */
function showOnly(which) {
  document.getElementById("loading").hidden = which !== "loading";
  document.getElementById("fallback").hidden = which !== "fallback";

  // The views themselves are shown and hidden with the "on" class, which is
  // what styles.css is built around (.page / .page.on). Clearing it here means
  // nothing is on screen until navigation.js chooses the opening view.
  if (which !== "page") {
    const views = document.querySelectorAll("main .page");
    Array.prototype.forEach.call(views, function (view) {
      view.classList.remove("on");
    });
  }
}

/**
 * The calm message a visitor sees if the site genuinely cannot show standings.
 * Deliberately friendly and free of technical detail — the specifics go to the
 * console for whoever maintains the Sheet.
 */
function showFallback() {
  showOnly("fallback");
}

/** Start the site. */
async function startSite() {
  showOnly("loading");

  try {
    // 1. LOAD — the only network request the site makes.
    const loaded = await loadSiteData();

    // 2. VALIDATE — set aside anything unusable, and collect the warnings.
    const checked = validateSiteData(loaded);
    siteWarnings = checked.warnings.slice();

    // A fatal problem means there is nothing worth drawing (no Config, no
    // Houses). Everything short of that still renders.
    if (checked.fatal) {
      console.error(
        "main.js: the data has a fundamental problem, so the page cannot be " +
        "drawn. See the errors above."
      );
      showFallback();
      return;
    }

    // 3. CALCULATE — every number on the page is worked out here, once.
    const scored = calculateAll(checked.data);
    siteWarnings = siteWarnings.concat(scored.warnings);
    siteData = scored.data;

    // 4. RENDER — draw the result. Every view is drawn once, up front, from the
    //    same data object. (Event Detail is the exception: it is drawn when a
    //    particular event is opened, because which event it shows is a choice.)
    renderHomepage(scored.data);
    renderCompletedEvents(scored.data);
    renderCalendar(scored.data);
    showOnly("page");

    // 5. NAVIGATE — hand over to navigation.js, which decides which view is on
    //    screen from here on and wires up every link, row and button.
    initNavigation(scored.data);

    if (siteWarnings.length > 0) {
      console.log(
        "main.js: the page rendered with " + siteWarnings.length +
        " data warning(s) — see above."
      );
    }
  } catch (error) {
    // The Sheet is unreachable, or something genuinely unexpected happened.
    console.error("main.js: could not build the page.", error);
    showFallback();
  }
}

// Go, once the page's own HTML is ready.
document.addEventListener("DOMContentLoaded", startSite);
