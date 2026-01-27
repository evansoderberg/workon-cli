export interface Config {
  clickup: {
    apiToken: string;
    userId: string;
    workspaceId: string;
    workspaces: Record<string, WorkspaceConfig>;
    defaults: {
      status: string;
      type?: string;
      domain?: string;
    };
  };
  github: {
    username: string;
  };
  git: {
    branchPrefix: string;
  };
  ai: {
    enabled: boolean;
    generateTicketDescriptions: boolean;
  };
  circleci?: {
    apiToken: string;
  };
}

export interface WorkspaceConfig {
  folderId: string;
  sprintPatterns: string[];
}

// ClickUp Types
export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  status: {
    status: string;
    color: string;
  };
  url: string;
  assignees: Array<{ id: number; username: string }>;
  custom_fields?: ClickUpCustomField[];
}

export interface ClickUpSpace {
  id: string;
  name: string;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  lists?: ClickUpList[];
}

export interface ClickUpList {
  id: string;
  name: string;
}

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: Array<{
      id: string;
      name?: string;   // dropdown fields use 'name'
      label?: string;  // labels fields use 'label'
      orderindex: number;
    }>;
  };
}

export interface ClickUpSearchResult {
  id: string;
  name: string;
  url: string;
}

// GitHub Types
export interface GitHubPr {
  number: number;
  title: string;
  url: string;
  state: string;
  body?: string;
}

export interface GitHubPrStatus {
  reviewDecision: string | null;
  reviews: Array<{
    author: string;
    state: string;
  }>;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
  }>;
}

// Command Types
export type StartMode = 'existing' | 'new';
export type PrAction = 'create' | 'edit' | 'regenerate' | 'cancel';
export type DescriptionAction = 'yes' | 'edit' | 'skip';

// CircleCI Types
export interface CircleCIPipeline {
  id: string;
  number: number;
  state: string;
  created_at: string;
  trigger: {
    type: string;
    actor: {
      login: string;
    };
  };
  vcs: {
    branch: string;
    revision: string;
  };
}

export interface CircleCIWorkflow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  stopped_at: string | null;
  pipeline_id: string;
  pipeline_number: number;
}

export interface CircleCIJob {
  id: string;
  name: string;
  type: string;
  status: string;
  job_number: number;
  started_at: string | null;
  stopped_at: string | null;
}

export interface CircleCIJobDetail {
  web_url: string;
  name: string;
  status: string;
  duration: number;
  messages: Array<{ type: string; message: string }>;
}

export interface CircleCITestMetadata {
  message: string;
  source: string;
  run_time: number;
  file: string;
  result: string;
  name: string;
  classname: string;
}

export interface CircleCIArtifact {
  path: string;
  node_index: number;
  url: string;
}
