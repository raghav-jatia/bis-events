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
 * Everything validate.js found, kept together so the ?debug view can list it on
 * screen for a maintainer who will never open the browser console.
 */
let siteWarnings = [];

/**
 * The finished data object.
 *
 * The site itself doesn't read this — navigation.js is handed its own reference
 * when main.js hands over. It is kept as a global purely so that anyone
 * debugging can type `siteData` into the browser console and inspect exactly
 * what the site is working from.
 */
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
    // 1. LOAD — the only network requests the site makes: one per tab.
    //
    //    In ?debug ONLY, each tab is fetched a second time by the other route,
    //    so the panel can say whether rows are hidden or filtered in the Sheet.
    //    That answer is for maintainers and appears nowhere else, so an ordinary
    //    visitor must never pay for it — hence the flag rather than always on.
    const loaded = await loadSiteData({ compareSheetView: isDebugRequested() });

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
      // A maintainer using ?debug needs the panel MOST in this situation, so it
      // is drawn even though the site itself cannot be.
      renderDebugPanel(checked.data, siteWarnings);
      return;
    }

    // 3. CALCULATE — every number on the page is worked out here, once.
    const scored = calculateAll(checked.data);
    siteWarnings = siteWarnings.concat(scored.warnings);
    siteData = scored.data;

    // 3b. CHECK THE RESULT — a few problems can only be spotted once the maths
    //     has an answer to compare against (e.g. an event whose typed house
    //     order disagrees with the one its Results add up to). Reporting is
    //     still validate.js's job; this file only decides when it happens.
    siteWarnings = siteWarnings.concat(validateScoredData(scored.data));

    // 4. RENDER — draw the result. Every view is drawn once, up front, from the
    //    same data object. (Event Detail is the exception: it is drawn when a
    //    particular event is opened, because which event it shows is a choice.)
    //
    //    The chrome goes first, on its own: the header and the footer line
    //    belong to no single view, and drawing them here rather than inside
    //    renderHomepage means they cannot go missing if the visitor arrives on
    //    a deep link to some other view.
    renderSiteChrome(scored.data);
    renderHomepage(scored.data);
    renderCompletedEvents(scored.data);
    renderCalendar(scored.data);
    showOnly("page");

    // 5. NAVIGATE — hand over to navigation.js, which decides which view is on
    //    screen from here on and wires up every link, row and button.
    initNavigation(scored.data);

    // Diagnostics for maintainers. Draws nothing at all unless "?debug" is in
    // the address, so an ordinary visit is completely unaffected.
    renderDebugPanel(scored.data, siteWarnings);

    // 6. PHOTOS — these were never awaited, so the page above is already on
    //    screen. When Drive answers, each event's photos are in place; redraw
    //    the Event Detail page only if the visitor is already looking at one.
    if (scored.data.photosReady) {
      scored.data.photosReady.then(function () {
        refreshCurrentDetailView();
      });
    }

    // Advisories are hunches kept back for the ?debug view, so they are not
    // counted here — otherwise a clean load would still report a number and
    // imply something needs fixing.
    const realProblems = siteWarnings.filter(function (entry) {
      return entry.level !== "advisory";
    });

    if (realProblems.length > 0) {
      console.log(
        "main.js: the page rendered with " + realProblems.length +
        " data warning(s) — see above."
      );
    }
  } catch (error) {
    // The Sheet is unreachable, or something genuinely unexpected happened.
    console.error("main.js: could not build the page.", error);
    showFallback();

    // Nothing reached validate.js, so there are no warnings to show — but a
    // maintainer who added ?debug still needs to be told WHY the page is blank.
    // Record this one failure in the shape the panel expects, so the reason is
    // on screen rather than only in the console.
    siteWarnings = siteWarnings.concat([
      {
        level: VALIDATION_LEVEL.FATAL,
        tab: "Sheet",
        subject: "",
        cell: "",
        message:
          "The Google Sheet could not be read, so nothing could be drawn. " +
          "Check the workbook is still shared as \"anyone with the link can " +
          "view\", and that you are online. (" + error.message + ")",
      },
    ]);
    renderDebugPanel(null, siteWarnings);
  }
}

// Go, once the page's own HTML is ready.
document.addEventListener("DOMContentLoaded", startSite);
