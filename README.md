# Better System Prompts

Pi extension that adds Claude Code-style memory features: `@path` imports and `*.local.md` files.

## What it does

- Expands `@path` references (standalone or inline) inside loaded context files before the agent starts.
- Looks for `AGENTS.local.md` next to each loaded context file.
- Injects each local file as an additional `<project_instructions>` block after its matching context file.

`AGENTS.local.md` is intended for machine- or developer-specific instructions that should not be committed.

## Claude Code Compatibility

This extension implements two features from [Claude Code's memory system](https://code.claude.com/docs/en/memory#choose-where-to-put-claude-md-files):

### `@path` Imports

From the Claude Code docs:

> CLAUDE.md files can import additional files using `@path/to/import` syntax. Imported files are expanded and loaded into context at launch alongside the CLAUDE.md that references them.
>
> Both relative and absolute paths are allowed. Relative paths resolve relative to the file containing the import, not the working directory. Imported files can recursively import other files, with a maximum depth of four hops.
>
> Import parsing skips Markdown code spans and fenced code blocks. To mention a path in your CLAUDE.md without importing it, wrap it in backticks.

This extension matches that behavior exactly:

- `@path` references are expanded inline (standalone or mid-sentence) to file contents
- Relative paths resolve from the containing file's directory
- Maximum recursion depth of 4
- Skips `@path` inside fenced code blocks and backticks

### `*.local.md` Files

From the Claude Code docs:

> For private per-project preferences that shouldn't be checked into version control, create a `CLAUDE.local.md` at the project root. It loads alongside `CLAUDE.md` and is treated the same way. Add `CLAUDE.local.md` to your `.gitignore` so it isn't committed.

This extension implements the same pattern as `AGENTS.local.md`:

- Loaded automatically alongside each context file
- Inserted directly after its companion `AGENTS.md`
- Also checks ancestor directories up to cwd
- Intended for `.gitignore`-d personal/machine-specific instructions

### Complementary Extensions

For a more complete Claude Code-style experience, pair this with:

- **[pi-skill-interpolation](https://github.com/joelhooks/pi-skill-interpolation)** — Dynamic shell interpolation in skills. Embed `` !`command` `` in your SKILL.md and the output replaces the placeholder before the model sees it. Compatible with [Claude Code's skill interpolation syntax](https://x.com/lydiahallie/status/2034337963820327017).

  ```bash
  pi install git:github.com/joelhooks/pi-skill-interpolation
  ```

## Install

From GitHub:

```bash
pi install git:github.com/chronurgist/BetterSystemPrompts
```

From a local checkout:

```bash
git clone https://github.com/chronurgist/BetterSystemPrompts.git
pi install ./BetterSystemPrompts
```

Or try it for one run:

```bash
pi -e git:github.com/chronurgist/BetterSystemPrompts
```

## Development

This project uses Bun:

```bash
bun install
bun test
```
