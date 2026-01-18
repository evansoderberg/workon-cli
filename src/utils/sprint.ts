import { parse, isWithinInterval, setYear, getYear, endOfDay, startOfDay } from 'date-fns';
import type { ClickUpList } from '../types.js';

interface SprintMatch {
  list: ClickUpList;
  startDate: Date;
  endDate: Date;
}

/**
 * Find the current sprint list by parsing date ranges from list names
 *
 * Expected formats:
 * - "Sprint 5 (1/19 - 2/1)"
 * - "97 Commerce 1 (1/5 - 1/18)"
 * - Any list with "(MM/DD - MM/DD)" pattern
 */
export function findCurrentSprintByDate(
  lists: ClickUpList[],
  patterns?: string[],
  debug = false
): ClickUpList | null {
  const today = new Date();
  const currentYear = getYear(today);

  if (debug) {
    console.log(`[Sprint Debug] Today: ${today.toISOString()}, Year: ${currentYear}, Month: ${today.getMonth()}`);
  }

  const matches: SprintMatch[] = [];

  for (const list of lists) {
    // If patterns provided, check if list matches any pattern
    if (patterns && patterns.length > 0) {
      const matchesPattern = patterns.some(p => new RegExp(p).test(list.name));
      if (!matchesPattern) continue;
    }

    // Extract date range: (MM/DD - MM/DD)
    const dateMatch = list.name.match(/\((\d{1,2}\/\d{1,2})\s*-\s*(\d{1,2}\/\d{1,2})\)/);
    if (!dateMatch) continue;

    const [, startStr, endStr] = dateMatch;

    try {
      // Parse dates assuming current year
      let startDate = parse(startStr, 'M/d', new Date());
      let endDate = parse(endStr, 'M/d', new Date());

      // Set the year
      startDate = setYear(startDate, currentYear);
      endDate = setYear(endDate, currentYear);

      // Use start of day for start date and end of day for end date
      // This ensures the full day is included in the interval
      startDate = startOfDay(startDate);
      endDate = endOfDay(endDate);

      // Handle year boundary (e.g., Dec 15 - Jan 5)
      if (endDate < startDate) {
        // Sprint spans year boundary
        if (today.getMonth() <= endDate.getMonth()) {
          // We're in the new year part (Jan-Jun), so start was last year
          startDate = setYear(startDate, currentYear - 1);
        } else {
          // We're in the old year part (Jul-Dec), so end is next year
          endDate = setYear(endDate, currentYear + 1);
        }
      } else {
        // Dates don't cross year boundary, but we need to handle the case where
        // we're in early months looking at late-year sprints (which would be from last year)
        // or late months looking at early-year sprints (which would be next year)
        const startMonth = startDate.getMonth();
        const todayMonth = today.getMonth();

        // If sprint is in late year (Oct-Dec) and we're in early year (Jan-Mar),
        // the sprint was probably last year
        if (startMonth >= 9 && todayMonth <= 2) {
          startDate = setYear(startDate, currentYear - 1);
          endDate = setYear(endDate, currentYear - 1);
        }
        // If sprint is in early year (Jan-Mar) and we're in late year (Oct-Dec),
        // the sprint is probably next year
        else if (startMonth <= 2 && todayMonth >= 9) {
          startDate = setYear(startDate, currentYear + 1);
          endDate = setYear(endDate, currentYear + 1);
        }
      }

      if (debug) {
        console.log(`[Sprint Debug] ${list.name}: ${startDate.toISOString()} - ${endDate.toISOString()}`);
      }

      matches.push({ list, startDate, endDate });

      // Check if today falls within this range
      if (isWithinInterval(today, { start: startDate, end: endDate })) {
        if (debug) {
          console.log(`[Sprint Debug] MATCHED: ${list.name}`);
        }
        return list;
      }
    } catch {
      // Skip lists with unparseable dates
      continue;
    }
  }

  // If no exact match, find the closest upcoming or most recent sprint
  if (matches.length > 0) {
    if (debug) {
      console.log(`[Sprint Debug] No exact match found, using fallback logic`);
    }

    // Sort by start date
    matches.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    // First, try to find an upcoming sprint that starts soon (within 7 days)
    const upcomingSoon = matches.find(m =>
      m.startDate > today &&
      m.startDate.getTime() - today.getTime() <= 7 * 24 * 60 * 60 * 1000
    );
    if (upcomingSoon) {
      if (debug) {
        console.log(`[Sprint Debug] Fallback: upcoming soon - ${upcomingSoon.list.name}`);
      }
      return upcomingSoon.list;
    }

    // Otherwise, find the most recent sprint that has ended
    const pastSprints = matches.filter(m => m.endDate < today);
    if (pastSprints.length > 0) {
      // Return the most recent past sprint
      if (debug) {
        console.log(`[Sprint Debug] Fallback: most recent past - ${pastSprints[pastSprints.length - 1].list.name}`);
      }
      return pastSprints[pastSprints.length - 1].list;
    }

    // If no past sprints, return the next upcoming one
    const futureSprints = matches.filter(m => m.startDate > today);
    if (futureSprints.length > 0) {
      if (debug) {
        console.log(`[Sprint Debug] Fallback: next upcoming - ${futureSprints[0].list.name}`);
      }
      return futureSprints[0].list;
    }
  }

  return null;
}
