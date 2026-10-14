// render-detail.js
// What this file does: draws ONE event's own page — the view you reach by
// clicking an event anywhere on the site.
//
// It is the only view whose contents depend on a choice, so unlike the others
// it is not drawn at startup: navigation.js calls renderEventDetail each time
// somebody opens an event, and again if that event's photos arrive later.
//
// The page is deliberately ONE function serving every kind of event. A Sport
// shows its category table; a Co-curricular shows its write-up and team
// rosters; an event awaiting results shows a calm note where the results would
// be. Nothing branches on the event type — each section simply hides itself
// when this event has no data for it (blueprint §11), which is why adding a new
// kind of event needs no change here.
//
// Same rule as every render file: this never calculates and never fetches.
//
// Public entry point: renderEventDetail(data, eventId) -> true, or false if
//   there is no event with that id (so the caller can stay where it is rather
//   than showing a half-drawn page).

/**
 * The house result boxes at the top of a detail page.
 *
 * Two shapes, per blueprint §6.3:
 *   Calculated — house name AND its Tier-2 tally for this event (the number of
 *                individual points its competitors earned).
 *   Direct     — house name only. There is no per-house tally to show, because
 *                the placings were entered directly rather than added up.
 *
 * Ordering and rank badges come from the finishing order calculate.js worked
 * out; the leader keeps the gold outline.
 */
function renderDetailTotals(data, event) {
  const isCalculated = event.resultsMode === RESULTS_MODE.CALCULATED;

  // Calculated events rank on the Tier-2 tally; Direct events have only the
  // placings themselves. Either way we end up with rows of {houseId, rank}.
  const rows = isCalculated
    ? event.tier2Tally
        .filter(function (entry) {
          return entry.rank !== null; // houses that scored nothing don't place
        })
        .map(function (entry) {
          return { houseId: entry.houseId, rank: entry.rank, points: entry.points };
        })
    : event.tier1.map(function (award) {
        return { houseId: award.houseId, rank: award.position, points: null };
      });

  // ONE BOX PER RANK, not one per house. Houses sharing a rank are a tie and
  // belong together: "3  Beta & Gamma" reads as one result, where two separate
  // rank-3 boxes read as two. A house tied with ITSELF ("Beta, Beta" at third)
  // keeps both names for the same reason — the two points are only visible if
  // both are shown.
  //
  // Different ranks never merge, so a house placed 1st AND 2nd still gets a box
  // each. Rank order is preserved from `rows`, which is already in finishing
  // order, and duplicates within a rank are preserved.
  const byRank = [];
  rows.forEach(function (row) {
    const open = byRank[byRank.length - 1];
    if (open && open.rank === row.rank) {
      open.houseIds.push(row.houseId);
      return;
    }
    byRank.push({ rank: row.rank, points: row.points, houseIds: [row.houseId] });
  });

  const html = byRank
    .map(function (group) {
      const isLeader = group.rank === 1;

      // The box is tinted with ONE colour, so it can only carry a colour when
      // every house in it is the same house — which is exactly the "Beta & Beta"
      // case. A tie between DIFFERENT houses has no single colour that would be
      // honest, so the box stays neutral and each name carries its own colour,
      // the same way the results tables already do it.
      const allSame = group.houseIds.every(function (id) {
        return id === group.houseIds[0];
      });
      const boxHouse = allSame ? findHouse(data, group.houseIds[0]) : null;
      const boxColour = allSame ? houseColour(boxHouse) : null;

      // Mixed tie: no honest single house colour, so it wears the MEDAL tint for
      // its position instead — the same gold/silver/bronze as the rank badge
      // beside it. Beyond 3rd there is no medal, so it stays untinted.
      const medalClass =
        !allSame && group.rank >= 1 && group.rank <= 3 ? " tie-m" + group.rank : "";

      const names = group.houseIds
        .map(function (houseId) {
          const house = findHouse(data, houseId);
          return (
            '<span style="color:' + houseColour(house) + '">' +
            escapeHtml(house ? house.name : "") +
            "</span>"
          );
        })
        // Real spaces around the "&" on purpose: they are the only place the
        // browser is allowed to break the line, and without them a long pair
        // was being split mid-name ("Gam / ma"). The gap is tightened in CSS
        // with word-spacing, not by removing them.
        .join(' <span class="amp">&amp;</span> ');

      return (
        '<div class="dtbox' + (isLeader ? " win" : "") + medalClass + '"' +
        (boxColour ? ' style="' + houseBoxStyle(boxColour, isLeader) + '"' : "") +
        ">" +
        rankToken(group.rank) +
        '<span class="ph">' + names + "</span>" +
        (group.points === null
          ? ""
          : '<span class="score"' +
            (boxColour ? ' style="color:' + boxColour + '"' : "") + ">" +
            formatPoints(group.points) + "</span>") +
        "</div>"
      );
    })
    .join("");

  fillOrHide("detail-totals", "detail-totals", html);
}

