import { spawnSync } from 'child_process';
import type {
  CircleCIPipeline,
  CircleCIWorkflow,
  CircleCIJob,
  CircleCIJobDetail,
  CircleCITestMetadata,
  CircleCIFlakyTest,
} from '../types.js';

const CIRCLECI_API = 'https://circleci.com/api/v2';
const CIRCLECI_API_V1 = 'https://circleci.com/api/v1.1';

interface PaginatedResponse<T> {
  items: T[];
  next_page_token: string | null;
}

/**
 * Make a request to the CircleCI API
 */
async function circleciRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${CIRCLECI_API}${path}`, {
    headers: {
      'Circle-Token': token,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CircleCI API error (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Get project slug from git remote (e.g., "gh/org/repo")
 */
export function getProjectSlug(): string | null {
  try {
    const result = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' });
    if (result.status !== 0) return null;

    const url = result.stdout.trim();

    // Handle SSH format: git@github.com:org/repo.git
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^.]+)/);
    if (sshMatch) {
      return `gh/${sshMatch[1]}/${sshMatch[2]}`;
    }

    // Handle HTTPS format: https://github.com/org/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+)\/([^.]+)/);
    if (httpsMatch) {
      return `gh/${httpsMatch[1]}/${httpsMatch[2]}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get pipelines for a specific branch
 */
export async function getPipelinesForBranch(
  projectSlug: string,
  branch: string,
  token: string
): Promise<CircleCIPipeline[]> {
  const response = await circleciRequest<PaginatedResponse<CircleCIPipeline>>(
    `/project/${projectSlug}/pipeline?branch=${encodeURIComponent(branch)}`,
    token
  );
  return response.items;
}

/**
 * Get workflows for a pipeline
 */
export async function getWorkflows(
  pipelineId: string,
  token: string
): Promise<CircleCIWorkflow[]> {
  const response = await circleciRequest<PaginatedResponse<CircleCIWorkflow>>(
    `/pipeline/${pipelineId}/workflow`,
    token
  );
  return response.items;
}

/**
 * Get jobs for a workflow
 */
export async function getJobs(
  workflowId: string,
  token: string
): Promise<CircleCIJob[]> {
  const response = await circleciRequest<PaginatedResponse<CircleCIJob>>(
    `/workflow/${workflowId}/job`,
    token
  );
  return response.items;
}

/**
 * Get job details including web URL
 */
export async function getJobDetails(
  projectSlug: string,
  jobNumber: number,
  token: string
): Promise<CircleCIJobDetail> {
  return circleciRequest<CircleCIJobDetail>(
    `/project/${projectSlug}/job/${jobNumber}`,
    token
  );
}

/**
 * Get test metadata for a job (failed tests, etc.)
 */
export async function getTestMetadata(
  projectSlug: string,
  jobNumber: number,
  token: string
): Promise<CircleCITestMetadata[]> {
  const response = await circleciRequest<PaginatedResponse<CircleCITestMetadata>>(
    `/project/${projectSlug}/${jobNumber}/tests`,
    token
  );
  return response.items;
}

interface V1BuildStep {
  name: string;
  actions: Array<{
    name: string;
    status: string;
    exit_code: number | null;
    output_url?: string;
  }>;
}

interface V1BuildDetails {
  steps: V1BuildStep[];
}

/**
 * Get build details via v1.1 API (includes step output)
 */
