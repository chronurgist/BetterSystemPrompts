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

## Quirks

A few behaviors that match Claude Code but aren't obvious from the feature list:

- **`@path` captures trailing punctuation.** The reference runs to the next whitespace, so `(@ref.txt)` tries to import a file literally named `ref.txt)`. If that file doesn't exist, the whole `(@ref.txt)` is left untouched — the paren isn't tidied up. To expand a path sitting next to punctuation, separate it with a space (`(@ref.txt )`). To keep any `@path` literal, wrap it in backticks (`` `@ref.txt` ``).
- **`~` needs a slash.** `@~/instructions.md` resolves from your home directory; `@~foo` is treated as a relative path named `~foo`, not a home path.
- **Missing or unreadable references are left as-is.** A path that doesn't exist, or points at a directory, stays literal (`@./missing.txt` stays `@./missing.txt`). No error is raised.
- **Recursion caps at 4 hops.** A reference nested 5 deep is left literal as `@...`, not expanded.
- **HTML comments are stripped from every loaded memory file** — context files, `AGENTS.local.md`, and `@path`-imported files — before they reach the model. Comments inside fenced code blocks (` ``` `) are preserved. This matches Claude Code, which strips `<!-- ... -->` from CLAUDE.md content to save context tokens.
- **The 200-line warning is advisory only.** Files longer than 200 lines log a warning to stderr; nothing is truncated or refused. Whether the warning is visible depends on how you run Pi (it may not surface in the TUI).
- **A `AGENTS.local.md` with no companion context file is appended to the end** of the prompt rather than inserted after a block.

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
