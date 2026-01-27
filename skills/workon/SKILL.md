---
name: workon
description: Start work on a ClickUp ticket. Use when the user says "workon" followed by a ticket ID (e.g., "workon 86b7x5453").
argument-hint: <ticket-id>
allowed-tools: Bash(workon:*)
---

# Start Work on a ClickUp Ticket

When the user provides a ticket ID, run the workon command to create or checkout the branch for that ticket.

## Steps

1. Run the workon command with the ticket ID:
   ```bash
   workon $ARGUMENTS
   ```

2. After the branch is ready, automatically get the ticket context:
   ```bash
   workon ticket
   ```

3. Use the ticket information (title, description, acceptance criteria) to understand what the user is trying to accomplish.

## Notes

- The `workon <ticket-id>` command may prompt for user input if the branch already exists (to choose: checkout, recreate, or cancel)
- If the branch doesn't exist, it creates it automatically
- Always run `workon ticket` after to bring context into the session
