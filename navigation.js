// navigation.js
// What this file does: makes the site navigable. It decides WHICH view is on
// screen, keeps the header nav in step, runs the mobile menu and the Back
// button, and tells Google Analytics each time the view changes.
//
// What it does NOT do: it never calculates anything and never fetches anything.
// When a view needs drawing it calls the matching render function (render-home,
// render-events or render-detail) and
// hands it the data object main.js already prepared. Navigation moves between
// views; the render files draw them.
//
// Public entry point: initNavigation(data)

// The four views, matching the section ids in index.html.
const VIEWS = {
  HOME: "home",
  EVENTS: "events",
  DETAIL: "detail",
  CALENDAR: "calendar",
};

/** Titles used for the browser history and the analytics page-view events. */
const VIEW_TITLES = {
  home: "Home",
  events: "Completed Events",
  detail: "Event Detail",
  calendar: "Calendar",
};

/**
 * Event Detail has no nav link of its own. While it is open, the "Completed
 * Events" link stays highlighted, because that is where the event lives.
 */
const NAV_LINK_FOR_VIEW = {
  home: "home",
  events: "events",
  detail: "events",
  calendar: "calendar",
};

// --- module state -----------------------------------------------------------
// The data object, handed over once by main.js. Navigation only ever READS it.
let navigationData = null;

/** The view currently on screen, and (for Detail) which event it is showing. */
let currentView = null;
let currentEventId = null;

/**
 * The view to return to when Back is pressed on an Event Detail page.
 *
 * This is deliberately a single remembered view rather than a full history
 * stack: the only place Back appears is Event Detail, and the only question it
 * has to answer is "which list did I come from?" — Completed Events, the
 * homepage's Recent Results, or the Calendar.
 */
let viewBeforeDetail = VIEWS.HOME;

// =====================================================================
// SECTION 1 — showing a view
// =====================================================================

/**
 * Switch to a view.
 *
 * `eventId` is only used by the Detail view, and says which event to draw.
 * Returns false if the switch could not happen (an unknown event), so a caller
 * never leaves the page half-changed.
 */
function showView(viewId, eventId) {
  // Detail is the one view whose contents depend on a choice, so it is drawn
  // at the moment it is opened rather than up front.
  if (viewId === VIEWS.DETAIL) {
    if (!renderEventDetail(navigationData, eventId)) {
      return false; // unknown event — stay where we are
    }
    // Remember where to come back to, unless we are already in a detail page.
    if (currentView && currentView !== VIEWS.DETAIL) {
      viewBeforeDetail = currentView;
    }
  }

  // Only one section carries the "on" class at a time; styles.css does the rest
  // (including the gentle fade-in).
  Object.keys(VIEW_TITLES).forEach(function (id) {
    const section = document.getElementById(id);
    if (section) section.classList.toggle("on", id === viewId);
  });

  currentView = viewId;
  currentEventId = viewId === VIEWS.DETAIL ? eventId : null;
  updateActiveNavLink(viewId);
  closeMobileMenu();
  window.scrollTo(0, 0); // a new "page" should start at the top

  // Put the view in the address bar so the page can be shared and so the
  // browser's own Back and Forward buttons step through the site.
  writeHash(viewId, currentEventId);

  trackViewChange(viewId, eventId);
  return true;
}

/**
 * Redraw the Event Detail page if it happens to be the one on screen.
 *
 * Used when something arrives after the page was drawn — the Drive photos are
 * the only case today. Does nothing at all if the visitor is somewhere else,
 * which is the usual outcome, since photos normally land long before anyone
 * opens an event.
 */
function refreshCurrentDetailView() {
  if (currentView !== VIEWS.DETAIL || !currentEventId) return;
  renderEventDetail(navigationData, currentEventId);
}

/** Put the gold underline under the nav link matching the current view. */
function updateActiveNavLink(viewId) {
  const activeLink = NAV_LINK_FOR_VIEW[viewId];
  const links = document.querySelectorAll("nav.main a[data-nav]");

  Array.prototype.forEach.call(links, function (link) {
    link.classList.toggle("active", link.dataset.nav === activeLink);
  });
}

// =====================================================================
// SECTION 2 — the address bar (deep links, Back and Forward)
// =====================================================================
//
// The site is one HTML file, so the browser never changes page on its own. We
// keep a "hash" on the end of the address instead:
//
//     #/home   #/events   #/calendar   #/event/DEB
//
// That makes any view shareable, and — because changing the hash is something
// the browser records in its history — it makes the browser's own Back and
// Forward buttons walk through the site exactly as you would expect.
//
// The two directions are kept apart deliberately:
//   showView()  → changes what is on screen, then WRITES the hash
//   applyHash() → READS the hash and asks showView to match it
// applyHash checks whether the hash already matches what is on screen and does
// nothing if so, which stops the two from bouncing off each other for ever.

/** Build the hash for a view, e.g. "#/event/DEB". */
function hashFor(viewId, eventId) {
  if (viewId === VIEWS.DETAIL && eventId) return "#/event/" + eventId;
  return "#/" + viewId;
}

