// calculate.js
// What this file does: the points engine. It takes the validated data object
// and works out every number the site shows — each event's Tier-1 awards, the
// Sports / Co-curricular / Extra breakdowns, and the overall season standings.
//
// It is pure arithmetic. No DOM, no fetching, no colours, no HTML. Nothing in
// here knows a house is called "Alpha" or is red — house ids, house names and
// every point scheme are read from the data object, which came from the Sheet.
//
// Public entry point: calculateAll(data) → { data, warnings }
//
// ---------------------------------------------------------------------------
// THE TIE RULE (confirmed; applies to BOTH tiers)
// ---------------------------------------------------------------------------
// When houses tie for a place, each tied house receives that place's FULL
// points — points are never split or averaged — and THE NEXT PLACE IS STILL
// AWARDED. Places are never skipped.
//
//   two golds        →  both houses get full gold, then the next house gets
//                       silver, then bronze after that
//   one gold, two silvers →  both silver houses get full silver, then bronze
//                       still follows
//   three-way tie    →  all three get full gold, the next house gets silver
//
// In ranking terms this is "dense" ranking (1, 1, 2, 3 …) rather than the
// Olympic style (1, 1, 3, 4). It is implemented in exactly one place —
// groupByEqualPoints() — so both tiers behave identically and a future change
// to the rule is a change to one function.
//
// ---------------------------------------------------------------------------
// WHO EARNS POINTS IN AN EVENT (confirmed)
// ---------------------------------------------------------------------------
// A house only takes points from an event if it actually earned a place there.
// A house that scores nothing receives NOTHING — it is not ranked last and
// handed bottom-place points for turning up (or for not turning up).
//
//   Calculated: only houses with a Tier-2 tally above zero are ranked and
//               awarded. A house on a zero tally is left out entirely.
//   Direct:     only the houses written into direct_1st/2nd/3rd are awarded.
//               A house left out of all three simply scores nothing.
//
// Crucially this does NOT reshuffle anybody. The houses that did score keep the
// places they earned: if two of three houses score, they take full 1st and 2nd
// place points and the third takes zero — the second-placed house is not
// promoted, and the places are not collapsed.
//
// ---------------------------------------------------------------------------
// WHAT COUNTS TOWARDS THE SEASON (confirmed)
// ---------------------------------------------------------------------------
// ONLY events whose status is exactly "Completed". Upcoming and Live events
// contribute nothing to Sports, Co-curricular or Overall — see
// countsTowardsSeason(), which is the single gate every season total passes
// through. An event's own Tier-1 awards are still worked out whatever its
// status (so a Detail page can show what has been entered so far), but those
// awards only reach a leaderboard once the status says Completed.
//
// ---------------------------------------------------------------------------
// DECIMALS
// ---------------------------------------------------------------------------
// Nothing here assumes whole numbers. Point schemes may be fractional (e.g.
// "3.5,2.25,1"), and all arithmetic runs at full precision. Rounding to 2
// decimal places happens ONCE, at the very end, when a season total is written
// into the standings object. Intermediate values are never rounded, so totals
// cannot drift: three awards of 3.333 total 9.999 → 10.00, not 3.33 × 3 = 9.99.
// Each standings row therefore carries both `points` (rounded, for display) and
// `pointsExact` (full precision, for any further maths).
//
// A future "split the points among tied houses" mode would be a contained
// change: the tie rule lives in groupByEqualPoints/awardPlaceGroups only.

// =====================================================================
// SECTION 1 — number helpers
// =====================================================================

// Two totals computed by different routes (say 0.1+0.2 and 0.3) can differ in
// the last bits of floating-point arithmetic. Anything closer together than
// this counts as a genuine tie.
const POINTS_EQUAL_TOLERANCE = 1e-9;