/**
 * One cell of the "Results by category" table.
 *
 * The participant's NAME is shown, painted in their house's colour — this
 * table is about who won, so the name leads and the colour says which house.
 *
 * A tie at a place puts both winners in the same cell joined by "&" (the
 * column heading is the badge). A place that was never awarded — SWIM's
 * Under-19 bronze, for instance — renders as a quiet dash, never an error and
 * never by promoting somebody up into the gap.
 */
function categoryCellHtml(data, category, rank, label) {
  const places = category.places.filter(function (place) {
    return place.rank === rank;
  });

  if (places.length === 0) {
    return '<td data-label="' + label + '" class="empty">—</td>';
  }

  const names = places
    .map(function (place) {
      const house = findHouse(data, place.houseId);

      // TEAM EVENTS: football, basketball and the like have no individual
      // winner — only a house. The maintainer leaves gold_name blank and fills
      // gold_house, and we show the HOUSE's name instead of an empty cell.
      //
      // Decided per cell, not per event, so an event that mixes the two (an
      // individual sprint alongside a team relay) reads correctly either way.
      const participant = String(place.name || "").trim();
      const shown = participant !== "" ? participant : house ? house.name : "";

      if (shown === "") return ""; // neither a name nor a known house

      return (
        '<span style="color:' + houseColour(house) + ';font-weight:700">' +
        escapeHtml(shown) +
        "</span>"
      );
    })
    .filter(Boolean)
    .join(' <span class="empty">&amp;</span> ');

  // Everything in the cell turned out to be unusable — fall back to the dash.
  if (names === "") {
    return '<td data-label="' + label + '" class="empty">—</td>';
  }

  return '<td data-label="' + label + '">' + names + "</td>";
}

/** The Sport variant's category table. Hidden entirely for Direct events. */
function renderDetailCategories(data, event) {
  // Only Calculated events have individual results to show.
  // Calculated events show their categories because that is where their points
  // come from. Override events show them purely for information — the points
  // came from the direct placings, and the table is allowed to disagree.
  // Direct events show no table at all.
  const showsCategories =
    event.resultsMode === RESULTS_MODE.CALCULATED ||
    event.resultsMode === RESULTS_MODE.OVERRIDE;
  const categories = showsCategories ? event.tier2 || [] : [];

  // Some events have no age/grade categories at all — a single overall result,
  // with the category cell left blank on every row. Showing an empty first
  // column there reads as missing data rather than as "this event has no
  // categories", so the column is dropped entirely.
  //
  // Only when EVERY row is blank. A half-filled column is a data problem the
  // maintainer should see, not something to tidy away.
  const hasAnyCategory = categories.some(function (category) {
    return String(category.category || "").trim() !== "";
  });

  const head = el("detail-category-head");
  if (head) head.hidden = !hasAnyCategory;

  const rows = categories
    .map(function (category) {
      return (
        "<tr>" +
        // The category name doubles as the gold header bar on mobile — so when
        // there are no categories the cell is omitted rather than emptied, and
        // the card simply starts at Gold.
        (hasAnyCategory
          ? '<td class="mobile-head cat-name" data-label="">' +
            escapeHtml(category.category) +
            "</td>"
          : "") +
        categoryCellHtml(data, category, 1, "Gold") +
        categoryCellHtml(data, category, 2, "Silver") +
        categoryCellHtml(data, category, 3, "Bronze") +
        "</tr>"
      );
    })
    .join("");

  fillOrHide("detail-categories", "detail-category-rows", rows);
}

/**
 * Turn a write-up from the Sheet into safe HTML.
 *
 * The ONE piece of markup a maintainer may type is <highlight>…</highlight>,
 * which renders gold. Everything else must appear as literal text.
 *
 * The order here is the important part: escape the whole string FIRST, so
 * anything typed into the cell is inert, and only THEN turn the escaped
 * <highlight> markers back into a real span. That way no other tag can ever
 * survive, however the cell was filled in.
 */
