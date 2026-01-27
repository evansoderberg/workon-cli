import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import chalk from 'chalk';
import type { Config } from '../types.js';

const CONFIG_DIR = join(homedir(), '.config', 'workon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const ConfigSchema = z.object({
  clickup: z.object({
    apiToken: z.string().min(1),
    userId: z.string().min(1),
    workspaceId: z.string().min(1),
    workspaces: z.record(z.object({
      folderId: z.string().min(1),
      sprintPatterns: z.array(z.string()),
    })),
    defaults: z.object({
      status: z.string().default('ON DECK'),
      type: z.string().optional(),
      domain: z.string().optional(),
    }),
  }),
  github: z.object({
    username: z.string().min(1),
  }),
  git: z.object({
    branchPrefix: z.string().min(1),
    baseBranch: z.string().default('main'),
  }),
  ai: z.object({
    enabled: z.boolean().default(true),
    generateTicketDescriptions: z.boolean().default(true),
  }).default({}),
  circleci: z.object({
    apiToken: z.string().min(1),
  }).optional(),
});

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    console.error(chalk.red('Configuration not found.'));
    console.error(chalk.yellow(`Run ${chalk.cyan('workon init')} to create one.`));
    console.error(chalk.yellow(`Or create manually at: ${CONFIG_PATH}`));
    process.exit(1);
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    migrateConfig(parsed);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(chalk.red('Invalid configuration:'));
      error.errors.forEach(e => {
        console.error(chalk.red(`  - ${e.path.join('.')}: ${e.message}`));
      });
    } else {
      console.error(chalk.red('Failed to load configuration:'), error);
    }
    process.exit(1);
  }
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Migrate old flat config format to new nested format
function migrateConfig(parsed: Record<string, unknown>): void {
  const clickup = parsed.clickup as Record<string, unknown> | undefined;
  if (!clickup) return;

  // Move top-level "workspaces" into clickup
  if (parsed.workspaces && !clickup.workspaces) {
    clickup.workspaces = parsed.workspaces;
    delete parsed.workspaces;
  }

  // Move top-level "defaults" into clickup
  if (parsed.defaults && !clickup.defaults) {
    clickup.defaults = parsed.defaults;
    delete parsed.defaults;
  }
}

export function getExampleConfig(): Config {
  return {
    clickup: {
      apiToken: '',
      userId: '',
      workspaceId: '',
      workspaces: {
        Main: {
          folderId: 'YOUR_FOLDER_ID',
          sprintPatterns: [
            'Sprint \\d+ \\(',
            '\\d+ .+ \\('
          ],
        },
      },
      defaults: {
        status: 'ON DECK',
      },
    },
    github: {
      username: '',
    },
    git: {
      branchPrefix: '',
      baseBranch: 'main',
    },
    ai: {
      enabled: true,
      generateTicketDescriptions: true,
    },
  };
}
