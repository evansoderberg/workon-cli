import chalk from 'chalk';
import { createSpinner } from '../utils/ui.js';
import { loadConfig, configExists } from '../utils/config.js';
import * as git from '../services/git.js';
import * as circleci from '../services/circleci.js';
import type { CIStatus, FailedJob } from '../services/circleci.js';

export interface CiStatusResult {
  status: CIStatus;
  passed: boolean;
  running: boolean;
}

function formatJobStatus(status: string): string {
  switch (status) {
    case 'success':
      return chalk.green('✓ passed');
    case 'failed':
      return chalk.red('✗ failed');
    case 'running':
      return chalk.blue('◔ running');
    case 'queued':
    case 'not_run':
      return chalk.gray('○ pending');
    case 'canceled':
      return chalk.yellow('⊘ canceled');
    default:
      return chalk.gray(status);
  }
}

function formatWorkflowStatus(status: string): string {
  switch (status) {
    case 'success':
      return chalk.green.bold('PASSED');
    case 'failed':
      return chalk.red.bold('FAILED');
    case 'running':
      return chalk.blue.bold('RUNNING');
    case 'canceled':
      return chalk.yellow.bold('CANCELED');
    default:
      return chalk.gray.bold(status.toUpperCase());
  }
}

function formatFailedJob(job: FailedJob): string {
  const lines: string[] = [];

  lines.push(chalk.red(`\n  ${job.workflowName} > ${job.name}`));
  lines.push(chalk.dim(`  ${job.webUrl}`));

  if (job.failedTests.length > 0) {
    lines.push(chalk.red(`\n  Failed tests (${job.failedTests.length}):`));
    for (const test of job.failedTests.slice(0, 5)) {
      const testName = test.classname ? `${test.classname} > ${test.name}` : test.name;
      lines.push(chalk.red(`\n    ${testName}`));
      if (test.file) {
        lines.push(chalk.dim(`    File: ${test.file}`));
      }
      if (test.message) {
        // Show full error message, indented
        lines.push(chalk.yellow('    Error:'));
        const messageLines = test.message.split('\n').slice(0, 20);
        for (const line of messageLines) {
          lines.push(chalk.dim(`      ${line}`));
        }
        if (test.message.split('\n').length > 20) {
          lines.push(chalk.dim('      ... (truncated)'));
        }
      }
    }
    if (job.failedTests.length > 5) {
      lines.push(chalk.dim(`\n    ... and ${job.failedTests.length - 5} more failed tests`));
    }
  }

  // Always show how to get more details
  lines.push(chalk.dim(`\n  Run ${chalk.cyan(`workon ci-failure ${job.jobNumber}`)} for full output`));

  return lines.join('\n');
}

export async function ciStatusCommand(branchArg?: string): Promise<CiStatusResult | null> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  // Check for CircleCI token
  let token: string | undefined;

  // First try config
  if (configExists()) {
    const config = loadConfig();
    token = config.circleci?.apiToken;
  }

  // Fall back to environment variable
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

  const branch = branchArg || git.currentBranch();
  const projectSlug = circleci.getProjectSlug();

  if (!projectSlug) {
    console.error(chalk.red('Could not determine project from git remote.'));
    console.error(chalk.yellow('Make sure you have a GitHub remote configured.'));
    process.exit(1);
  }

  const spinner = createSpinner(`Checking CI status for ${chalk.cyan(branch)}...`).start();

  try {
    const status = await circleci.getCIStatusForBranch(branch, token);

    if (!status) {
      spinner.stop();
      console.log(chalk.yellow(`\nNo CI pipelines found for branch: ${branch}`));
      console.log(chalk.dim('This branch may not have been pushed or CircleCI may not be configured.'));
      return null;
    }

    spinner.stop();

    // Display header
    console.log(chalk.bold(`\nCI Status: ${branch}`));
    console.log(chalk.dim(`Project: ${status.projectSlug}`));
    console.log(chalk.dim(`Pipeline #${status.pipelineNumber}`));
    console.log('');

    // Aggregate job counts across all workflows
    let totalRunningJobs = 0;
    let totalPendingJobs = 0;
    let totalFailedJobs = 0;
    let totalSuccessJobs = 0;
    let anyWorkflowRunning = false;

    // Display each workflow and its jobs
    for (const workflow of status.workflows) {
      const workflowRunning = workflow.jobs.filter(j => j.status === 'running').length;
      const workflowPending = workflow.jobs.filter(j => j.status === 'queued' || j.status === 'not_run').length;
      const workflowFailed = workflow.jobs.filter(j => j.status === 'failed').length;
      const workflowSuccess = workflow.jobs.filter(j => j.status === 'success').length;

      totalRunningJobs += workflowRunning;
      totalPendingJobs += workflowPending;
      totalFailedJobs += workflowFailed;
      totalSuccessJobs += workflowSuccess;

      if (workflow.status === 'running' || workflowRunning > 0 || workflowPending > 0) {
        anyWorkflowRunning = true;
      }

      console.log(chalk.bold(`${workflow.name}: ${formatWorkflowStatus(workflow.status)}`));
      for (const job of workflow.jobs) {
        console.log(`  ${formatJobStatus(job.status)} ${job.name}`);
      }
      console.log('');
    }

    // Display failed job details
    if (status.failedJobs.length > 0) {
      console.log(chalk.red.bold('─── Failed Jobs ───'));
      for (const job of status.failedJobs) {
        console.log(formatFailedJob(job));
      }
      console.log('');
    }

    // Determine overall status
    const running = anyWorkflowRunning || totalRunningJobs > 0 || totalPendingJobs > 0;
    const passed = !running && totalFailedJobs === 0 && status.workflows.every(w => w.status === 'success');

    if (running) {
      const inProgressCount = totalRunningJobs + totalPendingJobs;
      console.log(chalk.blue.bold(`CI is still running... (${inProgressCount} job${inProgressCount !== 1 ? 's' : ''} pending)`));
    } else if (passed) {
      console.log(chalk.green.bold('All CI checks passed!'));
    } else if (totalFailedJobs > 0) {
      console.log(chalk.red.bold(`${totalFailedJobs} job(s) failed.`));
    } else {
      const statuses = [...new Set(status.workflows.map(w => w.status))].join(', ');
      console.log(chalk.yellow.bold(`CI status: ${statuses}`));
    }

    return { status, passed, running };
  } catch (error) {
    spinner.fail('Failed to fetch CI status');
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(chalk.red(String(error)));
    }
    return null;
  }
}