function renderWriteupHtml(text) {
  let safe = escapeHtml(text);

  const openCount = (safe.match(/&lt;highlight&gt;/g) || []).length;
  const closeCount = (safe.match(/&lt;\/highlight&gt;/g) || []).length;

  safe = safe
    .replace(/&lt;highlight&gt;/g, '<span class="hl">')
    .replace(/&lt;\/highlight&gt;/g, "</span>");

  // A forgotten closing tag would otherwise turn the rest of the page gold.
  for (let i = closeCount; i < openCount; i++) {
    safe += "</span>";
  }

  // Blank lines become new paragraphs; single line breaks stay line breaks.
  return safe
    .split(/\n{2,}/)
    .map(function (paragraph) {
      return "<p>" + paragraph.replace(/\n/g, "<br>") + "</p>";
    })
    .join("");
}

/**
 * The optional note about an event's results.
 *
 * PLAIN TEXT, deliberately. The write-up field accepts <highlight> markup; this
 * one does not — it is set with textContent, so every character a maintainer
 * types appears exactly as typed and no markup of any kind can be introduced.
 * A pasted <script> tag shows up as those literal characters.
 *
 * Hidden entirely when the cell is blank (§11).
 */
function renderDetailNote(event) {
  const note = String(event.resultNote || "").trim();

  el("detail-note-text").textContent = note; // textContent, never innerHTML
  showSection("detail-note", note !== "");
}

/** The Highlights write-up. Shown only if one has been written (§11). */
function renderDetailHighlights(event) {
  const html = event.writeup ? renderWriteupHtml(event.writeup) : "";
  fillOrHide("detail-highlights", "detail-writeup", html);
}

// Label used for roster members left without a category, on an event where
// other members DO have one. They are still shown — never silently dropped.
const UNCATEGORISED_LABEL = "Other";

/**
 * The first whole number inside a label, or null. "Under 14" → 14.
 * Used to order age groups by age rather than alphabetically, which would
 * otherwise put "Under 14" before "Under 9".
 */
function firstNumberIn(text) {
  const found = /\d+/.exec(String(text || ""));
  return found ? Number(found[0]) : null;
}

/**
 * A consistent, sensible order for category headings — deliberately NOT the
 * order rows happen to appear in the Sheet, so the same event always reads the
 * same way and every house card lines up.
 *
 *   1. categories containing a number, smallest first  (Under 10, Under 12, …)
 *   2. everything else, alphabetically                 (Junior, Senior, …)
 *   3. "Other" last, whatever else is present
 */
function compareCategories(a, b) {
  if (a === UNCATEGORISED_LABEL) return 1;
  if (b === UNCATEGORISED_LABEL) return -1;

  const numberA = firstNumberIn(a);
  const numberB = firstNumberIn(b);

  if (numberA !== null && numberB !== null) return numberA - numberB;
  if (numberA !== null) return -1; // numbered groups before named ones
  if (numberB !== null) return 1;
  return a.localeCompare(b);
}

/**
 * Every category used by this event's roster, in display order.
 * Returns an empty array when nobody has a category — which is the signal to
 * fall back to one flat list per house.
 */
function rosterCategoriesFor(event) {
  const seen = {};
  let anyCategorised = false;

  (event.roster || []).forEach(function (member) {
    const label = String(member.category || "").trim();
    if (label !== "") {
      anyCategorised = true;
      seen[label] = true;
    }
  });

  if (!anyCategorised) return [];

  // If SOME members are categorised and others aren't, the uncategorised ones
  // still need somewhere to go.
  const hasUncategorised = (event.roster || []).some(function (member) {
    return String(member.category || "").trim() === "";
  });
  if (hasUncategorised) seen[UNCATEGORISED_LABEL] = true;

  return Object.keys(seen).sort(compareCategories);
}

/** The <li> list for a set of members, or a quiet dash if there are none. */
function rosterNamesHtml(members, colour) {
  if (members.length === 0) {
    return '<ul><li class="empty">—</li></ul>';
  }
  return (
    "<ul>" +
    members
      .map(function (member) {
        return (
          '<li style="color:' + colour + ';font-weight:700">' +
          escapeHtml(member.name) +
          "</li>"
        );
      })
      .join("") +
    "</ul>"
  );
}

/**
 * Team rosters, one card per house, in the event's finishing order.
 *
 * Two shapes, decided by the data:
 *
 *   No categories  → one flat list per house, exactly as before the category
 *                    column existed. Nothing about existing events changes.
 *   Categories     → each card repeats the SAME category headings in the SAME
 *                    order, so "Under 14" sits at the same height in every
 *                    card. A house with nobody in a category still gets the
 *                    heading and a dash, which is what keeps the rows aligned.
 *
 * The alignment itself is done with CSS subgrid (see styles.css): the cards
 * share the container's rows, so a tall group in one house pushes every other
 * house's next heading down with it. Browsers without subgrid are simply not
 * given the aligned layout — they get the same headings and names, just not
 * locked to a shared baseline.
 *
 * A house with nobody listed at all still gets no card, so a partly-filled
 * Rosters tab looks deliberate.
 */
