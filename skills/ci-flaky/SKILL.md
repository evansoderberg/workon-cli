---
name: ci-flaky
description: >
  Analyze flaky CI tests using CircleCI Insights. Use when investigating test
  flakiness, triaging CI failures, or deciding which flaky tests to fix next.
argument-hint: "[action] e.g. 'list', 'list --days 2 --job api', 'details', 'plan', 'plan --days 2 --job api'"
---

## Parse Arguments

- **`list`** or **no arguments** → List mode (summary only)
- **`details`** → Details mode (summary + failure messages)
- **`plan`** → Plan mode (fetch details, generate plan file, suggest ralph command)
- Any `--days N` or `--job <name>` flags are passed through to `workon ci-flaky`

All modes accept `--days N` and `--job <name>` filters.

---

## List Mode

Run `workon ci-flaky` with any filters from `$ARGUMENTS`:

```bash
workon ci-flaky $ARGUMENTS
```

Show the output to the user. This is the compact summary — no failure details.

---

## Details Mode

Run `workon ci-flaky --details` with any filters:

```bash
workon ci-flaky --details $ARGUMENTS
```

Show the output. This includes failure messages for each test, useful for quick triage.

---

## Plan Mode

This mode generates a plan file and sets up a ralph loop to fix flakes one at a time.

### Step 1: Fetch data

Run `workon ci-flaky --details` with any filters to get the full output including failure messages. Parse the output to understand which tests are flaky and what their errors are.

### Step 2: Generate the plan file

Create `flaky-test-plan.md` in the current directory. Structure it as a ralph-compatible task list:

```markdown
# Flaky Test Fix Plan

Generated: <today's date>
Window: <filter description, e.g. "last 2 days">
Total: <N> flaky test(s)

## Rules

- Fix ONE task per iteration, then stop.
- Read the spec file AND the implementation it tests to understand the code path.
- Only modify spec files. Do NOT touch application code unless there is a clear, confirmed production bug. If you suspect an app bug, skip the task and note it — do not change production code without explicit approval.
- After fixing, run the spec file to verify the fix works.
- Check the checkbox when done and add a brief note about what you changed.
- Common flake causes: timestamp ordering (use `id`-based assertions), `Time.now` without `freeze_time`, shared `let_it_be` state being mutated, missing sort before asserting order, database state leaking between tests.

## Tasks

- [ ] **[22x]** External::V1::Stores::MenuProducts::Get filters uses custom product type labels
  - Job: api
  - File: spec/lib/external/v1/stores/menu_products/get_spec.rb
  - Error:
    ```
    <first ~8 lines of the failure message>
    ```

- [ ] **[10x]** ...
```

Sort tasks by `times_flaked` descending (highest priority first). Include the error message for each test if available. If a test had no failure data, note that.

### Step 3: Confirm with the user

Show the user what was generated:

> Plan written to `flaky-test-plan.md` with N tasks.
>
> Start the fix loop:
> ```
> ralph -f ~/.claude/prompts/fix-flaky-tests.md -p "FLAKY FIXES COMPLETE"
> ```

**STOP. Do NOT start fixing tests yourself. Your only job is to generate the plan and output the command.**

---

## What CircleCI Considers "Flaky"

A test is flaky if it both passed and failed within the same commit during the rolling window (~14 days). The `times_flaked` count reflects how many times this occurred.

## Common Flake Root Causes

All fixes should target the spec file, not application code.

| Pattern | Symptom | Spec Fix |
|---------|---------|----------|
| Timestamp collision | `created_at`-based ordering fails | Use `id`-based assertions, or `travel_to` to space timestamps |
| Time-dependent assertion | `expect(updated_at).to have_changed` random | Wrap in `freeze_time` / `travel_to`, or assert value change not timestamp |
| Missing ORDER BY | Results in unpredictable order | Sort results in spec before asserting, or use `match_array` |
| Shared mutable state | `let_it_be` data mutated across tests | Use `let` instead, or `let_it_be` with `reload: true` |
| Database leakage | Extra records from other tests | Scope spec queries more tightly, use unique attrs |
| External service timing | HTTP/async races | Tighten mocks or add deterministic waits in spec |

## Tips

- A test with many flakes in a short period is likely a newly introduced flake — check recent commits to that file.
- Tests that flake exactly once may be transient infrastructure issues, not code bugs. Focus on repeat offenders.
- Use `workon ci-failure <job-number>` to get the full error output from a specific flake occurrence if the details from `--details` aren't enough.
