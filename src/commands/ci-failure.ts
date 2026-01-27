import chalk from 'chalk';
import { createSpinner } from '../utils/ui.js';
import { loadConfig, configExists } from '../utils/config.js';
import * as git from '../services/git.js';
import * as circleci from '../services/circleci.js';

export interface CiFailureResult {
  jobName: string;
  output: string;
}

export async function ciFailureCommand(
  jobNumberArg?: string,
  branchArg?: string
): Promise<CiFailureResult | null> {
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  // Check for CircleCI token
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
    process.exit(1);
  }

  const projectSlug = circleci.getProjectSlug();
  if (!projectSlug) {
    console.error(chalk.red('Could not determine project from git remote.'));
    process.exit(1);
  }

  let jobNumber: number | undefined;

  // If job number provided, use it directly
  if (jobNumberArg) {
    jobNumber = parseInt(jobNumberArg, 10);
  } else {
    // Otherwise, find the first failed job for the branch
    const branch = branchArg || git.currentBranch();
    const spinner = createSpinner(`Finding failed jobs for ${chalk.cyan(branch)}...`).start();

    try {
      const status = await circleci.getCIStatusForBranch(branch, token);
      spinner.stop();

      if (!status) {
        console.log(chalk.yellow(`No CI pipelines found for branch: ${branch}`));
        return null;
      }

      if (status.failedJobs.length === 0) {
        console.log(chalk.green('No failed jobs found.'));
        return null;
      }

      // Use the first failed job
      const failedJob = status.failedJobs[0];
      jobNumber = failedJob.jobNumber;
      console.log(chalk.dim(`Found failed job: ${failedJob.workflowName} > ${failedJob.name}`));
    } catch (error) {
      spinner.fail('Failed to fetch CI status');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  if (!jobNumber) {
    console.error(chalk.red('No job number specified and no failed jobs found.'));
    return null;
  }

  const spinner = createSpinner(`Fetching failure details for job #${jobNumber}...`).start();

  try {
    const failedSteps = await circleci.getBuildDetails(projectSlug, jobNumber, token);
    spinner.stop();

    if (failedSteps.length === 0) {
      console.log(chalk.yellow('No failed steps found for this job.'));
      return null;
    }

    // Output all failed steps with full output
    let fullOutput = '';

    for (const step of failedSteps) {
      console.log(chalk.red.bold(`\n═══ Failed Step: ${step.name} ═══\n`));

      for (const action of step.actions) {
        if (action.output) {
          console.log(action.output);
          fullOutput += action.output;
        } else {
          console.log(chalk.dim(`Exit code: ${action.exitCode}`));
        }
      }
    }

    return {
      jobName: `Job #${jobNumber}`,
      output: fullOutput,
    };
  } catch (error) {
    spinner.fail('Failed to fetch failure details');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    return null;
  }
}