function renderDetailRosters(data, event) {
  // Finishing order first, then any remaining houses in Houses-tab order, so
  // every house with a roster appears even if it didn't place.
  const placedOrder = event.tier1.map(function (award) {
    return award.houseId;
  });
  const orderedHouses = data.houses.slice().sort(function (a, b) {
    const rankA = placedOrder.indexOf(a.id);
    const rankB = placedOrder.indexOf(b.id);
    if (rankA === -1 && rankB === -1) return 0;
    if (rankA === -1) return 1;
    if (rankB === -1) return -1;
    return rankA - rankB;
  });

  const categories = rosterCategoriesFor(event);

  const cards = orderedHouses
    .map(function (house) {
      const members = (event.roster || []).filter(function (member) {
        return member.houseId === house.id;
      });
      if (members.length === 0) return "";

      const colour = houseColour(house);

      const heading =
        '<h4 style="color:' + colour + ";background:" + hexToRgba(colour, 0.14) + '">' +
        '<span class="dot" style="background:' + colour + '"></span>' +
        escapeHtml(house.name) +
        "</h4>";

      // --- grouped by category ---
      if (categories.length > 0) {
        const groups = categories
          .map(function (label) {
            const inGroup = members.filter(function (member) {
              const own = String(member.category || "").trim();
              return own === label || (own === "" && label === UNCATEGORISED_LABEL);
            });
            // The heading and the list are DIRECT children of the card, not
            // wrapped in a div — subgrid can only align direct children.
            return (
              '<div class="rcat">' + escapeHtml(label) + "</div>" +
              rosterNamesHtml(inGroup, colour)
            );
          })
          .join("");

        return '<div class="roster">' + heading + groups + "</div>";
      }

      // --- one flat list (unchanged behaviour) ---
      return (
        '<div class="roster">' + heading + rosterNamesHtml(members, colour) + "</div>"
      );
    })
    .join("");

  const shown = fillOrHide("detail-teams", "detail-rosters", cards);
  applyRosterAlignment(shown ? categories.length : 0);
}

/**
 * Switch the shared-row alignment on or off.
 *
 * This function's whole job is to tell CSS ONE NUMBER: how many rows the house
 * cards have to share. Each card contributes one row for the house name plus
 * two rows per category (the heading and its list), so that is 1 + 2 × the
 * number of categories.
 *
 * WHY A CUSTOM PROPERTY rather than setting grid-template-rows directly: the
 * mobile stylesheet has to be able to switch the whole thing off (one column
 * means there is nothing to align across), and an inline style would beat a
 * media query. Handing CSS a variable leaves CSS in charge of the layout.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: check whether the browser supports
 * subgrid. It used to, and that was redundant — every rule that acts on the
 * "aligned" class lives inside an @supports (grid-template-rows: subgrid)
 * block in styles.css, so on a browser without subgrid the class and the
 * variable simply do nothing. The stylesheet is the one place that decides
 * whether alignment is possible; this function only ever says how big it is.
 * An older browser still gets the same headings and names, grouped and
 * readable, just not locked to a shared baseline.
 */
function applyRosterAlignment(categoryCount) {
  const container = el("detail-rosters");

  if (categoryCount === 0) {
    container.classList.remove("aligned");
    container.style.removeProperty("--roster-rows");
    return;
  }

  container.classList.add("aligned");
  container.style.setProperty(
    "--roster-rows",
    "repeat(" + (1 + categoryCount * 2) + ", auto)"
  );
}

/**
 * The photo gallery. Hidden entirely until an event has photos (§11).
 *
 * Photos can arrive two ways, and this function does not care which:
 *   Photos tab   — image_url rows in the Sheet. Working today.
 *   Drive folder — an event's photo_folder, listed by the Apps Script of
 *                  blueprint §9. Fully built, but SWITCHED OFF: PHOTO_SCRIPT_URL
 *                  in config.js is "", so no request is ever made. See CLAUDE.md
 *                  for the open questions that need settling before it is used.
 */
