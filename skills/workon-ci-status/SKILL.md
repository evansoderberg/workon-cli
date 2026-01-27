---
name: workon-ci-status
description: Check CircleCI status for a branch and help fix CI failures.
argument-hint: [branch]
allowed-tools: Bash(workon:*), Read, Grep, Glob
---

# Check CircleCI Status

## Step 1: Check CI Status

```bash
workon ci-status $ARGUMENTS
```

This shows:
- All workflows and their status
- Individual job results (passed/failed/running/pending)
- For failed jobs: job number and link to CircleCI

## Step 2: Get Failure Details

If there are failed jobs, get the full output:

```bash
workon ci-failure [job-number]
```

- Without job number: gets details for the first failed job
- With job number: gets details for that specific job

This outputs the **full, untruncated** error output from the failed step.

## Step 3: Fix the Issue

After getting the failure output:

1. **Identify the error** - Look for the actual error message in the output
2. **Find the relevant file** - Use Grep/Glob to locate the failing code
3. **Read the file** - Understand the context around the failure
4. **Fix the issue** - Make the necessary code changes
5. **Verify** - Run tests locally if possible before pushing

## Common Failure Types

| Failure | How to identify | How to fix |
|---------|----------------|------------|
| Test failure | Look for "FAIL", assertion errors | Read the test file, check expected vs actual |
| Lint error | Look for eslint/rubocop errors | Run linter locally, fix violations |
| Type error | Look for TypeScript errors | Check type definitions and usage |
| Build error | Look for compilation failures | Check imports, syntax errors |
| Cypress failure | Look for timeout, element not found | Check selectors, add waits if needed |
