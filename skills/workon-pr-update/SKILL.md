---
name: workon-pr-update
description: Update sections of an existing pull request. Use when the user wants to improve or fix the PR description.
argument-hint: [--summary "..." --description "..." --testing "..."]
allowed-tools: Bash(workon:*), Bash(gh:*)
---

# Update Pull Request

Update specific sections of an existing PR.

## Steps

1. **Check current PR body**:
   ```bash
   gh pr view --json body
   ```

2. **Update relevant sections**:
   ```bash
   workon pr-update --summary "..." --description "..." --testing "..."
   ```

   Only include the flags for sections you're updating.

## Available Flags

- `--summary "..."` - Update the summary section
- `--description "..."` - Update the description section
- `--testing "..."` - Update the testing instructions
- `--ticket <id>` - Update the ticket reference

## Pipe Content

For longer content, pipe it to a specific section:
```bash
echo "content" | workon pr-update --description -
```
