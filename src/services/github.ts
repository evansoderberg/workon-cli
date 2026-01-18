import { spawnSync } from 'child_process';
import type { GitHubPr, GitHubPrStatus } from '../types.js';
import { isDryRun, dryRunLog } from '../utils/dry-run.js';

/**
 * Execute a gh CLI command safely with array arguments and return parsed JSON
 */
function ghSpawn<T>(args: string[]): T {
  const result = spawnSync('gh', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh ${args[0]} failed`);
  }
  return JSON.parse(result.stdout);
}

/**
 * Execute a gh CLI command safely with array arguments without parsing
 */
function ghSpawnRaw(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `gh ${args[0]} failed`);
  }
  return result.stdout.trim();
}

/**
 * Check if gh CLI is available and authenticated
 */
export function isGhAvailable(): boolean {
  try {
    const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Get PR for the current branch
 */
export function getPrForCurrentBranch(): GitHubPr | null {
  try {
    return ghSpawn<GitHubPr>(['pr', 'view', '--json', 'number,title,url,state,body']);
  } catch {
    return null;
  }
}

/**
 * Get PR by number
 */
export function getPr(prNumber: number): GitHubPr {
  return ghSpawn<GitHubPr>(['pr', 'view', String(prNumber), '--json', 'number,title,url,state,body']);
}

/**
 * Get detailed PR status including CI and reviews
 */
export function getPrStatus(prNumber: number): GitHubPrStatus {
  const data = ghSpawn<{
    reviewDecision: string | null;
    reviews: Array<{ author: { login: string }; state: string }>;
    statusCheckRollup: Array<{
      name: string;
      status: string;
      conclusion: string | null;
    }> | null;
  }>(['pr', 'view', String(prNumber), '--json', 'reviewDecision,reviews,statusCheckRollup']);

  return {
    reviewDecision: data.reviewDecision,
    reviews: (data.reviews || []).map(r => ({
      author: r.author.login,
      state: r.state,
    })),
    checks: (data.statusCheckRollup || []).map(c => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
    })),
  };
}

/**
 * Create a new PR
 */
export function createPr(options: {
  title: string;
  body: string;
  draft?: boolean;
  base?: string;
}): GitHubPr {
  if (isDryRun()) {
    dryRunLog('github', 'Would create PR', {
      title: options.title,
      body: options.body,
      draft: options.draft,
      base: options.base,
    });
    return { number: 0, title: options.title, url: 'https://github.com/example/repo/pull/0 (dry-run)', state: 'open' };
  }

  const args = ['pr', 'create', '--title', options.title, '--body', options.body];

  if (options.draft) args.push('--draft');
  if (options.base) args.push('--base', options.base);

  const url = ghSpawnRaw(args);

  // Extract PR number from URL
  const match = url.match(/\/pull\/(\d+)/);
  const number = match ? parseInt(match[1], 10) : 0;

  return { number, title: options.title, url, state: 'open' };
}

/**
 * Comment on a PR
 */
export function commentOnPr(prNumber: number, body: string): void {
  if (isDryRun()) {
    dryRunLog('github', `Would comment on PR #${prNumber}`, { body });
    return;
  }
  ghSpawnRaw(['pr', 'comment', String(prNumber), '--body', body]);
}

/**
 * Get PR body content
 */
export function getPrBody(prNumber: number): string {
  const pr = ghSpawn<{ body: string }>(['pr', 'view', String(prNumber), '--json', 'body']);
  return pr.body || '';
}

/**
 * Update a PR's title and/or body
 */
export function updatePr(
  prNumber: number,
  options: { title?: string; body?: string }
): void {
  if (isDryRun()) {
    dryRunLog('github', `Would update PR #${prNumber}`, {
      title: options.title,
      body: options.body,
    });
    return;
  }

  const args = ['pr', 'edit', String(prNumber)];

  if (options.title) {
    args.push('--title', options.title);
  }

  if (options.body) {
    args.push('--body', options.body);
  }

  ghSpawnRaw(args);
}

/**
 * Push current branch to origin
 */
export function pushBranch(): void {
  // Safety check: never push main or master
  const branchResult = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf-8' });
  const currentBranch = branchResult.stdout.trim();

  if (currentBranch === 'main' || currentBranch === 'master') {
    throw new Error(`Safety check: refusing to push ${currentBranch} branch`);
  }

  if (isDryRun()) {
    dryRunLog('github', 'Would push current branch to origin');
    return;
  }
  const result = spawnSync('git', ['push', '-u', 'origin', 'HEAD'], { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git push failed');
  }
}