/** Write the current view into the address bar, if it isn't already there. */
function writeHash(viewId, eventId) {
  const wanted = hashFor(viewId, eventId);
  if (window.location.hash !== wanted) {
    window.location.hash = wanted;
  }
}

/**
 * Read the address bar and work out which view it is asking for.
 *
 * Anything unrecognised — a typo, an old link, an event that has since been
 * deleted from the Sheet — quietly resolves to Home rather than erroring.
 */
function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  if (raw === "") return { view: VIEWS.HOME, eventId: null };

  const parts = raw.split("/");

  if (parts[0] === "event") {
    const eventId = decodeURIComponent(parts[1] || "");
    const exists = navigationData.events.some(function (candidate) {
      return candidate.id === eventId;
    });
    if (!exists) {
      console.warn(
        'navigation.js: the link asked for event "' + eventId +
        '", which is not in the Sheet. Showing Home instead.'
      );
      return { view: VIEWS.HOME, eventId: null };
    }
    return { view: VIEWS.DETAIL, eventId: eventId };
  }

  // A plain view name, if we recognise it.
  const known = Object.keys(VIEW_TITLES).indexOf(parts[0]) !== -1;
  if (known && parts[0] !== VIEWS.DETAIL) {
    return { view: parts[0], eventId: null };
  }

  return { view: VIEWS.HOME, eventId: null };
}

/**
 * Bring the screen into line with the address bar. Called on first load and
 * whenever the hash changes — which includes the browser's Back and Forward
 * buttons.
 */
function applyHash() {
  const target = readHash();

  // Tidy the address bar if it asked for something we couldn't honour — an
  // unknown event, a typo, an old link. Without this the bad address stays on
  // screen while Home is displayed, and someone could copy and share it.
  //
  // replaceState rather than setting location.hash: this CORRECTS the current
  // history entry instead of adding a new one, so the browser's Back button
  // still goes where the visitor expects.
  const wanted = hashFor(target.view, target.eventId);
  if (window.location.hash !== wanted) {
    window.history.replaceState(null, "", wanted);
  }

  // Already showing it? Then this hash change was our own doing, and acting on
  // it again would fire a duplicate analytics event.
  if (target.view === currentView && target.eventId === currentEventId) return;

  showView(target.view, target.eventId);
}

// =====================================================================
// SECTION 3 — analytics (blueprint §18)
// =====================================================================

/**
 * Tell GA4 the visitor moved to another view.
 *
 * The site is one HTML file with four views, so the browser never loads a new
 * page and GA would otherwise record a single page-view for the whole visit.
 * Sending a virtual page_view on each switch makes Home / Completed Events /
 * Calendar show up separately in the dashboard.
 *
 * Event Detail sends the EVENT'S OWN NAME, so the report shows which events
 * people actually opened rather than lumping them together.
 */
function trackViewChange(viewId, eventId) {
  let title = VIEW_TITLES[viewId] || viewId;
  let path = "/" + viewId;

  if (viewId === VIEWS.DETAIL && eventId) {
    const event = navigationData.events.find(function (candidate) {
      return candidate.id === eventId;
    });
    if (event) {
      title = "Event: " + event.name;
      path = "/event/" + eventId;
    }
  }

  // Logged as well as sent, so a maintainer can confirm tracking works without
  // opening the GA dashboard.
  console.log('navigation.js: analytics page_view → "' + title + '" (' + path + ")");

  // gtag is missing if the analytics script was blocked or is offline. That
  // must never stop the site working, so we simply skip it.
  if (typeof gtag !== "function") return;

  gtag("event", "page_view", {
    page_title: title,
    page_path: path,
    page_location: window.location.origin + window.location.pathname + "#" + path,
  });
}

// =====================================================================
// SECTION 4 — the mobile menu ("Menu B")
// =====================================================================

function openMobileMenu() {
  document.getElementById("nav").classList.add("open");
  document.getElementById("menubtn").setAttribute("aria-expanded", "true");
}

function closeMobileMenu() {
  document.getElementById("nav").classList.remove("open");
  document.getElementById("menubtn").setAttribute("aria-expanded", "false");
}

function toggleMobileMenu() {
  const isOpen = document.getElementById("nav").classList.contains("open");
  if (isOpen) closeMobileMenu();
  else openMobileMenu();
}

function wireMobileMenu() {
  const button = document.getElementById("menubtn");
  button.setAttribute("aria-expanded", "false");

  button.addEventListener("click", function (clickEvent) {
    clickEvent.stopPropagation(); // don't immediately re-close via the document handler
    toggleMobileMenu();
  });

  // Tapping anywhere else, or pressing Escape, closes the menu — otherwise it
  // can be left hanging open over the page.
  document.addEventListener("click", function (clickEvent) {
    const nav = document.getElementById("nav");
    if (!nav.classList.contains("open")) return;
    if (nav.contains(clickEvent.target)) return;
    closeMobileMenu();
  });

  document.addEventListener("keydown", function (keyEvent) {
    if (keyEvent.key === "Escape") closeMobileMenu();
  });
}

