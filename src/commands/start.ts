import { select, input, confirm, search } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { isTicketId, generateBranchName } from '../utils/branch.js';
import { findCurrentSprintByDate } from '../utils/sprint.js';
import { createSpinner, showSuccess, showBox } from '../utils/ui.js';
import { createClickUpClient } from '../services/clickup.js';
import * as git from '../services/git.js';
import * as claude from '../services/claude.js';
import type { Config, ClickUpList, ClickUpCustomField } from '../types.js';

export async function startCommand(ticketIdArg?: string): Promise<void> {
  // Verify we're in a git repo
  if (!git.isGitRepo()) {
    console.error(chalk.red('Not in a git repository.'));
    process.exit(1);
  }

  const config = loadConfig();
  const clickup = createClickUpClient(config.clickup.apiToken, config.clickup.workspaceId);

  // If ticket ID provided as argument, go straight to existing flow
  // (skip base branch check - startFromExisting handles already-on-branch case)
  if (ticketIdArg && isTicketId(ticketIdArg)) {
    await startFromExisting(ticketIdArg, config, clickup);
    return;
  }

  // Safety check: warn if not on base branch (only for interactive mode)
  const currentBranch = git.currentBranch();
  if (!git.isBaseBranch(config.git.baseBranch)) {
    console.log(chalk.yellow(`\n⚠️  Warning: You are on branch '${currentBranch}', not '${config.git.baseBranch}'.`));
    console.log(chalk.yellow('   Creating a new branch from here may not be what you intended.\n'));

    const proceed = await confirm({
      message: `Continue creating a new branch from '${currentBranch}'?`,
      default: false,
    });

    if (!proceed) {
      console.log(chalk.dim(`Tip: Run 'git checkout ${config.git.baseBranch}' first, then try again.`));
      return;
    }
  }

  // Single input prompt: enter ticket ID/search term, or press enter to create new
  const userInput = await input({
    message: 'Ticket ID or search (press enter to create new):',
  });

  if (!userInput.trim()) {
    // Empty input = create new ticket
    await handleNewTicket(config, clickup);
  } else if (isTicketId(userInput)) {
    // Direct ticket ID
    await startFromExisting(userInput.toLowerCase(), config, clickup);
  } else {
    // Search term
    await handleSearchAndSelect(userInput, config, clickup);
  }
}

async function handleSearchAndSelect(
  searchTerm: string,
  config: Config,
  clickup: ReturnType<typeof createClickUpClient>
): Promise<void> {
  const spinner = createSpinner('Searching...').start();

  try {
    const results = await clickup.searchTasks(searchTerm);
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.yellow('No tickets found.'));
      const createNew = await confirm({ message: 'Create a new ticket instead?' });
      if (createNew) {
        await handleNewTicket(config, clickup, searchTerm);
      }
      return;
    }

    const ticketId = await select({
      message: 'Select ticket:',
      choices: results.map(t => ({
        name: `${t.id}: ${t.name}`,
        value: t.id,
      })),
    });

    await startFromExisting(ticketId, config, clickup);
  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Search failed:'), error);
  }
}

async function startFromExisting(
  ticketId: string,
  config: Config,
  clickup: ReturnType<typeof createClickUpClient>
): Promise<void> {
  const spinner = createSpinner('Fetching ticket...').start();

  try {
    const ticket = await clickup.getTask(ticketId);
    spinner.succeed(`Found: ${ticket.name}`);

    const branchName = generateBranchName(config.git.branchPrefix, ticketId, ticket.name);
    const currentBranch = git.currentBranch();

    // Check if we're already on this branch
    if (currentBranch === branchName) {
      console.log(chalk.green(`Already on branch: ${branchName}`));
      console.log(`  Ticket: ${chalk.blue(ticket.url)}`);
      return;
    }

    // Check if branch exists
    if (git.branchExists(branchName)) {
      const action = await select({
        message: `Branch ${chalk.cyan(branchName)} already exists.`,
        choices: [
          { name: 'Check it out', value: 'checkout' },
          { name: 'Delete and recreate', value: 'recreate' },
          { name: 'Cancel', value: 'cancel' },
        ],
      });

      if (action === 'cancel') return;
      if (action === 'checkout') {
        git.checkout(branchName);
        showSuccess(`Checked out branch: ${branchName}`);
        return;
      }
      git.deleteBranch(branchName);
    }

    git.checkoutNewBranch(branchName);

    console.log('');
    showSuccess(`Created branch: ${chalk.cyan(branchName)}`);
    console.log(`  Ticket: ${chalk.blue(ticket.url)}`);
  } catch (error) {
    spinner.fail('Failed to fetch ticket');
    console.error(chalk.red(error));
  }
}

