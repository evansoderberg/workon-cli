import { select, input, confirm, search, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { isTicketId, generateBranchName } from '../utils/branch.js';
import { findCurrentSprintByDate } from '../utils/sprint.js';
import { createSpinner, showSuccess, showBox } from '../utils/ui.js';
import { createClickUpClient } from '../services/clickup.js';
import * as git from '../services/git.js';
import * as claude from '../services/claude.js';
import type { Config, ClickUpList, ClickUpFolder, ClickUpCustomField } from '../types.js';

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
  if (!git.isBaseBranch()) {
    const baseBranch = git.getDefaultBaseBranch();
    console.log(chalk.yellow(`\n⚠️  Warning: You are on branch '${currentBranch}', not '${baseBranch}'.`));
    console.log(chalk.yellow('   Creating a new branch from here may not be what you intended.\n'));

    const proceed = await confirm({
      message: `Continue creating a new branch from '${currentBranch}'?`,
      default: false,
    });

    if (!proceed) {
      console.log(chalk.dim(`Tip: Run 'git checkout ${git.getDefaultBaseBranch()}' first, then try again.`));
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

const BROWSE_ALL_SPACES = '__browse_all__';

/**
 * Browse for a list starting from a specific folder's lists.
 * Offers a "Browse all spaces..." escape hatch to navigate the full hierarchy.
 */
async function browseFromFolder(
  clickup: ReturnType<typeof createClickUpClient>,
  lists: ClickUpList[],
): Promise<ClickUpList> {
  const choice = await select<ClickUpList | typeof BROWSE_ALL_SPACES>({
    message: 'Select list:',
    choices: [
      ...lists.map(l => ({ name: l.name, value: l })),
      { name: 'Browse all spaces...', value: BROWSE_ALL_SPACES },
    ],
  });

  if (choice === BROWSE_ALL_SPACES) {
    return browseFromSpaces(clickup);
  }

  return choice;
}

/**
 * Browse the full ClickUp hierarchy: Space → Folder/List → List
 */
async function browseFromSpaces(
  clickup: ReturnType<typeof createClickUpClient>,
): Promise<ClickUpList> {
  // 1. Select a space
  const spacesSpinner = createSpinner('Loading spaces...').start();
  const spaces = await clickup.getSpaces();
  spacesSpinner.stop();

  const spaceId = await select({
    message: 'Select space:',
    choices: spaces.map(s => ({ name: s.name, value: s.id })),
  });

  // 2. Load folders and folderless lists for the space
  const foldersSpinner = createSpinner('Loading folders...').start();
  const [folders, folderlessLists] = await Promise.all([
    clickup.getFolders(spaceId),
    clickup.getFolderlessLists(spaceId),
  ]);
  foldersSpinner.stop();

  type FolderOrList = { type: 'folder'; folder: ClickUpFolder } | { type: 'list'; list: ClickUpList };

  const choices: Array<{ name: string; value: FolderOrList }> = [
    ...folders.map(f => ({
      name: `📁 ${f.name}`,
      value: { type: 'folder' as const, folder: f },
    })),
    ...folderlessLists.map(l => ({
      name: `  ${l.name}`,
      value: { type: 'list' as const, list: l },
    })),
  ];

  if (choices.length === 0) {
    throw new Error('No folders or lists found in this space.');
  }

  const selection = await select<FolderOrList>({
    message: 'Select folder or list:',
    choices,
  });

  // If they picked a list directly, return it
  if (selection.type === 'list') {
    return selection.list;
  }

  // 3. They picked a folder — show lists within it
  const listsSpinner = createSpinner('Loading lists...').start();
  const listsInFolder = await clickup.getLists(selection.folder.id);
  listsSpinner.stop();

  if (listsInFolder.length === 0) {
    console.log(chalk.yellow('No lists found in this folder.'));
    return browseFromSpaces(clickup);
  }

  return browseFromFolder(clickup, listsInFolder);
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

  // 2. Select workspace or browse all spaces
  const workspaceNames = Object.keys(config.clickup.workspaces);
  const BROWSE_SPACES = '__browse_spaces__';

  let selectedList: ClickUpList;

  const workspaceChoices = [
    ...workspaceNames.map(w => ({ name: w, value: w })),
    { name: 'Browse all spaces...', value: BROWSE_SPACES },
  ];

  let workspaceChoice: string;
  if (workspaceNames.length === 1) {
    // Single saved workspace — use it directly, user can still browse from within
    workspaceChoice = workspaceNames[0];
    console.log(chalk.dim(`Using workspace: ${workspaceChoice}`));
  } else {
    workspaceChoice = await select({
      message: 'Workspace:',
      choices: workspaceChoices,
    });
  }

  if (workspaceChoice === BROWSE_SPACES) {
    // Full hierarchy browsing from scratch
    selectedList = await browseFromSpaces(clickup);
  } else {
    // Saved workspace — find current sprint, then let user pick or browse
    const workspaceConfig = config.clickup.workspaces[workspaceChoice];

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

    if (sprintList) {
      // Sprint found — offer it as default, or browse this folder's lists
      const BROWSE_FOLDER = '__browse_folder__';
      const choice = await select<string>({
        message: 'Place ticket in:',
        choices: [
          { name: `${sprintList.name} (current sprint)`, value: sprintList.id },
          { name: 'Browse other lists...', value: BROWSE_FOLDER },
        ],
      });

      if (choice === BROWSE_FOLDER) {
        selectedList = await browseFromFolder(clickup, lists);
      } else {
        selectedList = sprintList;
      }
    } else {
      // No sprint auto-detected — show folder lists with browse escape
      const sprintLists = lists.filter(l =>
        workspaceConfig.sprintPatterns.some(p => new RegExp(p).test(l.name)) ||
        /\(\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}\)/.test(l.name)
      );

      const listsToShow = sprintLists.length > 0 ? sprintLists : lists;
      selectedList = await browseFromFolder(clickup, listsToShow);
    }
  }

  const listId = selectedList.id;

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

  // 7. Collect description (optional, can be blank)
  let userDescription = await input({
    message: 'Description (press enter to skip):',
  });

  // Offer to open in editor
  if (userDescription.trim()) {
    const wantEditor = await confirm({
      message: 'Edit in your default editor?',
      default: false,
    });
    if (wantEditor) {
      userDescription = await editor({
        message: 'Edit description',
        default: userDescription,
      });
    }
  } else {
    const wantEditor = await confirm({
      message: 'Open editor to write description?',
      default: false,
    });
    if (wantEditor) {
      userDescription = await editor({
        message: 'Write description',
      });
    }
  }

  // 8. Optional acceptance criteria
  let acceptanceCriteria = '';
  const wantAcceptanceCriteria = await confirm({
    message: 'Add acceptance criteria?',
    default: false,
  });

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

  // Build base description
  let finalDescription = userDescription.trim();
  if (acceptanceCriteria) {
    finalDescription += (finalDescription ? '\n\n' : '') + '## Acceptance Criteria\n' + acceptanceCriteria;
  }

  // 9. Optional AI enhancement (at the end of the flow)
  if (config.ai.enabled && config.ai.generateTicketDescriptions) {
    const wantEnhancement = await confirm({
      message: 'Enhance description with AI?',
      default: false,
    });

    if (wantEnhancement) {
      const spinner3 = createSpinner('Enhancing description...').start();

      try {
        const typeName = typeField?.type_config?.options?.find(o => o.id === typeValue)?.name || '';
        const getOptionName = (o: { name?: string; label?: string }) => o.name || o.label || '';
        const domainNames = domainValues
          .map(id => domainField?.type_config?.options?.find(o => o.id === id))
          .filter(Boolean)
          .map(o => getOptionName(o!));
        const domainName = domainNames.join(', ');

        const enhancedDescription = await claude.generate(`
You are enhancing an existing ticket description. Improve the clarity, professionalism, and completeness while preserving the original intent and meaning.

Title: ${title}
${typeName ? `Type: ${typeName}` : ''}
${domainName ? `Domain: ${domainName}` : ''}

ORIGINAL DESCRIPTION:
${finalDescription || '(No description provided)'}

INSTRUCTIONS:
- Keep the core message and intent intact
- Improve clarity and professional tone
- Fix any grammar or spelling issues
- If there is an "## Acceptance Criteria" section, refine and expand the criteria as needed
- If there is NO acceptance criteria section, add one with 3-4 bullet points based on the title and context
- Keep the description concise (2-3 sentences for the main description)
- Output only the enhanced description, no preamble or explanation
        `);

        spinner3.stop();
        showBox(enhancedDescription, 'AI Enhanced Description');

        const useIt = await select({
          message: 'Use this enhanced description?',
          choices: [
            { name: 'Yes, use enhanced', value: 'yes' },
            { name: 'Edit', value: 'edit' },
            { name: 'Keep original', value: 'skip' },
          ],
        });

        if (useIt === 'yes') {
          finalDescription = enhancedDescription;
        } else if (useIt === 'edit') {
          finalDescription = await editor({
            message: 'Edit description',
            default: enhancedDescription,
          });
        }
        // if 'skip', finalDescription remains as the user's original
      } catch (error) {
        spinner3.fail('Failed to enhance description');
        console.error(chalk.yellow('Continuing with original description...'));
      }
    }
  }

  // 10. Create the task
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
      markdown_description: finalDescription,
      assignees: [parseInt(config.clickup.userId, 10)],
      custom_fields: customFieldsPayload,
    });

    spinner4.succeed(`Created ticket: ${task.id}`);

    // 11. Create branch
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