// =====================================================================
// SECTION 5 — wiring the clickable things
// =====================================================================

/**
 * Mark the elements that actually do something as interactive.
 *
 * The rule this keeps: something looks clickable ONLY if it is clickable. The
 * class is added here, by the module that attaches the behaviour, so the two
 * can never drift apart. (If a view is ever re-drawn — V2's live scores — call
 * this again afterwards.)
 */
function markInteractiveElements() {
  // A row or card carries data-event-id (this site's Detail view) or
  // data-event-url (an external mini-site) ONLY when there is somewhere worth
  // going — render-shared.js's eventTargetAttr() decides that once for all of
  // them. So the presence of either attribute is the whole test here, and a row
  // with nothing on its page never gets marked.
  const targets = document.querySelectorAll(
    "#events-rows tr[data-event-id], #events-rows tr[data-event-url]," +
    "#calendar-rows tr[data-event-id], #calendar-rows tr[data-event-url]," +
    // Homepage: Recent Results, the promoted spotlight cards above them, and
    // the Upcoming cards — which for a long time responded to clicks without
    // ever looking clickable, including when their page was empty.
    "#latest .lcard[data-event-id], #spotlight .scard[data-event-id]," +
    "#upcoming .ucard[data-event-id], #upcoming .ucard[data-event-url]"
  );
  Array.prototype.forEach.call(targets, function (target) {
    target.classList.add("clickable");
  });
}

/**
 * One click handler for the whole page.
 *
 * Listening once on <main> rather than on every row means the wiring keeps
 * working if a view is re-drawn later, and there is a single place to look to
 * see everything that responds to a click.
 */
function wireContentClicks() {
  document.querySelector("main").addEventListener("click", function (clickEvent) {
    const target = clickEvent.target;

    // Real links (a "Watch live" pill opening a mini-site in a new tab) are
    // left entirely alone for the browser to handle.
    //
    // This return is also what stops a DOUBLE navigation: the row around that
    // pill now carries data-event-url, so without stopping here both the link
    // and the row handler below would fire and two tabs would open.
    if (target.closest("a[href]")) return;

    // A "more" link in a section heading: "All events →", "View full calendar →".
    const moreLink = target.closest("[data-goto]");
    if (moreLink) {
      showView(moreLink.dataset.goto);
      return;
    }

    // A Live event's row, which leads to an external mini-site. Clicking the
    // pill inside it was handled by the browser and returned above; this is for
    // clicks anywhere ELSE along the row, so the whole row behaves like every
    // other row in the table.
    const external = target.closest("[data-event-url]");
    if (external) {
      window.open(external.dataset.eventUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Anything carrying an event id — a table row, a "View details" or
    // "View results" pill, a Recent Results card, an Upcoming card, a live
    // banner — opens that event. Nothing carries an id unless its Detail page
    // has something on it, so there is no dead-click case to guard against.
    const eventOwner = target.closest("[data-event-id]");
    if (eventOwner) {
      showView(VIEWS.DETAIL, eventOwner.dataset.eventId);
    }
  });
}

/** The header links, and the Back button on Event Detail. */
function wireNavLinks() {
  const links = document.querySelectorAll("nav.main a[data-nav]");
  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener("click", function (clickEvent) {
      clickEvent.preventDefault();
      showView(link.dataset.nav);
    });
  });

  document.querySelector(".brand").addEventListener("click", function (clickEvent) {
    clickEvent.preventDefault();
    showView(VIEWS.HOME);
  });

  // On Event Detail, Back returns to whichever list the visitor came from.
  document.getElementById("detail-back").addEventListener("click", function () {
    showView(viewBeforeDetail);
  });

  // Completed Events and Calendar are reached from the nav rather than from
  // another page, so there is no "where I came from" to remember — their Back
  // buttons always return Home, which is what their labels promise.
  ["events-back", "calendar-back"].forEach(function (id) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener("click", function () {
        showView(VIEWS.HOME);
      });
    }
  });
}

// =====================================================================
// SECTION 6 — the public function
// =====================================================================

/**
 * Turn navigation on. Called once by main.js, after every view has been drawn.
 *
 * The opening view comes from the address bar, so a shared link such as
 * .../#/event/DEB lands straight on that event — and the analytics page-view
 * for it fires on arrival, because showView does that for every switch however
 * it was triggered.
 */
function initNavigation(data) {
  navigationData = data;

  wireNavLinks();
  wireMobileMenu();
  wireContentClicks();
  markInteractiveElements();

  // The browser's Back and Forward buttons change the hash; this keeps the
  // screen in step with them.
  window.addEventListener("hashchange", applyHash);

  // Open whatever the address bar asks for (Home if it asks for nothing).
  const opening = readHash();
  showView(opening.view, opening.eventId);
}