/** Round to 2 decimal places. Used ONLY on final, display-bound totals. */
function roundToTwoDecimals(value) {
  // The tiny EPSILON nudge stops values like 1.005, which are really
  // 1.00499999… in binary, from rounding down unexpectedly.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Are these two point totals the same (allowing for floating-point dust)? */
function pointsEqual(a, b) {
  return Math.abs(a - b) < POINTS_EQUAL_TOLERANCE;
}

/**
 * What is `place` worth under this scheme? Place 1 = the first number.
 *
 * A place beyond the end of the scheme is worth nothing — with a 3-place
 * scheme like 10,7,4 a fourth-placed house scores 0. That is also what makes a
 * missing scheme safe: it simply awards nothing rather than throwing.
 */
function schemePointsFor(scheme, place) {
  if (!scheme || place < 1 || place > scheme.length) return 0;
  return scheme[place - 1];
}

// =====================================================================
// SECTION 2 — the tie rule, in one place
// =====================================================================

/**
 * Sort entries by points (highest first) and gather equal scores together.
 *
 * The returned array IS the placing order: groups[0] is 1st place, groups[1] is
 * 2nd place, and so on — so a group holding two houses does not push the next
 * group down to 3rd. That single fact is the whole tie rule.
 *
 *   [A:20, B:10, C:10, D:5]  →  [ {20:[A]}, {10:[B,C]}, {5:[D]} ]
 *                                  1st        2nd (tie)    3rd
 *
 * Within a group the entries keep the order they arrived in (which is the order
 * of the Houses tab), so tied names always read the same way round on screen.
 */
function groupByEqualPoints(entries) {
  const sorted = entries.slice().sort(function (a, b) {
    return b.points - a.points;
  });

  const groups = [];
  sorted.forEach(function (entry) {
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && pointsEqual(currentGroup.points, entry.points)) {
      currentGroup.entries.push(entry); // same score → same place
    } else {
      groups.push({ points: entry.points, entries: [entry] });
    }
  });

  return groups;
}

/**
 * Turn place-groups into awards: everyone in the group at place N receives the
 * FULL value of place N.
 *
 * `positionOf` decides what place a group counts as. For a Calculated event the
 * place comes from the group's order (1st, 2nd, 3rd…). For a Direct event the
 * place was typed into the Sheet, so we use that number instead — which is what
 * keeps a gap a gap (see calculateTier1).
 */
function awardPlaceGroups(groups, scheme, positionOf) {
  return groups.map(function (group, index) {
    const position = positionOf ? positionOf(group, index) : index + 1;
    return {
      position: position,
      points: schemePointsFor(scheme, position),
      houseIds: group.entries.map(function (entry) {
        return entry.houseId;
      }),
    };
  });
}

/**
 * Rank a list of {houseId, points}, applying the same tie philosophy: tied
 * houses share a rank and the next rank is not skipped (1, 1, 2 …).
 *
 * Returns [{ houseId, points, rank }] in finishing order.
 */
function calculateRanks(entries) {
  const ranked = [];

  groupByEqualPoints(entries).forEach(function (group, index) {
    const rank = index + 1; // joint ranks; the following rank is never skipped
    group.entries.forEach(function (entry) {
      ranked.push({
        houseId: entry.houseId,
        points: entry.points,
        rank: rank,
      });
    });
  });

  return ranked;
}

// =====================================================================
// SECTION 3 — display helpers for ties
// =====================================================================

/**
 * Build the label for a placing: one badge, tied houses joined by " & ".
 *
 * Order is always the order of the Houses tab, so the same tie never appears as
 * "Beta & Alpha" in one place and "Alpha & Beta" in another.
 */
function buildPlacingLabel(houseIds, houses) {
  return houses
    .filter(function (house) {
      return houseIds.indexOf(house.id) !== -1;
    })
    .map(function (house) {
      return house.name;
    })
    .join(" & ");
}

