import type {
  ClickUpTask,
  ClickUpFolder,
  ClickUpList,
  ClickUpCustomField,
  ClickUpSearchResult
} from '../types.js';
import { isDryRun, dryRunLog } from '../utils/dry-run.js';

const BASE_URL = 'https://api.clickup.com/api/v2';

export class ClickUpClient {
  constructor(private token: string, private workspaceId: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ClickUp API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string): Promise<ClickUpTask> {
    return this.request<ClickUpTask>(`/task/${taskId}`);
  }

  /**
   * Search tasks in the workspace
   */
  async searchTasks(query: string, limit = 10): Promise<ClickUpSearchResult[]> {
    const params = new URLSearchParams({
      query,
      include_closed: 'false',
    });

    const data = await this.request<{ tasks: ClickUpSearchResult[] }>(
      `/team/${this.workspaceId}/task?${params}`
    );

    return data.tasks.slice(0, limit);
  }

  /**
   * Get all folders in a space
   */
  async getFolders(spaceId: string): Promise<ClickUpFolder[]> {
    const data = await this.request<{ folders: ClickUpFolder[] }>(
      `/space/${spaceId}/folder`
    );
    return data.folders;
  }

  /**
   * Get all lists in a folder
   */
  async getLists(folderId: string): Promise<ClickUpList[]> {
    const data = await this.request<{ lists: ClickUpList[] }>(
      `/folder/${folderId}/list`
    );
    return data.lists;
  }

  /**
   * Get custom fields available on a list
   */
  async getListCustomFields(listId: string): Promise<ClickUpCustomField[]> {
    const data = await this.request<{ fields: ClickUpCustomField[] }>(
      `/list/${listId}/field`
    );
    return data.fields;
  }

  /**
   * Create a new task
   */
  async createTask(listId: string, task: {
    name: string;
    markdown_description?: string;
    assignees?: number[];
    status?: string;
    custom_fields?: Array<{ id: string; value: number | string }>;
  }): Promise<ClickUpTask> {
    if (isDryRun()) {
      dryRunLog('clickup', 'Would create task', {
        listId,
        name: task.name,
        description: task.markdown_description,
        assignees: task.assignees,
        status: task.status,
        custom_fields: task.custom_fields,
      });
      // Return a mock task for dry-run
      return {
        id: 'dry-run-task-id',
        name: task.name,
        description: task.markdown_description || '',
        text_content: task.markdown_description || '',
        status: { status: task.status || 'Open', type: 'open', orderindex: 0, color: '#000000' },
        url: 'https://app.clickup.com/t/dry-run-task-id (dry-run)',
        assignees: [],
      } as ClickUpTask;
    }
    return this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  /**
   * Get tasks assigned to a user
   */
  async getMyTasks(userId: string, limit = 20): Promise<ClickUpTask[]> {
    const params = new URLSearchParams({
      assignees: userId,
      include_closed: 'false',
      subtasks: 'true',
      page: '0',
    });

    const data = await this.request<{ tasks: ClickUpTask[] }>(
      `/team/${this.workspaceId}/task?${params}`
    );

    return data.tasks.slice(0, limit);
  }
}

export function createClickUpClient(token: string, workspaceId: string): ClickUpClient {
  return new ClickUpClient(token, workspaceId);
}
