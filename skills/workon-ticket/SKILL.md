---
name: workon-ticket
description: Get context on the current ClickUp ticket. Use when the user asks "what am I working on?", needs ticket context, or says "workon ticket".
allowed-tools: Bash(workon:*)
---

# Get Ticket Context

Run this command to get information about the current task from ClickUp:

```bash
workon ticket
```

This outputs:
- Ticket title
- Status
- URL
- Description (including acceptance criteria)

## When to Use

- Starting a new coding session on an existing branch
- The user asks "what am I working on?" or similar
- You need to understand requirements before implementing
- The user explicitly says "workon ticket"

Use the ticket information to understand what the user is trying to accomplish and any acceptance criteria or requirements.