/** Put house ids back into Houses-tab order. */
function sortHouseIdsBySheetOrder(houseIds, houses) {
  return houses
    .filter(function (house) {
      return houseIds.indexOf(house.id) !== -1;
    })
    .map(function (house) {
      return house.id;
    });
}

// =====================================================================
// SECTION 4 — Tier 2 (individual results within one event)
// =====================================================================

/**
 * Add up an event's individual results into a points tally per house.
 *
 * Each placing is worth tier2_scheme[rank]. Ties need no special handling here:
 * a tie arrives from the Sheet as two entries both at rank 1, so both simply
 * collect full gold points — and the silver typed in the next column is still
 * counted, which is the tie rule working exactly as specified.
 *
 * A placing that validate.js set aside is already gone from the data, so it
 * contributes nothing and the remaining places keep their own values — a gap,
 * not a shuffle.
 *
 * Returns { tally: [{houseId, points}] for EVERY house, placingCount }.
 */
function calculateTier2(event, tier2Scheme, houses) {
  const pointsByHouse = {};
  houses.forEach(function (house) {
    pointsByHouse[house.id] = 0; // a house with no placings still scores 0
  });

  let placingCount = 0;

  (event.tier2 || []).forEach(function (category) {
    category.places.forEach(function (place) {
      // Unknown houses were removed by validate.js; this is belt and braces.
      if (!(place.houseId in pointsByHouse)) return;

      pointsByHouse[place.houseId] += schemePointsFor(tier2Scheme, place.rank);
      placingCount++;
    });
  });

  return {
    tally: houses.map(function (house) {
      return { houseId: house.id, points: pointsByHouse[house.id] };
    }),
    placingCount: placingCount,
  };
}

// =====================================================================
// SECTION 5 — Tier 1 (house points for one event)
// =====================================================================

/**
 * Which Tier-1 scheme does this event use? The event's own `tier1_override` if
 * one was typed, otherwise the default for its type. Returns null if neither
 * exists, so the caller can report it rather than silently scoring zero.
 */
function tier1SchemeFor(event, config) {
  if (event.tier1Override) {
    return { scheme: event.tier1Override, source: "tier1_override" };
  }

  if (event.type === EVENT_TYPE.SPORT && config.schemes.sports) {
    return { scheme: config.schemes.sports, source: "sports_scheme" };
  }

  if (event.type === EVENT_TYPE.COCURRICULAR && config.schemes.cocurricular) {
    return { scheme: config.schemes.cocurricular, source: "cocurricular_scheme" };
  }

  return null;
}

/**
 * Work out one event's Tier-1 house points.
 *
 * CALCULATED events: sum the individual results (Tier 2) → rank the houses on
 * that tally → award the Tier-1 scheme by rank. So the ranking is *derived*,
 * and the tie rule applies to it: two houses on the same tally both take full
 * first-place points and the next house still takes second.
 *
 * DIRECT events: the house placings were typed straight into the Sheet, so we
 * award the scheme against the position as written. Nothing is re-ranked — if
 * 2nd place was set aside by validation, 1st and 3rd keep their own points and
 * nobody is promoted into the gap. Inventing a promotion would invent a result.
 *
 * Writes onto the event and returns nothing:
 *   event.tier1        [{ houseId, position, points }]   — the §5 contract
 *   event.tier1Display [{ position, points, houseIds, label, isTie }] — one
 *                      entry per BADGE, so a tie renders as a single token
 *   event.tier2Tally   [{ houseId, points, rank }]       — Detail-page table
 */
