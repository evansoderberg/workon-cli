---
name: workon-pr-status
description: Check the status of a pull request including CI checks and approvals.
argument-hint: [pr-number]
allowed-tools: Bash(workon:*)
---

# Check PR Status

Check the status of a pull request:

```bash
workon pr-status $ARGUMENTS
```

If no PR number is provided, it checks the PR for the current branch.

This shows:
- CI check status
- Review/approval status
- Merge readiness
