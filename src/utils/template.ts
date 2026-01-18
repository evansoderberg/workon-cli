/**
 * PR template section manipulation utilities
 *
 * Handles parsing and updating PR body sections while preserving
 * the overall template structure (especially Best Practices checklists).
 */

export interface PrSections {
  summary?: string;
  ticket?: string; // ticket ID - will generate both CU-{id} and full URL
  description?: string;
  testing?: string;
}

/**
 * Generate full ClickUp ticket URL from ID
 */
export function getTicketUrl(ticketId: string): string {
  return `https://app.clickup.com/t/${ticketId}`;
}

/**
 * Update specific sections of a PR body while preserving everything else.
 *
 * Template structure:
 * ```
 * ## Summary
 * {summary content}
 *
 * #### Ticket: CU-{ticket_id}
 * {full ticket URL}
 *
 * ### Description
 * <!-- comment -->
 * {description content}
 *
 * ### How to Test
 * <!-- comment -->
 * {testing content}
 *
 * ## Best Practices
 * {checklists - never modified}
 * ```
 */
export function updatePrSections(body: string, updates: PrSections): string {
  let result = body;

  if (updates.summary !== undefined) {
    result = updateSummarySection(result, updates.summary);
  }

  if (updates.ticket !== undefined) {
    result = updateTicketSection(result, updates.ticket);
  }

  if (updates.description !== undefined) {
    result = updateDescriptionSection(result, updates.description);
  }

  if (updates.testing !== undefined) {
    result = updateTestingSection(result, updates.testing);
  }

  return result;
}

/**
 * Update the Summary section (between "## Summary" and "#### Ticket:")
 */
function updateSummarySection(body: string, summary: string): string {
  // Match from "## Summary" to just before "#### Ticket:"
  const regex = /(## Summary\s*\n)([\s\S]*?)(\n*#### Ticket:)/;
  const match = body.match(regex);

  if (match) {
    return body.replace(regex, `$1\n${summary}\n\n$3`);
  }

  // If no Ticket section exists yet, try to find Summary followed by Description
  const fallbackRegex = /(## Summary\s*\n)([\s\S]*?)(\n*### Description)/;
  const fallbackMatch = body.match(fallbackRegex);

  if (fallbackMatch) {
    return body.replace(fallbackRegex, `$1\n${summary}\n\n$3`);
  }

  return body;
}

/**
 * Update the Ticket section (replace "#### Ticket: CU-{id}" line and add URL)
 */
function updateTicketSection(body: string, ticketId: string): string {
  const ticketUrl = getTicketUrl(ticketId);

  // Match the ticket line and any URL that follows
  // Pattern: "#### Ticket: CU-..." potentially followed by a URL line
  const regex = /(#### Ticket: CU-)[^\n]*(\n(?:https?:\/\/[^\n]*)?)?/;
  const match = body.match(regex);

  if (match) {
    return body.replace(regex, `#### Ticket: CU-${ticketId}\n${ticketUrl}`);
  }

  // If no ticket section exists, try to add one after Summary
  const summaryRegex = /(## Summary[\s\S]*?)(\n*### Description)/;
  const summaryMatch = body.match(summaryRegex);

  if (summaryMatch) {
    return body.replace(
      summaryRegex,
      `$1\n\n#### Ticket: CU-${ticketId}\n${ticketUrl}\n$2`
    );
  }

  return body;
}

/**
 * Update the Description section (between "### Description" and "### How to Test")
 * Preserves the HTML comment if present
 */
function updateDescriptionSection(body: string, description: string): string {
  // Match from "### Description" to "### How to Test", preserving HTML comment
  const regex =
    /(### Description\s*\n)(<!--[^>]*-->\s*\n)?([\s\S]*?)(\n*### How to Test)/;
  const match = body.match(regex);

  if (match) {
    const comment = match[2] || '';
    return body.replace(regex, `$1${comment}\n${description}\n\n$4`);
  }

  return body;
}

/**
 * Update the Testing section (between "### How to Test" and "## Best Practices")
 * Preserves the HTML comment if present
 */
function updateTestingSection(body: string, testing: string): string {
  // Match from "### How to Test" to "## Best Practices", preserving HTML comment
  const regex =
    /(### How to Test\s*\n)(<!--[^>]*-->\s*\n)?([\s\S]*?)(\n*## Best Practices)/;
  const match = body.match(regex);

  if (match) {
    const comment = match[2] || '';
    return body.replace(regex, `$1${comment}\n${testing}\n\n$4`);
  }

  return body;
}

/**
 * Extract current values from a PR body
 */
export function extractPrSections(body: string): PrSections {
  const sections: PrSections = {};

  // Extract summary
  const summaryMatch = body.match(/## Summary\s*\n([\s\S]*?)(?=\n*#### Ticket:|### Description)/);
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim();
  }

  // Extract ticket ID
  const ticketMatch = body.match(/#### Ticket: CU-([a-z0-9]+)/i);
  if (ticketMatch) {
    sections.ticket = ticketMatch[1];
  }

  // Extract description (skip HTML comment)
  const descMatch = body.match(
    /### Description\s*\n(?:<!--[^>]*-->\s*\n)?([\s\S]*?)(?=\n*### How to Test)/
  );
  if (descMatch) {
    sections.description = descMatch[1].trim();
  }

  // Extract testing (skip HTML comment)
  const testMatch = body.match(
    /### How to Test\s*\n(?:<!--[^>]*-->\s*\n)?([\s\S]*?)(?=\n*## Best Practices)/
  );
  if (testMatch) {
    sections.testing = testMatch[1].trim();
  }

  return sections;
}
