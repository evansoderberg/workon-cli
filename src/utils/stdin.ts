/**
 * Utilities for reading piped input from stdin
 */

/**
 * Check if stdin has piped input (not from a TTY)
 */
export function isStdinPiped(): boolean {
  return !process.stdin.isTTY;
}

/**
 * Read all content from stdin
 * Returns empty string if stdin is a TTY (no piped input)
 */
export async function readStdin(): Promise<string> {
  if (!isStdinPiped()) {
    return '';
  }

  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data.trim());
    });

    process.stdin.on('error', (err) => {
      reject(err);
    });
  });
}
