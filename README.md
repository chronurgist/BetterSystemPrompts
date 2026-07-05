# Better System Prompts

Pi extension that adds local-only project instructions.

## What it does

- Expands standalone `@path` references inside loaded context files before the agent starts.
- Looks for `AGENTS.local.md` next to each loaded context file.
- Injects each local file as an additional `<project_instructions>` block after its matching context file.

`AGENTS.local.md` is intended for machine- or developer-specific instructions that should not be committed.

## Install

From a local checkout:

```bash
pi install ./path/to/agents-local-support
```

Or try it for one run:

```bash
pi -e ./path/to/agents-local-support
```

## Development

This project uses Bun:

```bash
bun install
bun test
```
