---
name: workon-comment
description: Add a comment to the current ClickUp ticket. Use when the user says "workon comment" or wants to add a comment to the ticket.
argument-hint: <comment text>
allowed-tools: Bash(workon:*)
---

# Add Comment to Ticket

Add a comment to the current ClickUp ticket:

```bash
workon comment "$ARGUMENTS"
```

If the user provides comment text, use it directly. If not, ask what they'd like to comment.

## Alternative: Pipe content

For longer comments or content from files:
```bash
echo "Comment content" | workon comment
```