export async function getBuildDetails(
  projectSlug: string,
  buildNumber: number,
  token: string
): Promise<FailedStep[]> {
  // Convert project slug from "gh/org/repo" to "github/org/repo" for v1.1 API
  const [vcsShort, org, repo] = projectSlug.split('/');
  const vcsType = vcsShort === 'gh' ? 'github' : vcsShort;

  const response = await fetch(
    `${CIRCLECI_API_V1}/project/${vcsType}/${org}/${repo}/${buildNumber}`,
    {
      headers: {
        'Circle-Token': token,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`CircleCI v1.1 API error (${response.status})`);
  }

  const data: V1BuildDetails = await response.json();

  // Find failed steps and fetch their output
  const failedSteps: FailedStep[] = [];

  for (const step of data.steps || []) {
    const failedActions = step.actions.filter(a => a.status === 'failed');
    if (failedActions.length > 0) {
      const actions: StepAction[] = [];

      for (const action of failedActions) {
        let output: string | null = null;

        // Fetch output if available
        if (action.output_url) {
          try {
            const outputResponse = await fetch(action.output_url, {
              headers: { 'Circle-Token': token },
            });
            if (outputResponse.ok) {
              const outputData = await outputResponse.json();
              // Output is an array of {type, message} objects
              if (Array.isArray(outputData)) {
                output = outputData.map((o: { message: string }) => o.message).join('');
              }
            }
          } catch {
            // Output fetch failed, continue without it
          }
        }

        actions.push({
          name: action.name,
          status: action.status,
          exitCode: action.exit_code,
          output,
        });
      }

      failedSteps.push({
        name: step.name,
        actions,
      });
    }
  }

  return failedSteps;
}

export interface StepAction {
  name: string;
  status: string;
  exitCode: number | null;
  output: string | null;
}

export interface FailedStep {
  name: string;
  actions: StepAction[];
}

export interface FailedJob {
  name: string;
  jobNumber: number;
  webUrl: string;
  workflowName: string;
  failedTests: CircleCITestMetadata[];
}

export interface WorkflowStatus {
  id: string;
  name: string;
  status: string;
  jobs: CircleCIJob[];
}

export interface CIStatus {
  branch: string;
  projectSlug: string;
  pipelineNumber: number;
  pipelineId: string;
  workflows: WorkflowStatus[];
  failedJobs: FailedJob[];
}

export interface FlakyTestsResult {
  projectSlug: string;
  totalFlakyTests: number;
  flakyTests: CircleCIFlakyTest[];
}

/**
 * Get flaky tests for the project from the CircleCI Insights API
 */
export async function getFlakyTests(
  token: string,
  projectSlugOverride?: string
): Promise<FlakyTestsResult> {
  const projectSlug = projectSlugOverride || getProjectSlug();
  if (!projectSlug) {
    throw new Error('Could not determine project slug from git remote');
  }

  const data = await circleciRequest<{
    flaky_tests: CircleCIFlakyTest[];
    total_flaky_tests: number;
  }>(`/insights/${projectSlug}/flaky-tests`, token);

  return {
    projectSlug,
    totalFlakyTests: data.total_flaky_tests,
    flakyTests: data.flaky_tests,
  };
}

/**
 * Get comprehensive CI status for a branch, including failed test details
 */
export async function getCIStatusForBranch(
  branch: string,
  token: string,
  projectSlugOverride?: string
): Promise<CIStatus | null> {
  const projectSlug = projectSlugOverride || getProjectSlug();
  if (!projectSlug) {
    throw new Error('Could not determine project slug from git remote');
  }

  // Get most recent pipeline for the branch
  const pipelines = await getPipelinesForBranch(projectSlug, branch, token);
  if (pipelines.length === 0) {
    return null;
  }

  const pipeline = pipelines[0];

  // Get ALL workflows for this pipeline
  const workflowsData = await getWorkflows(pipeline.id, token);
  if (workflowsData.length === 0) {
    return null;
  }

  // Fetch jobs for ALL workflows in parallel
  const workflowStatuses: WorkflowStatus[] = await Promise.all(
    workflowsData.map(async (workflow) => {
      const jobs = await getJobs(workflow.id, token);
      return {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        jobs,
      };
    })
  );

  // Find failed jobs across ALL workflows and get their details
  const failedJobs: FailedJob[] = [];

  for (const workflow of workflowStatuses) {
    for (const job of workflow.jobs) {
      if (job.status === 'failed') {
        try {
          const details = await getJobDetails(projectSlug, job.job_number, token);
          let failedTests: CircleCITestMetadata[] = [];

          try {
            const allTests = await getTestMetadata(projectSlug, job.job_number, token);
            failedTests = allTests.filter(t => t.result === 'failure');
          } catch {
            // Test metadata may not be available for all jobs
          }

          failedJobs.push({
            name: job.name,
            jobNumber: job.job_number,
            webUrl: details.web_url,
            workflowName: workflow.name,
            failedTests,
          });
        } catch {
          // If we can't get details, still include the job with basic info
          failedJobs.push({
            name: job.name,
            jobNumber: job.job_number,
            webUrl: `https://app.circleci.com/pipelines/${projectSlug}/${pipeline.number}/workflows/${workflow.id}/jobs/${job.job_number}`,
            workflowName: workflow.name,
            failedTests: [],
          });
        }
      }
    }
  }

  return {
    branch,
    projectSlug,
    pipelineNumber: pipeline.number,
    pipelineId: pipeline.id,
    workflows: workflowStatuses,
    failedJobs,
  };
}