function calculateTier1(event, data, notes) {
  const houses = data.houses;
  const config = data.config;

  // Start from a clean slate so re-running never doubles anything up.
  event.tier1 = [];
  event.tier1Display = [];
  event.tier2Tally = [];

  const schemeInfo = tier1SchemeFor(event, config);
  if (!schemeInfo) {
    notes.push({
      level: "error",
      tab: "Events",
      subject: event.id,
      cell: "tier1_override",
      message:
        'No Tier-1 point scheme available for this event (type "' +
        event.type +
        '" has no default scheme in Config, and no tier1_override was set). It scores no points.',
    });
    return;
  }

  let placeGroups = [];

  if (event.resultsMode === RESULTS_MODE.CALCULATED) {
    const tier2Scheme = config.schemes.tier2;

    if (!tier2Scheme) {
      notes.push({
        level: "error",
        tab: "Config",
        subject: "tier2_scheme",
        cell: "value",
        message:
          'Event "' +
          event.id +
          '" is Calculated but tier2_scheme is missing, so its individual results cannot be scored.',
      });
      return;
    }

    const tier2 = calculateTier2(event, tier2Scheme, houses);

    // An event with no results yet must award NOTHING. Without this guard every
    // house would sit on 0, all houses would "tie for first", and everybody
    // would collect full gold points for an event that hasn't happened.
    if (tier2.placingCount === 0) {
      return;
    }

    // CONFIRMED RULE — zero tally earns zero.
    // Only houses that actually scored take part in the ranking. A house on a
    // zero tally is not ranked last and handed bottom-place points; it is left
    // out of the awards altogether.
    //
    // Note what this does NOT do: the houses that DID score keep the places
    // they earned. With A on 10, B on 5 and C on nothing, A takes full first
    // place and B takes full second — B is not promoted into C's absence, and
    // the places are not collapsed. Only C's award disappears.
    const scoringHouses = tier2.tally.filter(function (entry) {
      return entry.points > 0;
    });
    const nonScoringHouses = tier2.tally.filter(function (entry) {
      return entry.points <= 0;
    });

    if (scoringHouses.length === 0) {
      return; // placings exist but none were worth anything — award nothing
    }

    // The Detail-page tally still lists EVERY house, so a house on zero is
    // visible rather than mysteriously missing. Houses that did not score carry
    // rank null, because they did not place.
    event.tier2Tally = calculateRanks(scoringHouses).concat(
      nonScoringHouses.map(function (entry) {
        return { houseId: entry.houseId, points: entry.points, rank: null };
      })
    );

    placeGroups = awardPlaceGroups(
      groupByEqualPoints(scoringHouses),
      schemeInfo.scheme
    );
  } else if (event.resultsMode === RESULTS_MODE.DIRECT) {
    const placings = event.directPlacings || [];
    if (placings.length === 0) {
      return; // nothing entered yet — award nothing
    }

    // Group the houses by the position TYPED IN THE SHEET. Two houses sharing
    // direct_1st is a tie (both take full first-place points); a missing
    // direct_2nd simply leaves 2nd unawarded.
    //
    // The "zero tally earns zero" rule needs no extra code here: only houses
    // actually written into direct_1st/2nd/3rd appear in this list, so a house
    // left out of all three is never awarded anything.
    const byPosition = {};
    placings.forEach(function (placing) {
      if (!byPosition[placing.position]) byPosition[placing.position] = [];
      byPosition[placing.position].push({ houseId: placing.houseId });
    });

    const groups = Object.keys(byPosition)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .map(function (position) {
        return { position: position, entries: byPosition[position] };
      });

    // positionOf uses the Sheet's own number, NOT the group's order — that is
    // what preserves a gap instead of shuffling 3rd place up into 2nd.
    placeGroups = awardPlaceGroups(groups, schemeInfo.scheme, function (group) {
      return group.position;
    });
  } else {
    notes.push({
      level: "error",
      tab: "Events",
      subject: event.id,
      cell: "results_mode",
      message:
        'Results mode "' +
        event.resultsMode +
        '" is not recognised, so this event scores no points.',
    });
    return;
  }

  // --- write the two views of the same result ---
  placeGroups.forEach(function (group) {
    const orderedIds = sortHouseIdsBySheetOrder(group.houseIds, houses);

    // One row per house — the calculation-facing shape from blueprint §5.
    orderedIds.forEach(function (houseId) {
      event.tier1.push({
        houseId: houseId,
        position: group.position,
        points: group.points, // full points each; never divided by the tie size
      });
    });

    // One row per BADGE — the render-facing shape. A tie is a single badge.
    event.tier1Display.push({
      position: group.position,
      points: group.points,
      houseIds: orderedIds,
      label: buildPlacingLabel(orderedIds, houses),
      isTie: orderedIds.length > 1,
    });
  });
}

