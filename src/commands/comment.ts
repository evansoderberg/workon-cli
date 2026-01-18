import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { createClickUpClient } from '../services/clickup.js';
import * as git from '../services/git.js';
import { createSpinner, showSuccess } from '../utils/ui.js';
import { isStdinPiped, readStdin } from '../utils/stdin.js';

/**
 * Extract ticket ID from branch name
 * Expected format: username/{ticketid}/description
 */
function extractTicketIdFromBranch(branch: string): string | null {
  const parts = branch.split('/');
  if (parts.length >= 2) {
    return parts[1];
  }
  return null;
}

export async function commentCommand(commentArg?: string): Promise<void> {
  const config = loadConfig();
  const clickup = createClickUpClient(config.clickup.apiToken, config.clickup.workspaceId);

  // Get ticket ID from current branch
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  const branch = git.currentBranch();
  const ticketId = extractTicketIdFromBranch(branch);

  if (!ticketId) {
    console.error(chalk.red('Could not extract ticket ID from branch name.'));
    console.error(chalk.yellow(`Expected format: ${config.git.branchPrefix}/{ticketid}/description`));
    process.exit(1);
  }

  // Get comment text from argument or stdin
  let comment = commentArg;

  if (!comment && isStdinPiped()) {
    comment = await readStdin();
  }

  if (!comment) {
    console.error(chalk.red('No comment provided.'));
    console.error(chalk.yellow('Usage: workon comment "Your comment here"'));
    console.error(chalk.yellow('   or: echo "Your comment" | workon comment'));
    process.exit(1);
  }

  const spinner = createSpinner('Posting comment...').start();

  try {
    await clickup.commentOnTask(ticketId, comment);
    spinner.succeed('Comment posted');
    showSuccess(`Added comment to ticket ${ticketId}`);
  } catch (error) {
    spinner.fail('Failed to post comment');
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}
