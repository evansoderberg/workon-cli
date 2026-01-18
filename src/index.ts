import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { prCommand, type PrCommandOptions } from './commands/pr.js';
import { prStatusCommand } from './commands/pr-status.js';
import { mergeCommand } from './commands/merge.js';
import { initCommand } from './commands/init.js';
import { prUpdateCommand, type PrUpdateOptions } from './commands/pr-update.js';
import { ticketCommand } from './commands/ticket.js';
import { withGracefulExit } from './utils/exit.js';
import { setDryRun } from './utils/dry-run.js';

const program = new Command();

program
  .name('workon')
  .description('Development CLI for ClickUp + GitHub')
  .version('1.0.0');

program
  .command('start')
  .description('Start work on a ticket (existing or new)')
  .argument('[ticket-id]', 'Optional ticket ID to start from')
  .option('--dry-run', 'Show what would be done without executing')
  .action(withGracefulExit((ticketId: string | undefined, opts: { dryRun?: boolean }) => {
    if (opts.dryRun) setDryRun(true);
    return startCommand(ticketId);
  }));

program
  .command('pr')
  .description('Create a pull request')
  .option('--draft', 'Create as draft PR')
  .option('--title <title>', 'PR title')
  .option('--summary <text>', 'Summary section, use "-" for stdin')
  .option('--ticket <id>', 'ClickUp ticket ID')
  .option('--description <text>', 'Description section, use "-" for stdin')
  .option('--testing <text>', 'Testing section, use "-" for stdin')
  .option('--base <branch>', 'Base branch for PR (auto-detected if not specified)')
  .option('--dry-run', 'Show what would be done without executing')
  .action(withGracefulExit((options: PrCommandOptions & { dryRun?: boolean }) => {
    if (options.dryRun) setDryRun(true);
    return prCommand(options);
  }));

program
  .command('pr-update')
  .description('Update an existing PR')
  .argument('[pr-number]', 'PR number (defaults to current branch)')
  .option('--title <title>', 'Update PR title')
  .option('--summary <text>', 'Update summary section, use "-" for stdin')
  .option('--ticket <id>', 'Update ticket link')
  .option('--description <text>', 'Update description section, use "-" for stdin')
  .option('--testing <text>', 'Update testing section, use "-" for stdin')
  .option('--dry-run', 'Show what would be done without executing')
  .action(withGracefulExit((prNumber: string | undefined, options: PrUpdateOptions & { dryRun?: boolean }) => {
    if (options.dryRun) setDryRun(true);
    return prUpdateCommand(prNumber, options);
  }));

program
  .command('pr-status')
  .description('Check PR status (CI, approvals)')
  .argument('[pr-number]', 'PR number (defaults to current branch)')
  .action(withGracefulExit(async (prNumber?: string) => {
    await prStatusCommand(prNumber);
  }));

program
  .command('merge')
  .description('Post /merge comment to trigger merge automation')
  .argument('[pr-number]', 'PR number (defaults to current branch)')
  .option('--dry-run', 'Show what would be done without executing')
  .action(withGracefulExit((prNumber: string | undefined, opts: { dryRun?: boolean }) => {
    if (opts.dryRun) setDryRun(true);
    return mergeCommand(prNumber);
  }));

program
  .command('init')
  .description('Initialize configuration file')
  .action(withGracefulExit(initCommand));

program
  .command('ticket')
  .description('Get ticket info from ClickUp (for current branch or specified ticket)')
  .argument('[ticket-id]', 'Ticket ID (defaults to extracting from current branch)')
  .action(withGracefulExit(ticketCommand));

// Default command: treat argument as ticket ID (shortcut for `workon start <id>`)
program
  .argument('[ticket-id]', 'Ticket ID (shortcut for `workon start <id>`)')
  .option('--dry-run', 'Show what would be done without executing')
  .action(withGracefulExit(async (ticketId: string | undefined, opts: { dryRun?: boolean }) => {
    if (ticketId) {
      if (opts.dryRun) setDryRun(true);
      await startCommand(ticketId);
    }
  }));

program.parse();
