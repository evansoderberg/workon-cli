import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { configExists, getConfigPath, saveConfig, getExampleConfig } from '../utils/config.js';
import { showSuccess } from '../utils/ui.js';

export async function initCommand(): Promise<void> {
  const configPath = getConfigPath();

  if (configExists()) {
    const overwrite = await confirm({
      message: `Config already exists at ${configPath}. Overwrite?`,
      default: false,
    });

    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  console.log(chalk.bold('\nWorkon CLI Configuration\n'));
  console.log(chalk.dim('You can edit the config file later at:'));
  console.log(chalk.dim(configPath));
  console.log('');

  // Get basic info
  const clickupToken = await input({
    message: 'ClickUp API token (pk_...):',
    validate: (v) => v.startsWith('pk_') || 'Token should start with pk_',
  });

  const clickupUserId = await input({
    message: 'ClickUp user ID:',
    validate: (v) => v.length > 0 || 'Required',
  });

  const clickupWorkspaceId = await input({
    message: 'ClickUp workspace ID:',
    validate: (v) => v.length > 0 || 'Required',
  });

  const githubUsername = await input({
    message: 'GitHub username:',
    validate: (v) => v.length > 0 || 'Required',
  });

  const branchPrefix = await input({
    message: 'Branch prefix (your name):',
    default: githubUsername,
  });

  // Create config
  const config = getExampleConfig();
  config.clickup.apiToken = clickupToken;
  config.clickup.userId = clickupUserId;
  config.clickup.workspaceId = clickupWorkspaceId;
  config.github.username = githubUsername;
  config.git.branchPrefix = branchPrefix;

  saveConfig(config);

  console.log('');
  showSuccess(`Configuration saved to ${configPath}`);
  console.log('');
  console.log(chalk.dim('Edit the file to add workspace mappings and customize settings.'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log('  1. Add your workspace space IDs to the config');
  console.log('  2. Ensure gh CLI is authenticated: gh auth login');
  console.log('  3. Run: workon start');
}
