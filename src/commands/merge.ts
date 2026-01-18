import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { createSpinner, showSuccess, showWarning } from '../utils/ui.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';
import { prStatusCommand } from './pr-status.js';

export async function mergeCommand(prNumberArg?: string): Promise<void> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  // Get status first
  const status = await prStatusCommand(prNumberArg);

  if (!status) {
    return;
  }

  console.log('');

  if (status.isReady) {
    const shouldMerge = await confirm({
      message: 'Post /merge comment?',
      default: true,
    });

    if (shouldMerge) {
      const spinner = createSpinner('Posting /merge comment...').start();

      try {
        github.commentOnPr(status.prNumber, '/merge');
        spinner.stop();

        showSuccess('Posted /merge comment');
        console.log(chalk.dim('  Merge automation will process shortly.'));
      } catch (error) {
        spinner.fail('Failed to post comment');
        console.error(chalk.red(error));
      }
    }
  } else {
    showWarning('PR is not ready to merge.');

    const forceAnyway = await confirm({
      message: chalk.yellow('Post /merge anyway? (not recommended)'),
      default: false,
    });

    if (forceAnyway) {
      const spinner = createSpinner('Posting /merge comment...').start();

      try {
        github.commentOnPr(status.prNumber, '/merge');
        spinner.stop();

        showWarning('Posted /merge comment (forced)');
        console.log(chalk.dim('  The merge may fail if requirements are not met.'));
      } catch (error) {
        spinner.fail('Failed to post comment');
        console.error(chalk.red(error));
      }
    }
  }
}