// =====================================================================
// SECTION 6 — season standings
// =====================================================================

/**
 * Does this row belong to the season being shown?
 *
 * Blank years are included rather than discarded (robustness over strictness),
 * and a blank current_year means "show everything". Passing the year in as a
 * parameter is what will let the hidden year-picker (blueprint §10) work later
 * without touching the maths.
 */
function isInSeason(rowYear, seasonYear) {
  if (!seasonYear) return true;
  if (!rowYear) return true;
  return rowYear === seasonYear;
}

/**
 * THE SEASON GATE — the single rule about which events count.
 *
 * An event contributes points to Sports, Co-curricular and Overall ONLY when
 * its status is exactly "Completed". Upcoming and Live events contribute
 * nothing to any total, even if results have already been typed into the Sheet:
 * results are not final until the event is marked Completed.
 *
 * Every season total passes through this one function, so there is exactly one
 * place to look — and exactly one place to change — for that rule.
 */
function countsTowardsSeason(event, seasonYear) {
  if (event.status !== STATUS.COMPLETED) return false;
  return isInSeason(event.year, seasonYear);
}

/**
 * Total each house's Tier-1 points across a set of events.
 * Returns [{houseId, points}] at FULL precision, for every house.
 */
function totalTier1Points(events, houses) {
  const pointsByHouse = {};
  houses.forEach(function (house) {
    pointsByHouse[house.id] = 0;
  });

  events.forEach(function (event) {
    (event.tier1 || []).forEach(function (award) {
      if (award.houseId in pointsByHouse) {
        pointsByHouse[award.houseId] += award.points;
      }
    });
  });

  return houses.map(function (house) {
    return { houseId: house.id, points: pointsByHouse[house.id] };
  });
}

/** Total the Extra Points rows per house, at full precision. */
function totalExtraPoints(extraPoints, houses, seasonYear) {
  const pointsByHouse = {};
  houses.forEach(function (house) {
    pointsByHouse[house.id] = 0;
  });

  (extraPoints || []).forEach(function (entry) {
    if (!isInSeason(entry.year, seasonYear)) return;
    if (entry.houseId in pointsByHouse) {
      pointsByHouse[entry.houseId] += entry.points; // may be negative
    }
  });

  return houses.map(function (house) {
    return { houseId: house.id, points: pointsByHouse[house.id] };
  });
}

/**
 * Overall = Sports + Co-curricular + Extra, added at full precision.
 * This is the ONLY place the three strands come together.
 */
function calculateOverall(sportsTotals, cocurricularTotals, extraTotals, houses) {
  function lookup(totals, houseId) {
    const found = totals.find(function (entry) {
      return entry.houseId === houseId;
    });
    return found ? found.points : 0;
  }

  return houses.map(function (house) {
    return {
      houseId: house.id,
      points:
        lookup(sportsTotals, house.id) +
        lookup(cocurricularTotals, house.id) +
        lookup(extraTotals, house.id),
    };
  });
}

/**
 * Rank a set of totals and round for display.
 *
 * Ranking uses the EXACT values, not the rounded ones, so two houses are only
 * ever declared level if their true totals really are level.
 */
function finaliseTable(totals) {
  return calculateRanks(totals).map(function (entry) {
    return {
      houseId: entry.houseId,
      points: roundToTwoDecimals(entry.points), // display value
      pointsExact: entry.points, // full precision, for any further maths
      rank: entry.rank,
    };
  });
}

