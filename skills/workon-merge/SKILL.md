---
name: workon-merge
description: Merge a pull request and post a merge comment. Only use when explicitly requested.
disable-model-invocation: true
allowed-tools: Bash(workon:*)
---

# Merge Pull Request

**IMPORTANT**: Only run this when the user explicitly asks to merge.

## Pre-merge Checklist

Before merging, verify:
1. CI checks are passing: `workon pr-status`
2. Required approvals are received
3. User has explicitly confirmed they want to merge

## Steps

1. **Check PR status**:
   ```bash
   workon pr-status
   ```

2. **Ask for confirmation**:
   - Show the user the PR status
   - Ask: "Are you sure you want to merge this PR?"
   - Wait for explicit "yes" confirmation

3. **Merge** (only after confirmation):
   ```bash
   workon merge [pr-number]
   ```

## Never Auto-merge

This command should NEVER be run automatically. Always require explicit user confirmation.
