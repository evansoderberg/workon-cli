/**
 * Dry-run mode utilities for testing commands without executing side effects
 */

import chalk from 'chalk';

let dryRunEnabled = false;

/**
 * Enable or disable dry-run mode globally
 */
export function setDryRun(enabled: boolean): void {
  dryRunEnabled = enabled;
}

/**
 * Check if dry-run mode is enabled
 */
export function isDryRun(): boolean {
  return dryRunEnabled;
}

/**
 * Log a dry-run action that would be performed
 */
export function dryRunLog(category: 'git' | 'github' | 'clickup', action: string, details?: Record<string, unknown>): void {
  const prefix = chalk.cyan('[DRY-RUN]');
  const categoryColor = {
    git: chalk.yellow,
    github: chalk.magenta,
    clickup: chalk.blue,
  }[category];

  console.log(`${prefix} ${categoryColor(`[${category.toUpperCase()}]`)} ${action}`);

  if (details) {
    for (const [key, value] of Object.entries(details)) {
      const displayValue = typeof value === 'string' && value.length > 200
        ? value.slice(0, 200) + '...'
        : value;
      console.log(`  ${chalk.dim(key + ':')} ${typeof displayValue === 'object' ? JSON.stringify(displayValue, null, 2) : displayValue}`);
    }
  }
}

/**
 * Wrap a function to skip execution in dry-run mode
 * Returns the provided mock value instead
 */
export function dryRunWrap<T>(
  category: 'git' | 'github' | 'clickup',
  action: string,
  fn: () => T,
  mockValue: T,
  details?: Record<string, unknown>
): T {
  if (isDryRun()) {
    dryRunLog(category, action, details);
    return mockValue;
  }
  return fn();
}

/**
 * Async version of dryRunWrap
 */
export async function dryRunWrapAsync<T>(
  category: 'git' | 'github' | 'clickup',
  action: string,
  fn: () => Promise<T>,
  mockValue: T,
  details?: Record<string, unknown>
): Promise<T> {
  if (isDryRun()) {
    dryRunLog(category, action, details);
    return mockValue;
  }
  return fn();
}
