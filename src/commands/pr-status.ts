import chalk from 'chalk';
import { createSpinner, formatPrStatus } from '../utils/ui.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';

export interface PrStatusResult {
  isReady: boolean;
  prNumber: number;
  prUrl: string;
}

export async function prStatusCommand(prNumberArg?: string): Promise<PrStatusResult | null> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  if (!github.isGhAvailable()) {
    console.error(chalk.red('GitHub CLI (gh) is not available.'));
    process.exit(1);
  }

  // Get PR
  let prNumber: number;

  if (prNumberArg) {
    prNumber = parseInt(prNumberArg, 10);
  } else {
    const pr = github.getPrForCurrentBranch();
    if (!pr) {
      console.log(chalk.yellow('No PR found for this branch.'));
      return null;
    }
    prNumber = pr.number;
  }

  const spinner = createSpinner('Checking status...').start();

  try {
    const pr = github.getPr(prNumber);
    const status = github.getPrStatus(prNumber);
    spinner.stop();

    // Parse status
    const ciPassed = status.checks.every(c => c.conclusion === 'success');
    const ciPending = status.checks.filter(c => !c.conclusion).length;
    const ciFailed = status.checks
      .filter(c => c.conclusion === 'failure')
      .map(c => c.name);

    const approvals = status.reviews
      .filter(r => r.state === 'APPROVED')
      .map(r => r.author);

    const changesRequested = status.reviews
      .filter(r => r.state === 'CHANGES_REQUESTED')
      .map(r => r.author);

    // Display
    console.log(chalk.bold(`\nPR #${pr.number}: ${pr.title}`));
    console.log(chalk.dim(pr.url));
    console.log('');

    console.log(formatPrStatus({
      ciPassed,
      ciPending,
      ciFailed,
      approvals,
      changesRequested,
    }));

    console.log('');

    // Determine readiness
    const isReady = ciPassed &&
                    ciPending === 0 &&
                    approvals.length > 0 &&
                    changesRequested.length === 0;

    if (isReady) {
      console.log(chalk.green.bold('Status: READY TO MERGE ✓'));
    } else {
      console.log(chalk.red.bold('Status: NOT READY'));
    }

    return { isReady, prNumber: pr.number, prUrl: pr.url };
  } catch (error) {
    spinner.fail('Failed to fetch PR status');
    console.error(chalk.red(error));
    return null;
  }
}
