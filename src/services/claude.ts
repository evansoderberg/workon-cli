import { spawnSync } from 'child_process';

/**
 * Check if Claude CLI is available
 */
export function isClaudeAvailable(): boolean {
  try {
    const result = spawnSync('which', ['claude'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Generate text using Claude CLI in print mode
 * Returns the generated text directly
 */
export async function generate(prompt: string): Promise<string> {
  try {
    const result = spawnSync('claude', ['--print', prompt], {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || 'claude command failed');
    }

    return result.stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Claude generation failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Generate text with additional context piped in
 */
export async function generateWithContext(prompt: string, context: string): Promise<string> {
  try {
    const result = spawnSync('claude', ['--print', prompt], {
      encoding: 'utf-8',
      timeout: 90000,
      maxBuffer: 2 * 1024 * 1024,
      input: context,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || 'claude command failed');
    }

    return result.stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Claude generation failed: ${error.message}`);
    }
    throw error;
  }
}