/**
 * Who is Best House? Everyone sharing top rank — joint champions, with no
 * artificial tiebreaker, matching the per-event tie philosophy.
 *
 * Returns null when nothing has been scored yet, so the page can simply omit
 * the title rather than crowning everybody with zero points.
 */
function findChampion(overallTable, houses) {
  if (overallTable.length === 0) return null;

  const leaders = overallTable.filter(function (entry) {
    return entry.rank === 1;
  });

  const everyoneOnZero = overallTable.every(function (entry) {
    return pointsEqual(entry.pointsExact, 0);
  });
  if (everyoneOnZero) return null;

  const houseIds = sortHouseIdsBySheetOrder(
    leaders.map(function (entry) {
      return entry.houseId;
    }),
    houses
  );

  return {
    houseIds: houseIds,
    label: buildPlacingLabel(houseIds, houses),
    points: leaders[0].points,
    isJoint: houseIds.length > 1,
  };
}

/**
 * Build the whole standings object (blueprint §5).
 *
 * Only events with status = Completed count towards the season — an Upcoming
 * or Live event contributes nothing until its results are in.
 */
function calculateStandings(data, seasonYear) {
  const houses = data.houses;

  // The ONLY place events are chosen for the season totals — see the gate above.
  const completedEvents = (data.events || []).filter(function (event) {
    return countsTowardsSeason(event, seasonYear);
  });

  const sportsEvents = completedEvents.filter(function (event) {
    return event.type === EVENT_TYPE.SPORT;
  });
  const cocurricularEvents = completedEvents.filter(function (event) {
    return event.type === EVENT_TYPE.COCURRICULAR;
  });

  const sportsTotals = totalTier1Points(sportsEvents, houses);
  const cocurricularTotals = totalTier1Points(cocurricularEvents, houses);
  const extraTotals = totalExtraPoints(data.extraPoints, houses, seasonYear);
  const overallTotals = calculateOverall(
    sportsTotals,
    cocurricularTotals,
    extraTotals,
    houses
  );

  const overall = finaliseTable(overallTotals);

  return {
    overall: overall,
    sports: finaliseTable(sportsTotals),
    cocurricular: finaliseTable(cocurricularTotals),
    extra: finaliseTable(extraTotals),

    // Extras beyond the §5 minimum, for the header and hero:
    champion: findChampion(overall, houses),
    seasonYear: seasonYear || "",
    completedEventCount: completedEvents.length,
  };
}

// =====================================================================
// SECTION 7 — the one public function
// =====================================================================

/**
 * Fill in every calculated number on the data object.
 *
 * Call it with data that has already been through validate.js, so the maths
 * only ever sees rows worth counting:
 *
 *     const loaded = await loadSiteData();
 *     const checked = validateSiteData(loaded);
 *     const scored  = calculateAll(checked.data);
 *
 * Returns { data, warnings }. The warnings use the same shape validate.js
 * produces, so main.js can simply join the two lists for the ?debug panel.
 */
function calculateAll(data) {
  const notes = [];

  // Guard: with no data or no houses there is nothing to add up. Return an
  // empty-but-valid standings object so the rest of the site cannot crash.
  if (!data || !data.houses || data.houses.length === 0) {
    if (data) {
      data.standings = {
        overall: [],
        sports: [],
        cocurricular: [],
        extra: [],
        champion: null,
        seasonYear: "",
        completedEventCount: 0,
      };
    }
    return { data: data, warnings: notes };
  }

  // Step 1 — every event's own points, independent of every other event.
  (data.events || []).forEach(function (event) {
    calculateTier1(event, data, notes);
  });

  // Step 2 — add the completed events up into the season standings.
  data.standings = calculateStandings(data, data.config && data.config.currentYear);

  notes.forEach(function (note) {
    console.error("calculate.js: [" + note.tab + " — " + note.subject + "] " + note.message);
  });

  return { data: data, warnings: notes };
}
