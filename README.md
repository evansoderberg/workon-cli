# Workon CLI

A command-line tool for streamlined development workflow with ClickUp and GitHub.

## Features

- **`workon <ticket-id>`** - Start work on a ClickUp ticket (e.g., `workon 86b6ycnw1`)
- **`workon start`** - Interactive mode to search, select, or create a ticket
- **`workon ticket`** - Get ticket info from ClickUp for context
- **`workon comment`** - Add a comment to the current ticket
- **`workon pr`** - Create a pull request with AI-generated description
- **`workon pr-status`** - Check PR approval and CI status
- **`workon ci-status`** - Check CircleCI build status for any branch
- **`workon ci-failure`** - Get full error output from a failed CI job
- **`workon merge`** - Post `/merge` comment to trigger merge automation

## Installation

### From source

```bash
git clone https://github.com/evansoderberg/workon-cli.git
cd workon-cli
npm install
npm run build
npm link
```

### Initialize configuration

```bash
workon init
```

This creates `~/.config/workon/config.json`. Edit it to add your:
- ClickUp API token
- Workspace space IDs
- Sprint folder patterns

## Prerequisites

1. **Node.js 20+**
2. **GitHub CLI** (`gh`) - [Install](https://cli.github.com/)
   ```bash
   brew install gh
   gh auth login
   ```
3. **Claude Code** (for AI features) - [Install](https://claude.ai/code)
4. **ClickUp API token** - Settings → Apps → Generate token
5. **CircleCI API token** (optional, for `ci-status`) - User Settings → Personal API Tokens

## Usage

### Start work on a ticket

```bash
# Most common: pass the ClickUp ticket ID directly
workon 86b6ycnw1

# Creates branch: username/86b6ycnw1/ticket-title-slug
# If branch exists, prompts to checkout or recreate
```

### Interactive mode

```bash
# Search for tickets, select from list, or create a new one
workon start

# Or pass ticket ID to skip the prompt
workon start 86b6ycnw1
```

When creating a new ticket, `workon start` prompts for:
- **Title** - The ticket name
- **Workspace** - If multiple configured
- **Type** - Dropdown selection (Bug, Feature, Technical, etc.)
- **Domain** - Searchable multi-select (type to filter, select multiple)
- **Description** - Optional AI-generated description with acceptance criteria

### Create a pull request

```bash
# Interactive mode - prompts for title, summary, description, testing
workon pr

# Non-interactive mode - provide content directly (for Claude Code integration)
workon pr --title "Add feature" --summary "..." --description "..." --testing "..."

# Pipe content from stdin
echo "Description content" | workon pr --title "Add feature" --description -

# Create as draft
workon pr --draft
```

### Get ticket info

```bash
# Get ticket info for current branch (extracts ID from branch name)
workon ticket

# Get specific ticket
workon ticket 86b6ycnw1
```

Outputs the ticket title, status, URL, and description. Useful for getting context from ClickUp into your current session.

### Add a comment to the ticket

```bash
# Add a comment to the current branch's ticket
workon comment "Started working on this feature"

# Pipe content from stdin
echo "Comment content" | workon comment
```

### Check PR status

```bash
# Current branch's PR
workon pr-status

# Specific PR
workon pr-status 123
```

### Check CI status

```bash
# Current branch
workon ci-status

# Specific branch
workon ci-status feature/my-branch
```

Shows CircleCI pipeline status including:
- Workflow status (passed/failed/running)
- Individual job results
- Job numbers for failed jobs

### Get CI failure details

```bash
# Get output from first failed job on current branch
workon ci-failure

# Get output from a specific job number
workon ci-failure 2928754

# Check a different branch
workon ci-failure --branch feature/other-branch
```

Fetches the full, untruncated error output from a failed CI step. Useful for debugging test failures, lint errors, or build issues.

### Merge

```bash
workon merge
```

## Configuration

Edit `~/.config/workon/config.json`:

```json
{
  "clickup": {
    "apiToken": "pk_...",
    "userId": "12345678",
    "workspaceId": "1234567"
  },
  "github": {
    "username": "username"
  },
  "git": {
    "branchPrefix": "username",
    "baseBranch": "main"
  },
  "workspaces": {
    "Commerce": {
      "spaceId": "87654321",
      "sprintPatterns": ["\\d+ Commerce 1 \\(", "Sprint \\d+ \\("]
    }
  },
  "defaults": {
    "status": "ON DECK"
  },
  "ai": {
    "enabled": true,
    "generateTicketDescriptions": true
  },
  "circleci": {
    "apiToken": "CIRCLE_TOKEN"
  }
}
```

### CircleCI token

The `ci-status` and `ci-failure` commands need a CircleCI API token. You can provide it via:
- Config: `circleci.apiToken` in config.json
- Environment: `CIRCLECI_TOKEN` or `CIRCLE_TOKEN`

### Sprint folder detection

Sprint folders are matched by patterns and date ranges:
- `Sprint 20 (12/8 - 12/21)` - matches pattern, parses date range
- `99 Commerce 1 (12/8 - 12/21)` - same format with team name

The CLI finds the folder where today's date falls within the range.

## AI Features

AI is used only for ticket description generation during `workon start`:

| Feature | What it does |
|---------|--------------|
| Ticket description | Generates acceptance criteria from title |

PR descriptions are intended to be generated by Claude Code and passed to the workon CLI via command-line options. This allows Claude Code to use its full context (diff, commits, ticket info) to generate better descriptions.

AI features can be disabled in config.

## Development

After making changes to the source code:

```bash
# Compile TypeScript to JavaScript
npm run build

# If not already linked globally, link the CLI
npm link

# Lint
npm run lint
```

The `workon` command will now use the updated code.
