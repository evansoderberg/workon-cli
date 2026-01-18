import chalk from 'chalk';
import { createSpinner, showSuccess } from '../utils/ui.js';
import { readStdin, isStdinPiped } from '../utils/stdin.js';
import { updatePrSections, type PrSections } from '../utils/template.js';
import * as github from '../services/github.js';
import * as git from '../services/git.js';

export interface PrUpdateOptions {
  title?: string;
  summary?: string;
  ticket?: string;
  description?: string;
  testing?: string;
}

export async function prUpdateCommand(
  prNumberArg?: string,
  options: PrUpdateOptions = {}
): Promise<void> {
  // Verify gh CLI is available
  if (!github.isGhAvailable()) {
    console.error(chalk.red('GitHub CLI (gh) is not installed or not authenticated.'));
    console.error(chalk.yellow('Run: gh auth login'));
    process.exit(1);
  }

  // Determine PR number
  let prNumber: number;

  if (prNumberArg) {
    prNumber = parseInt(prNumberArg, 10);
    if (isNaN(prNumber)) {
      console.error(chalk.red(`Invalid PR number: ${prNumberArg}`));
      process.exit(1);
    }
  } else {
    // Try to get PR from current branch
    const pr = github.getPrForCurrentBranch();
    if (!pr) {
      console.error(chalk.red('No PR found for current branch.'));
      console.error(chalk.yellow('Either specify a PR number or push your branch first.'));
      process.exit(1);
    }
    prNumber = pr.number;
    console.log(chalk.dim(`Using PR #${prNumber} from current branch`));
  }

  // Check if any field uses stdin ("-")
  const stdinFields: string[] = [];
  if (options.summary === '-') stdinFields.push('summary');
  if (options.description === '-') stdinFields.push('description');
  if (options.testing === '-') stdinFields.push('testing');

  // Read stdin if needed
  let stdinContent = '';
  if (stdinFields.length > 0) {
    if (!isStdinPiped()) {
      console.error(chalk.red(`Stdin ("-") specified for ${stdinFields.join(', ')} but no input piped.`));
      process.exit(1);
    }

    if (stdinFields.length > 1) {
      console.error(chalk.red('Only one field can use stdin ("-") at a time.'));
      process.exit(1);
    }

    stdinContent = await readStdin();
    if (!stdinContent) {
      console.error(chalk.red('No content received from stdin.'));
      process.exit(1);
    }
  }

  // Build updates object
  const updates: PrSections = {};

  if (options.summary) {
    updates.summary = options.summary === '-' ? stdinContent : options.summary;
  }
  if (options.ticket) {
    updates.ticket = options.ticket;
  }
  if (options.description) {
    updates.description = options.description === '-' ? stdinContent : options.description;
  }
  if (options.testing) {
    updates.testing = options.testing === '-' ? stdinContent : options.testing;
  }

  // Check if there's anything to update
  const hasBodyUpdates = Object.keys(updates).length > 0;
  const hasTitleUpdate = !!options.title;

  if (!hasBodyUpdates && !hasTitleUpdate) {
    console.error(chalk.red('No updates specified.'));
    console.error(chalk.yellow('Use --title, --summary, --ticket, --description, or --testing'));
    process.exit(1);
  }

  const spinner = createSpinner('Updating PR...').start();

  try {
    // If we have body updates, fetch current body and update sections
    let newBody: string | undefined;
    if (hasBodyUpdates) {
      const currentBody = github.getPrBody(prNumber);
      newBody = updatePrSections(currentBody, updates);
    }

    // Update the PR
    github.updatePr(prNumber, {
      title: options.title,
      body: newBody,
    });

    spinner.succeed('PR updated');

    // Show what was updated
    const updatedFields: string[] = [];
    if (options.title) updatedFields.push('title');
    if (updates.summary) updatedFields.push('summary');
    if (updates.ticket) updatedFields.push('ticket');
    if (updates.description) updatedFields.push('description');
    if (updates.testing) updatedFields.push('testing');

    console.log(chalk.dim(`Updated: ${updatedFields.join(', ')}`));
  } catch (error) {
    spinner.fail('Failed to update PR');
    console.error(chalk.red(error));
    process.exit(1);
  }
}
