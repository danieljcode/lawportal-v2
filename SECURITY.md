# Security

## Reporting a problem

Please report security problems privately, not in a public issue: use **Report a vulnerability**
on this repository's **Security** tab (GitHub's private vulnerability reporting). Say what you
found, how to reproduce it, and what it lets someone do. You'll get a reply within a week.

Please don't test against the hosted app beyond what's needed to show the problem, and never read,
change or delete other people's sync data.

## What's in scope

- The web app and its API routes (`src/app/api`): sync codes and sync data. (`.docx` files are built in the browser.)
- The build and CI scripts in this repository.

The court forms and the penal code the hosted app shows aren't in this repository; they're private
data loaded at build time.
