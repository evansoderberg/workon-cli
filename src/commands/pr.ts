import { select, input } from '@inquirer/prompts';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { extractTicketIdFromBranch } from '../utils/branch.js';
import { createSpinner } from '../utils/ui.js';
import { createClickUpClient } from '../services/clickup.js';
import { readStdin, isStdinPiped } from '../utils/stdin.js';
import { updatePrSections, type PrSections } from '../utils/template.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';

export interface PrCommandOptions {
  draft?: boolean;
  title?: string;
  summary?: string;
  ticket?: string;
  description?: string;
  testing?: string;
}

export async function prCommand(options: PrCommandOptions = {}): Promise<void> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  if (!github.isGhAvailable()) {
    console.error(chalk.red('GitHub CLI (gh) is not available or not authenticated.'));
    console.error(chalk.yellow('Run: gh auth login'));
    process.exit(1);
  }

  const config = loadConfig();
  const branch = git.currentBranch();

  // Safety check: never create PR from main or master
  if (branch === 'main' || branch === 'master') {
    console.error(chalk.red(`Safety check: cannot create PR from ${branch} branch.`));
    console.error(chalk.yellow('Create a feature branch first.'));
    process.exit(1);
  }

  // Check for existing PR
  const existingPr = github.getPrForCurrentBranch();
  if (existingPr) {
    // In non-interactive mode with section options, update the existing PR instead
    if (hasNonInteractiveOptions(options)) {
      const { prUpdateCommand } = await import('./pr-update.js');
      await prUpdateCommand(String(existingPr.number), {
        title: options.title,
        summary: options.summary,
        ticket: options.ticket,
        description: options.description,
        testing: options.testing,
      });
      return;
    }

    console.log(chalk.blue(`PR already exists: ${existingPr.url}`));

    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'View status', value: 'status' },
        { name: 'Open in browser', value: 'open' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'status') {
      const { prStatusCommand } = await import('./pr-status.js');
      await prStatusCommand(String(existingPr.number));
    } else if (action === 'open') {
      const { execSync } = await import('child_process');
      execSync(`open "${existingPr.url}"`, { stdio: 'inherit' });
    }
    return;
  }

  // Check for non-interactive mode (any options provided)
  if (hasNonInteractiveOptions(options)) {
    await createPrNonInteractive(options, config, branch);
    return;
  }

  // Interactive mode - prompt for content
  await createPrInteractive(options, config, branch);
}

/**
 * Interactive PR creation - prompts user for content
 */
