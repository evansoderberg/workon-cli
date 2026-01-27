---
name: workon-pr
description: Create a pull request using the workon CLI. Use when the user says "workon pr", "create a PR", "open a PR", or indicates code is ready for review.
disable-model-invocation: true
allowed-tools: Bash(workon:*), Bash(gh:*), Bash(git:*), Bash(cat:*), Read
---

# Create a Pull Request

## Steps

1. **Gather context** by running these commands:
   - Read the PR template: `cat .github/PULL_REQUEST_TEMPLATE.md`
   - Get the diff: `git diff origin/HEAD...HEAD` or `git diff main...HEAD`
   - Get commit history: `git log --oneline origin/HEAD...HEAD` or `git log --oneline main...HEAD`
   - Extract ticket ID from branch name (format: `username/{ticketid}/...`)

2. **Offer code review** (ask the user):
   - Before creating the PR, ask if they'd like you to run a code review first
   - If yes, review the changes for issues, improvements, and potential bugs
   - Address any findings before proceeding

3. **Generate content** for each section (you are responsible for generating this):
   - **Title**: Concise description of the change (often matches ticket name)
   - **Summary**: 1-2 sentences describing what changed and why
   - **Description**: Detailed explanation referencing specific files/functions changed
   - **How to Test**: Step-by-step verification instructions with expected outcomes

4. **Get explicit user approval**:
   - Show the user the PR details (title, summary, description, testing instructions)
   - Ask: "Ready to create this PR and push to GitHub?"
   - **WAIT for explicit confirmation** (e.g., "yes", "go ahead", "create it")
   - Do NOT proceed until you receive explicit approval

5. **Create the PR** after receiving approval:
   ```bash
   workon pr -y --title "..." --summary "..." --ticket "..." --description "..." --testing "..."
   ```
   - Always use `-y` flag to skip confirmation (user already approved)
   - Add `--draft` if user asks for draft PR or mentions "draft", "WIP", "work in progress"
   - Ticket ID is auto-extracted from branch if not provided
   - Base branch is auto-detected (`main` or `master`)
   - Use `--base <branch>` to override if needed

## Important Notes

- Do NOT modify the "Best Practices" checklist section in the PR template
- The workon CLI fills in the PR template sections automatically
