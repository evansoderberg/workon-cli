export interface Config {
  clickup: {
    apiToken: string;
    userId: string;
    workspaceId: string;
  };
  github: {
    username: string;
  };
  git: {
    branchPrefix: string;
    baseBranch: string;
  };
  workspaces: Record<string, WorkspaceConfig>;
  defaults: {
    status: string;
    type?: string;
    domain?: string;
  };
  ai: {
    enabled: boolean;
    generateTicketDescriptions: boolean;
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
