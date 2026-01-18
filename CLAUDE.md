# Workon CLI

CLI for ClickUp + GitHub integration. Available globally via `workon` command.

**Important:** If the user includes the word "workon" in their message, they are explicitly requesting to use this CLI. Parse their intent and run the appropriate command directly.

Examples:
- "workon 86b7x5453" → Run `workon 86b7x5453` to create/checkout the branch for that ticket, then run `workon ticket` to bring the ticket context into the session
- "workon ticket" → Run `workon ticket` to get context on the current task
- "workon pr" → Start the PR creation flow using the `workon pr` command with appropriate flags

## Commands You Can Run

```bash
# Start work on an existing ticket (creates/checkouts branch)
workon <ticket-id>

# Get ticket info for current branch (use this to get context on the current task)
workon ticket

# Create PR with content (base branch is auto-detected)
workon pr --title "..." --summary "..." --description "..." --testing "..."

# Create PR with explicit base branch (if auto-detection fails)
workon pr --base master --title "..." --summary "..." --description "..." --testing "..."

# Update PR sections
workon pr-update --summary "..." --description "..." --testing "..." --ticket <id>

# Pipe content to a section
echo "content" | workon pr-update --description -

# Check PR status
workon pr-status [pr-number]

# Post merge comment (ask user first)
workon merge [pr-number]
```

**Note:** `workon <ticket-id>` may prompt for user input if the branch already exists (to choose: checkout, recreate, or cancel). If the branch doesn't exist, it creates it automatically.

## Commands That Require User Interaction

These require interactive input. Prompt the user to run them directly in their terminal:

- `workon start` (with no ticket ID) - When starting a new feature or task that needs a ClickUp ticket. Prompts for ticket ID, search term, or creates a new ticket interactively.

## Getting Context on the Current Task

When the user asks you to work on a task and you need context from the ClickUp ticket, run:

```bash
workon ticket
```

This outputs the ticket title, status, URL, and description. Use this to understand:
- What the user is trying to accomplish
- Acceptance criteria or requirements
- Any relevant context from the ticket description

This is especially useful when:
- Starting a new coding session on an existing branch
- The user asks "what am I working on?" or similar
- You need to understand the requirements before implementing

## When to Create PRs

Create a PR when the user:
- Says "create a PR", "open a PR", "submit for review", or a message with similar intent.
- Indicates code is ready for review
- Asks to push changes and get feedback

Steps:
1. Gather context:
   - Read the PR template: `cat .github/PULL_REQUEST_TEMPLATE.md`
   - Get diff, commits, or extract content from the working session to gain enough context in order to generate a good title, summary, description, testing instructions
   - Extract ticket ID from branch name (format: `username/{ticketid}/...`)

2. Code review (prompt user):
   - Before creating the PR, ask the user if they'd like you to run a code review first
   - If yes, review the changes for issues, improvements, and potential bugs
   - Address any findings before proceeding with PR creation

3. Generate content for each section (you are responsible for generating this content):
   - **Title**: Concise description of the change (often matches ticket name)
   - **Summary**: 1-2 sentences describing what changed and why
   - **Description**: Detailed explanation referencing specific files/functions changed
   - **How to Test**: Step-by-step verification instructions with expected outcomes

4. **Get explicit user approval before creating the PR:**
   - Show the user the PR details (title, summary, description, testing instructions)
   - Ask: "Ready to create this PR and push to GitHub?"
   - **WAIT for the user to explicitly confirm** (e.g., "yes", "go ahead", "create it")
   - Do NOT proceed until you receive explicit approval

5. After receiving approval, run the workon command:
   ```bash
   workon pr --title "..." --summary "..." --ticket "..." --description "..." --testing "..."
   ```
   - Add `--draft` if the user asks for a draft PR or mentions "draft", "WIP", or "work in progress"
   - The ticket ID is extracted from the branch automatically if not provided
   - The base branch is auto-detected (checks if `main` or `master` exists in the repo)
   - Use `--base <branch>` to override auto-detection if needed

The workon CLI fills in the PR template sections. Do not modify the "Best Practices" checklist section.

## When to Update PRs

Update a PR when the user:
- Asks to improve or fix the PR description
- Requests changes to specific sections (summary, description, testing)
- Adds more commits and wants the description updated

Steps:
1. Check current body: `gh pr view --json body`
2. Update relevant sections: `workon pr-update --description "..." --testing "..."`

## When to Merge

Only run `workon merge` when:
- The user explicitly asks to merge
- CI checks are passing (check with `workon pr-status`)
- Required approvals are received

Always ask the user for confirmation before merging. Never auto-merge.
