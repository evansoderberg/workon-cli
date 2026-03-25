import chalk from 'chalk';
import { createSpinner } from '../utils/ui.js';
import { loadConfig, configExists } from '../utils/config.js';
import * as git from '../services/git.js';
import * as circleci from '../services/circleci.js';
import type { CircleCIFlakyTest, CircleCITestMetadata } from '../types.js';

export interface FlakyTestWithFailure extends CircleCIFlakyTest {
  failure_message?: string;
}

export interface CiFlakyResult {
  projectSlug: string;
  totalFlakyTests: number;
  flakyTests: CircleCIFlakyTest[];
  filteredTests: FlakyTestWithFailure[];
  filterDays: number | null;
}

function resolveToken(): string {
  let token: string | undefined;

  if (configExists()) {
    const config = loadConfig();
    token = config.circleci?.apiToken;
  }

  if (!token) {
    token = process.env.CIRCLECI_TOKEN || process.env.CIRCLE_TOKEN;
  }

  if (!token) {
    console.error(chalk.red('CircleCI API token not found.'));
    console.error(chalk.yellow('Set one of the following:'));
    console.error(chalk.yellow('  - Add circleci.apiToken to your workon config'));
    console.error(chalk.yellow('  - Set CIRCLECI_TOKEN environment variable'));
    console.error(chalk.yellow('  - Set CIRCLE_TOKEN environment variable'));
    process.exit(1);
  }

  return token;
}

/**
 * Fetch test metadata for unique job numbers in parallel, then build
 * a lookup: jobNumber -> Map<normalizedTestName, failureMessage>
 */
async function fetchFailureMessages(
  projectSlug: string,
  flakyTests: CircleCIFlakyTest[],
  token: string
): Promise<Map<number, Map<string, string>>> {
  // Collect unique job numbers
  const jobNumbers = [...new Set(flakyTests.map((t) => t.job_number))];

  // Fetch test metadata in parallel (max 10 concurrent)
  const results = new Map<number, Map<string, string>>();
  const batchSize = 10;

  for (let i = 0; i < jobNumbers.length; i += batchSize) {
    const batch = jobNumbers.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (jobNumber) => {
        const tests = await circleci.getTestMetadata(projectSlug, jobNumber, token);
        const failures = tests.filter((t) => t.result === 'failure');
        const map = new Map<string, string>();
        for (const f of failures) {
          // Index by test name -- the flaky test API uses `test_name` which
          // matches the metadata `name` field
          map.set(f.name, f.message);
          // Also index by classname + name for fallback matching
          if (f.classname) {
            map.set(`${f.classname} ${f.name}`, f.message);
          }
        }
        return { jobNumber, map };
      })
    );

    for (const r of settled) {
      if (r.status === 'fulfilled') {
        results.set(r.value.jobNumber, r.value.map);
      }
    }
  }

  return results;
}

/**
 * Look up the failure message for a flaky test from the pre-fetched metadata
 */
function lookupFailureMessage(
  test: CircleCIFlakyTest,
  failuresByJob: Map<number, Map<string, string>>
): string | undefined {
  const jobFailures = failuresByJob.get(test.job_number);
  if (!jobFailures) return undefined;

  // Try exact match on test_name
  const byName = jobFailures.get(test.test_name);
  if (byName) return byName;

  // Try classname + test_name
  if (test.classname) {
    const byClassAndName = jobFailures.get(`${test.classname} ${test.test_name}`);
    if (byClassAndName) return byClassAndName;
  }

  // Try substring match as last resort
  for (const [key, msg] of jobFailures) {
    if (test.test_name.includes(key) || key.includes(test.test_name)) {
      return msg;
    }
  }

  return undefined;
}