function renderDetailPhotos(event) {
  const photos = (event.photos || []).filter(function (photo) {
    return !!photo.url;
  });

  const html = photos
    .map(function (photo) {
      // data-fallback holds the second Drive address. If the first one fails to
      // load, the handler below swaps to it; if that fails too, the tile is
      // removed. A visitor never sees a broken-image icon.
      const fallback = photo.fallbackUrl
        ? ' data-fallback="' + escapeHtml(photo.fallbackUrl) + '"'
        : "";

      return (
        '<img class="photo" src="' + escapeHtml(photo.url) + '"' + fallback +
        ' alt="' + escapeHtml(photo.caption || "") + '"' +
        ' title="' + escapeHtml(photo.caption || "") + '"' +
        ' loading="lazy">'
      );
    })
    .join("");

  if (!fillOrHide("detail-photos", "detail-gallery", html)) return;

  wirePhotoFallbacks();
}

/**
 * Make a picture that won't load disappear quietly.
 *
 * Drive images can fail for reasons nobody on this site controls — a file
 * un-shared, a Google address that stopped working, a flaky connection. Each
 * image gets one retry against its fallback address, and if that fails too the
 * tile is removed from the grid. If every photo fails, the whole section hides,
 * exactly as if there had been no photos at all (§11).
 */
function wirePhotoFallbacks() {
  const gallery = el("detail-gallery");
  const images = gallery.querySelectorAll("img.photo");

  Array.prototype.forEach.call(images, function (image) {
    image.addEventListener("error", function () {
      const fallback = image.dataset.fallback;

      // One retry, against the other Drive address.
      if (fallback && image.src !== fallback) {
        image.src = fallback;
        return;
      }

      console.warn("render-detail.js: a photo could not be loaded and was hidden.");
      image.remove();

      // Nothing left to show? Then the section has no reason to be here.
      if (gallery.querySelectorAll("img.photo").length === 0) {
        showSection("detail-photos", false);
      }
    });
  });
}

/**
 * The optional "Live Mini-Site" section, from the Events tab's minisite_url.
 *
 * Shown only when a usable web address has been entered (§11). The address is
 * put through safeExternalUrl first, so a mistyped or unsafe value hides the
 * section rather than producing a broken or dangerous link. The link opens in a
 * new tab with rel="noopener", so the mini-site can never reach back into this
 * page through window.opener.
 */
function renderDetailMinisite(event) {
  const url = safeExternalUrl(event.minisiteUrl);

  // Just the button — no heading, no explanatory box. The wording says what it
  // is, and it sits directly under the results where it will be seen.
  const html = !url ? "" :
    '<a class="minisite-btn" href="' + escapeHtml(url) + '" ' +
    'target="_blank" rel="noopener noreferrer">' +
    "Click here for further event details " + icon("arrow") + "</a>";

  fillOrHide("detail-minisite", "detail-minisite-body", html);
}

/**
 * Draw the Event Detail view for one event.
 *
 * The same function serves both variants — a Sport shows its category table,
 * a Co-curricular shows its write-up and team rosters — because each section
 * simply hides itself when the event has no data for it.
 *
 * Returns false if the event id doesn't exist, so the caller can decide what
 * to do rather than leaving a half-drawn page.
 */
function renderEventDetail(data, eventId) {
  const event = data.events.find(function (candidate) {
    return candidate.id === eventId;
  });
  if (!event) {
    console.warn('render-detail.js: no event with id "' + eventId + '".');
    return false;
  }

  // innerHTML rather than textContent, so a line break typed in the Sheet is
  // honoured here too. escapeHtmlWithBreaks escapes the name first and only
  // then inserts the <br>, so nothing a maintainer types can become markup.
  el("detail-title").innerHTML = escapeHtmlWithBreaks(event.name);

  // Date · venue, with either part left out if it isn't filled in (§11).
  // Deliberately no type or status flag here, per blueprint §6.3.
  const meta = [formatFullDate(event.date), event.venue].filter(Boolean).join(" · ");
  el("detail-meta").textContent = meta;
  el("detail-meta").hidden = meta === "";

  // An event whose results are still awaited shows a plain message where the
  // result boxes and category table would be — never an empty set of boxes.
  // Everything else about the event (write-up, rosters, photos, mini-site)
  // renders exactly as normal, because that content already exists.
  const awaitingResults = event.status === STATUS.RESULTS_PENDING;
  showSection("detail-pending", awaitingResults);

  if (awaitingResults) {
    fillOrHide("detail-totals", "detail-totals", "");
    fillOrHide("detail-categories", "detail-category-rows", "");
  } else {
    renderDetailTotals(data, event);
    renderDetailCategories(data, event);
  }

  // Sits between the result boxes and the results table, on every event type.
  renderDetailNote(event);

  renderDetailHighlights(event);
  renderDetailMinisite(event); // sits directly below the results
  renderDetailRosters(data, event);
  renderDetailPhotos(event);

  return true;
}