async function handleNewTicket(
  config: Config,
  clickup: ReturnType<typeof createClickUpClient>,
  initialTitle?: string
): Promise<void> {
  // 1. Get title
  const title = initialTitle || await input({
    message: 'Ticket title:',
    validate: (v) => v.length > 0 || 'Required',
  });

  // 2. Select workspace
  const workspaceNames = Object.keys(config.workspaces);
  let workspace: string;

  if (workspaceNames.length === 1) {
    workspace = workspaceNames[0];
    console.log(chalk.dim(`Using workspace: ${workspace}`));
  } else {
    workspace = await select({
      message: 'Workspace:',
      choices: workspaceNames.map(w => ({ name: w, value: w })),
    });
  }

  const workspaceConfig = config.workspaces[workspace];

  // 3. Find current sprint list within the folder
  const spinner = createSpinner('Finding current sprint...').start();

  let lists: ClickUpList[];
  let sprintList: ClickUpList | null = null;

  try {
    lists = await clickup.getLists(workspaceConfig.folderId);
    sprintList = findCurrentSprintByDate(lists, workspaceConfig.sprintPatterns);
    spinner.stop();
  } catch (error) {
    spinner.fail('Failed to fetch lists');
    console.error(chalk.red(error));
    return;
  }

  if (!sprintList) {
    // Filter to only show lists matching sprint patterns or with date ranges
    const sprintLists = lists.filter(l =>
      workspaceConfig.sprintPatterns.some(p => new RegExp(p).test(l.name)) ||
      /\(\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}\)/.test(l.name)
    );

    const listsToShow = sprintLists.length > 0 ? sprintLists : lists;

    sprintList = await select({
      message: 'Select sprint:',
      choices: listsToShow.map(l => ({ name: l.name, value: l })),
    });
  } else {
    showSuccess(`Found sprint: ${sprintList.name}`);
  }

  const listId = sprintList.id;

  // 4. Get custom fields
  const spinner2 = createSpinner('Loading custom fields...').start();

  let customFields: ClickUpCustomField[];
  try {
    customFields = await clickup.getListCustomFields(listId);
    spinner2.stop();
  } catch (error) {
    spinner2.fail('Failed to fetch custom fields');
    console.error(chalk.red(error));
    return;
  }

  const typeField = customFields.find(f => f.name.toLowerCase() === 'type');
  const domainField = customFields.find(f => f.name.toLowerCase() === 'domain');

  // 5. Prompt for Type (in ClickUp order)
  let typeValue: string | undefined;
  if (typeField?.type_config?.options) {
    typeValue = await select({
      message: 'Type:',
      choices: typeField.type_config.options.map(o => ({
        name: o.name,
        value: o.id,
      })),
      loop: false,
    });
  }

  // 6. Prompt for Domain(s) - searchable, multi-select
  // Domain can be either a dropdown (uses 'name') or labels (uses 'label') type field
  const domainValues: string[] = [];
  if (domainField?.type_config?.options) {
    const getOptionName = (o: { name?: string; label?: string }) => o.name || o.label || '';
    const validDomainOptions = domainField.type_config.options.filter(o => getOptionName(o));
    const sortedDomainOptions = [...validDomainOptions].sort((a, b) =>
      getOptionName(a).localeCompare(getOptionName(b))
    );

    if (sortedDomainOptions.length > 0) {
      // Allow selecting multiple domains with search
      let selectingDomains = true;
      while (selectingDomains) {
        const availableOptions = sortedDomainOptions.filter(o => !domainValues.includes(o.id));
        if (availableOptions.length === 0) break;

        const selectedNames = domainValues
          .map(id => getOptionName(sortedDomainOptions.find(o => o.id === id) || {}))
          .filter(Boolean);
        const currentSelection = selectedNames.length > 0
          ? chalk.dim(` (selected: ${selectedNames.join(', ')})`)
          : '';

        const domainId = await search({
          message: `Domain${currentSelection}:`,
          source: async (term) => {
            const filtered = term
              ? availableOptions.filter(o =>
                  getOptionName(o).toLowerCase().includes(term.toLowerCase())
                )
              : availableOptions;
            return [
              ...(domainValues.length > 0 ? [{ name: chalk.green('✓ Done selecting'), value: '__done__' }] : []),
              ...filtered.map(o => ({ name: getOptionName(o), value: o.id })),
            ];
          },
        });

        if (domainId === '__done__') {
          selectingDomains = false;
        } else {
          domainValues.push(domainId);
          // Ask if they want to add more
          const addMore = await confirm({
            message: 'Add another domain?',
            default: false,
          });
          if (!addMore) selectingDomains = false;
        }
      }
    }
  }

  // 7. Generate description (AI - optional)
  let description = '';

  if (config.ai.enabled && config.ai.generateTicketDescriptions) {
    const wantDescription = await confirm({
      message: 'Generate description with AI?',
      default: true,
    });

    if (wantDescription) {
      const additionalContext = await input({
        message: 'Additional context (optional, press enter to skip):',
      });

      // Ask if user wants to provide acceptance criteria
      const wantAcceptanceCriteria = await confirm({
        message: 'Add acceptance criteria to guide the description?',
        default: false,
      });

      let acceptanceCriteria = '';
      if (wantAcceptanceCriteria) {
        console.log(chalk.dim('Enter acceptance criteria (one per line, empty line to finish):'));
        const criteria: string[] = [];
        let criterion = await input({ message: '  •' });
        while (criterion.trim()) {
          criteria.push(criterion.trim());
          criterion = await input({ message: '  •' });
        }
        if (criteria.length > 0) {
          acceptanceCriteria = criteria.map(c => `- ${c}`).join('\n');
        }
      }

      const spinner3 = createSpinner('Generating description...').start();

      try {
        const typeName = typeField?.type_config?.options?.find(o => o.id === typeValue)?.name || '';
        const getOptionName = (o: { name?: string; label?: string }) => o.name || o.label || '';
        const domainNames = domainValues
          .map(id => domainField?.type_config?.options?.find(o => o.id === id))
          .filter(Boolean)
          .map(o => getOptionName(o!));
        const domainName = domainNames.join(', ');

        const hasUserCriteria = acceptanceCriteria.length > 0;

        description = await claude.generate(`
Write a brief, professional ticket description for a software development task.

Title: ${title}
${typeName ? `Type: ${typeName}` : ''}
${domainName ? `Domain: ${domainName}` : ''}
${additionalContext ? `Additional context: ${additionalContext}` : ''}
${hasUserCriteria ? `\nUser-provided acceptance criteria:\n${acceptanceCriteria}` : ''}

Format:
- 2-3 sentences describing the task
- A "## Acceptance Criteria" section with ${hasUserCriteria ? 'the user-provided criteria below, refined and expanded as needed' : '3-4 bullet points'}

Be concise and actionable. Output only the description, no preamble.
        `);

        spinner3.stop();
        showBox(description);

        const useIt = await select({
          message: 'Use this description?',
          choices: [
            { name: 'Yes', value: 'yes' },
            { name: 'Edit (opens $EDITOR)', value: 'edit' },
            { name: 'Skip (no description)', value: 'skip' },
          ],
        });

        if (useIt === 'edit') {
          // For now, just let them type a new one
          description = await input({ message: 'Enter description:' });
        } else if (useIt === 'skip') {
          description = '';
        }
      } catch (error) {
        spinner3.fail('Failed to generate description');
        console.error(chalk.yellow('Continuing without description...'));
      }
    }
  }

  // 8. Create the task
  const spinner4 = createSpinner('Creating ticket...').start();

  try {
    const customFieldsPayload: Array<{ id: string; value: string | string[] }> = [];
    if (typeField && typeValue !== undefined) {
      customFieldsPayload.push({ id: typeField.id, value: typeValue });
    }
    if (domainField && domainValues.length > 0) {
      // Labels fields expect an array of IDs, dropdown fields expect a single ID
      const domainPayloadValue = domainField.type === 'labels' ? domainValues : domainValues[0];
      customFieldsPayload.push({ id: domainField.id, value: domainPayloadValue });
    }

    const task = await clickup.createTask(listId, {
      name: title,
      markdown_description: description,
      assignees: [parseInt(config.clickup.userId, 10)],
      custom_fields: customFieldsPayload,
    });

    spinner4.succeed(`Created ticket: ${task.id}`);

    // 9. Create branch
    const branchName = generateBranchName(config.git.branchPrefix, task.id, title);
    git.checkoutNewBranch(branchName);

    console.log('');
    showSuccess(`Created branch: ${chalk.cyan(branchName)}`);
    console.log(`  Ticket: ${chalk.blue(task.url)}`);
  } catch (error) {
    spinner4.fail('Failed to create ticket');
    console.error(chalk.red(error));
  }
}