export async function ciFlakyCommand(options: {
  days?: string;
  job?: string;
  details?: boolean;
}): Promise<CiFlakyResult | null> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  const token = resolveToken();
  const spinner = createSpinner('Fetching flaky tests...').start();

  try {
    const result = await circleci.getFlakyTests(token);

    let filtered = result.flakyTests;
    const filterDays = options.days ? parseInt(options.days, 10) : null;

    // Filter by recency
    if (filterDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filterDays);
      filtered = filtered.filter(
        (t) => new Date(t.workflow_created_at) >= cutoff
      );
    }

    // Filter by job name
    if (options.job) {
      const jobFilter = options.job.toLowerCase();
      filtered = filtered.filter(
        (t) => t.job_name.toLowerCase().includes(jobFilter)
      );
    }

    // Sort by times_flaked descending
    filtered.sort((a, b) => b.times_flaked - a.times_flaked);

    if (filtered.length === 0) {
      spinner.stop();
      console.log(chalk.bold('\nFlaky Tests Report'));
      console.log(chalk.dim(`Project: ${result.projectSlug}`));
      console.log(chalk.dim(`Total in rolling window: ${result.totalFlakyTests}`));
      if (filterDays) console.log(chalk.dim(`Filtered to last ${filterDays} day(s)`));
      if (options.job) console.log(chalk.dim(`Filtered to job: ${options.job}`));
      console.log('');
      console.log(chalk.green('No flaky tests found matching your filters.'));
      return {
        projectSlug: result.projectSlug,
        totalFlakyTests: result.totalFlakyTests,
        flakyTests: result.flakyTests,
        filteredTests: [],
        filterDays,
      };
    }

    // Optionally fetch failure details
    let enriched: FlakyTestWithFailure[];

    if (options.details) {
      spinner.text = `Fetching failure details for ${filtered.length} flaky test(s)...`;
      const failuresByJob = await fetchFailureMessages(
        result.projectSlug,
        filtered,
        token
      );
      enriched = filtered.map((test) => ({
        ...test,
        failure_message: lookupFailureMessage(test, failuresByJob),
      }));
    } else {
      enriched = filtered.map((test) => ({ ...test }));
    }

    spinner.stop();

    // Display header
    console.log(chalk.bold('\nFlaky Tests Report'));
    console.log(chalk.dim(`Project: ${result.projectSlug}`));
    console.log(chalk.dim(`Total in rolling window: ${result.totalFlakyTests}`));
    if (filterDays) console.log(chalk.dim(`Filtered to last ${filterDays} day(s)`));
    if (options.job) console.log(chalk.dim(`Filtered to job: ${options.job}`));
    console.log(chalk.dim(`Matching: ${enriched.length} test(s)`));
    console.log('');

    // Group by job
    const byJob = new Map<string, FlakyTestWithFailure[]>();
    for (const test of enriched) {
      const existing = byJob.get(test.job_name) || [];
      existing.push(test);
      byJob.set(test.job_name, existing);
    }

    // ── Summary ──
    for (const [jobName, tests] of byJob) {
      const totalFlakes = tests.reduce((sum, t) => sum + t.times_flaked, 0);
      console.log(
        chalk.bold(`${jobName}`) +
          chalk.dim(
            ` (${tests.length} test${tests.length !== 1 ? 's' : ''}, ${totalFlakes} total flakes)`
          )
      );

      for (const test of tests) {
        const lastFlake = new Date(test.workflow_created_at);
        const ago = formatTimeAgo(lastFlake);

        console.log(
          `  ${chalk.red(`${test.times_flaked}x`)} ${test.test_name}`
        );
        const fileOrClass = test.file || test.classname;
        if (fileOrClass) {
          console.log(chalk.dim(`     ${fileOrClass}`));
        }
        console.log(chalk.dim(`     last flake: ${ago}`));
      }
      console.log('');
    }

    const topOffender = enriched[0];
    if (topOffender) {
      console.log(
        chalk.yellow.bold('Top offender: ') +
          chalk.yellow(
            `${topOffender.test_name} (${topOffender.times_flaked}x in ${topOffender.job_name})`
          )
      );
    }

    // ── Failure Details (only with --details) ──
    if (!options.details) {
      console.log('');
      console.log(chalk.dim('Run with --details to see failure messages for each test.'));
    }

    const testsWithErrors = enriched.filter((t) => t.failure_message);
    if (options.details && testsWithErrors.length > 0) {
      console.log('');
      console.log(chalk.red.bold('─── Failure Details ───'));

      for (let i = 0; i < testsWithErrors.length; i++) {
        const test = testsWithErrors[i];
        console.log('');
        console.log(
          chalk.bold(`${i + 1}. `) +
            chalk.red(`[${test.times_flaked}x] `) +
            test.test_name
        );
        const fileOrClass = test.file || test.classname;
        if (fileOrClass) {
          console.log(chalk.dim(`   ${fileOrClass}`));
        }

        const lines = test.failure_message!.split('\n').filter((l) => l.trim());
        const preview = lines.slice(0, 15);
        for (const line of preview) {
          console.log(chalk.dim(`   ${line}`));
        }
        if (lines.length > 15) {
          console.log(chalk.dim(`   ... (${lines.length - 15} more lines)`));
        }
      }

      const missing = enriched.length - testsWithErrors.length;
      if (missing > 0) {
        console.log('');
        console.log(
          chalk.dim(
            `(${missing} test(s) had no failure data — may have passed in the latest run)`
          )
        );
      }
    }

    return {
      projectSlug: result.projectSlug,
      totalFlakyTests: result.totalFlakyTests,
      flakyTests: result.flakyTests,
      filteredTests: enriched,
      filterDays,
    };
  } catch (error) {
    spinner.fail('Failed to fetch flaky tests');
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red(String(error)));
    }
    return null;
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
