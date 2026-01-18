/**
 * Utilities for handling graceful CLI exits
 */

/**
 * Check if an error is a user cancellation (Ctrl+C)
 */
export function isUserCancellation(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // @inquirer/prompts throws ExitPromptError with name 'ExitPromptError'
    if ('name' in error && error.name === 'ExitPromptError') {
      return true;
    }
    // Also check for the message pattern
    if ('message' in error && typeof error.message === 'string') {
      if (error.message.includes('User force closed the prompt')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Handle graceful exit - silently exits on Ctrl+C, rethrows other errors
 */
export function handleExit(error: unknown): never {
  if (isUserCancellation(error)) {
    // User cancelled - exit silently with code 0
    process.exit(0);
  }
  // Re-throw other errors
  throw error;
}

/**
 * Wrap an async command to handle cancellation gracefully
 */
export function withGracefulExit<T extends (...args: any[]) => Promise<void>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      await fn(...args);
    } catch (error) {
      handleExit(error);
    }
  }) as T;
}
