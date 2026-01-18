/**
 * Check if a string looks like a ClickUp ticket ID
 * Format: exactly 9 alphanumeric characters (lowercase)
 */
export function isTicketId(input: string): boolean {
  return /^[a-z0-9]{9}$/.test(input.toLowerCase());
}

/**
 * Extract ticket ID from branch name
 * Expected format: prefix/ticketId/slug
 */
export function extractTicketIdFromBranch(branch: string): string | null {
  const parts = branch.split('/');
  if (parts.length >= 2) {
    const potentialId = parts[1];
    if (isTicketId(potentialId)) {
      return potentialId;
    }
  }
  return null;
}

/**
 * Generate a URL-safe slug from a title
 * - Lowercase
 * - Replace non-alphanumeric with hyphens
 * - Max 5 words
 * - Max 40 characters
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 5)
    .join('-')
    .substring(0, 40)
    .replace(/-+$/, ''); // Remove trailing hyphens
}

/**
 * Generate a full branch name
 * Format: prefix/ticketId/slug
 */
export function generateBranchName(prefix: string, ticketId: string, title: string): string {
  const slug = slugify(title);
  return `${prefix}/${ticketId}/${slug}`;
}

/**
 * Validate a branch name for safety
 * - Only allows alphanumeric, hyphens, underscores, forward slashes, and dots
 * - Cannot start with a hyphen or dot
 * - Cannot contain consecutive dots or slashes
 * - Cannot end with .lock
 * - Cannot contain shell metacharacters
 */
export function isValidBranchName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 255) {
    return false;
  }

  // Must only contain safe characters
  if (!/^[a-zA-Z0-9/_.-]+$/.test(name)) {
    return false;
  }

  // Cannot start with hyphen, dot, or slash
  if (/^[-./]/.test(name)) {
    return false;
  }

  // Cannot end with dot, slash, or .lock
  if (/[./]$/.test(name) || name.endsWith('.lock')) {
    return false;
  }

  // Cannot contain consecutive dots or slashes
  if (/\.\./.test(name) || /\/\//.test(name)) {
    return false;
  }

  // Cannot contain @{
  if (name.includes('@{')) {
    return false;
  }

  return true;
}

/**
 * Sanitize a branch name by removing invalid characters
 * Returns null if the result would be empty or invalid
 */
export function sanitizeBranchName(name: string): string | null {
  if (!name) return null;

  // Remove any characters that aren't alphanumeric, hyphen, underscore, slash, or dot
  let sanitized = name.replace(/[^a-zA-Z0-9/_.-]/g, '-');

  // Replace consecutive hyphens/dots/slashes with single instances
  sanitized = sanitized.replace(/-+/g, '-').replace(/\.+/g, '.').replace(/\/+/g, '/');

  // Remove leading/trailing hyphens, dots, slashes
  sanitized = sanitized.replace(/^[-./]+/, '').replace(/[-./]+$/, '');

  // Remove .lock suffix if present
  if (sanitized.endsWith('.lock')) {
    sanitized = sanitized.slice(0, -5);
  }

  if (!sanitized || !isValidBranchName(sanitized)) {
    return null;
  }

  return sanitized;
}