async function createPrInteractive(
  options: PrCommandOptions,
  config: ReturnType<typeof loadConfig>,
  branch: string
): Promise<void> {
  // Push branch
  const spinner = createSpinner('Pushing branch...').start();
  try {
    github.pushBranch();
    spinner.succeed('Branch pushed');
  } catch (error) {
    spinner.fail('Failed to push branch');
    console.error(chalk.red(error));
    return;
  }

  // Extract ticket ID and fetch details
  const ticketId = extractTicketIdFromBranch(branch);
  let ticket = null;

  if (ticketId) {
    const clickup = createClickUpClient(config.clickup.apiToken, config.clickup.workspaceId);
    const spinner2 = createSpinner('Fetching ticket details...').start();

    try {
      ticket = await clickup.getTask(ticketId);
      spinner2.succeed(`Ticket: ${ticket.name}`);
    } catch {
      spinner2.warn('Could not fetch ticket details');
    }
  }

  // Read PR template
  const repoRoot = git.repoRoot();
  const templatePath = join(repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md');
  let template: string | null = null;

  if (existsSync(templatePath)) {
    template = readFileSync(templatePath, 'utf-8');
    console.log(chalk.dim('Found PR template'));
  }

  // Prompt for PR content
  const prTitle = await input({
    message: 'PR title:',
    default: ticket?.name || '',
  });

  const summary = await input({
    message: 'Summary (what and why):',
  });

  const description = await input({
    message: 'Description (details):',
  });

  const testing = await input({
    message: 'How to test:',
  });

  // Build PR body
  let prBody: string;

  if (template) {
    prBody = updatePrSections(template, {
      summary,
      ticket: ticketId || undefined,
      description,
      testing,
    });
  } else {
    prBody = `## Summary

${summary}
${ticket ? `\nCloses: ${ticket.url}` : ''}

## Description

${description}

## How to Test

${testing}
`;
  }

  // Preview and confirm
  console.log(chalk.bold('\n━━━ PR Preview ━━━\n'));
  console.log(chalk.yellow(`Title: ${prTitle}\n`));
  console.log(prBody);
  console.log(chalk.bold('\n━━━━━━━━━━━━━━━━━━\n'));

  const action = await select({
    message: 'Action:',
    choices: [
      { name: 'Create PR', value: 'create' },
      { name: 'Create as draft', value: 'draft' },
      { name: 'Cancel', value: 'cancel' },
    ],
  });

  if (action === 'cancel') return;

  // Create PR
  const spinner5 = createSpinner('Creating PR...').start();

  try {
    const pr = github.createPr({
      title: prTitle,
      body: prBody,
      draft: action === 'draft' || options.draft,
      base: config.git.baseBranch,
    });

    spinner5.succeed(`Created PR #${pr.number}`);
    console.log(`\n  ${chalk.blue(pr.url)}`);
  } catch (error) {
    spinner5.fail('Failed to create PR');
    console.error(chalk.red(error));
  }
}

/**
 * Check if non-interactive options are provided
 */
function hasNonInteractiveOptions(options: PrCommandOptions): boolean {
  return !!(
    options.title ||
    options.summary ||
    options.ticket ||
    options.description ||
    options.testing
  );
}

/**
 * Create PR in non-interactive mode with section-based options
 */
async function createPrNonInteractive(
  options: PrCommandOptions,
  config: ReturnType<typeof loadConfig>,
  branch: string
): Promise<void> {
  // Handle stdin for any field that uses "-"
  const stdinFields: string[] = [];
  if (options.summary === '-') stdinFields.push('summary');
  if (options.description === '-') stdinFields.push('description');
  if (options.testing === '-') stdinFields.push('testing');

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

  // Push branch first
  const pushSpinner = createSpinner('Pushing branch...').start();
  try {
    github.pushBranch();
    pushSpinner.succeed('Branch pushed');
  } catch (error) {
    pushSpinner.fail('Failed to push branch');
    console.error(chalk.red(error));
    process.exit(1);
  }

  // Read PR template
  const repoRoot = git.repoRoot();
  const templatePath = join(repoRoot, '.github', 'PULL_REQUEST_TEMPLATE.md');
  let prBody: string;

  if (existsSync(templatePath)) {
    prBody = readFileSync(templatePath, 'utf-8');
  } else {
    // Use a minimal default template
    prBody = `## Summary

#### Ticket: CU-

### Description

### How to Test

## Best Practices
`;
  }

  // Build section updates
  const updates: PrSections = {};

  if (options.summary) {
    updates.summary = options.summary === '-' ? stdinContent : options.summary;
  }
  if (options.ticket) {
    updates.ticket = options.ticket;
  } else {
    // Try to extract from branch name
    const ticketId = extractTicketIdFromBranch(branch);
    if (ticketId) {
      updates.ticket = ticketId;
    }
  }
  if (options.description) {
    updates.description = options.description === '-' ? stdinContent : options.description;
  }
  if (options.testing) {
    updates.testing = options.testing === '-' ? stdinContent : options.testing;
  }

  // Apply updates to template
  prBody = updatePrSections(prBody, updates);

  // Determine title
  let prTitle = options.title || '';
  if (!prTitle) {
    // Try to get title from ticket
    const ticketId = updates.ticket || extractTicketIdFromBranch(branch);
    if (ticketId) {
      const clickup = createClickUpClient(config.clickup.apiToken, config.clickup.workspaceId);
      try {
        const ticket = await clickup.getTask(ticketId);
        prTitle = ticket.name;
      } catch {
        // Use branch name as fallback
        prTitle = branch.replace(/^[^/]+\/[^-]+-/, '').replace(/-/g, ' ');
      }
    } else {
      prTitle = branch.replace(/^[^/]+\//, '').replace(/-/g, ' ');
    }
  }

  // Create the PR
  const createSpinnerInstance = createSpinner('Creating PR...').start();

  try {
    const pr = github.createPr({
      title: prTitle,
      body: prBody,
      draft: options.draft,
      base: config.git.baseBranch,
    });

    createSpinnerInstance.succeed(`Created PR #${pr.number}`);
    console.log(`\n  ${chalk.blue(pr.url)}`);
  } catch (error) {
    createSpinnerInstance.fail('Failed to create PR');
    console.error(chalk.red(error));
    process.exit(1);
  }
}
