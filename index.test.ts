import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import agentsLocalSupportExtension from "./index";
import { captureWarningsAsync } from "./test-helpers";

type BeforeAgentStartHandler = (event: {
  systemPrompt: string;
  systemPromptOptions: {
    cwd: string;
    contextFiles?: Array<{ path: string; content: string }>;
  };
}) => Promise<{ systemPrompt: string } | undefined>;

let testDir: string;
let handler: BeforeAgentStartHandler;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "agents-local-support-index-test-"));

  agentsLocalSupportExtension({
    on(eventName, registeredHandler) {
      if (eventName === "before_agent_start") handler = registeredHandler;
    },
  });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("agentsLocalSupportExtension", () => {
  it("loads AGENTS.local.md from cwd even when Pi loaded no context files", async () => {
    writeFileSync(join(testDir, "AGENTS.local.md"), "local only");

    const result = await handler({
      systemPrompt: "base prompt",
      systemPromptOptions: { cwd: testDir, contextFiles: [] },
    });

    expect(result?.systemPrompt).toContain("local only");
    expect(result?.systemPrompt).toContain(join(testDir, "AGENTS.local.md"));
  });

  it("loads AGENTS.local.md from cwd when only a parent AGENTS.md was loaded", async () => {
    const subdir = join(testDir, "subdir");
    mkdirSync(subdir);
    const agentsPath = join(testDir, "AGENTS.md");
    writeFileSync(join(subdir, "AGENTS.local.md"), "subdir local");

    const result = await handler({
      systemPrompt: `<project_instructions path="${agentsPath}">\nparent\n</project_instructions>`,
      systemPromptOptions: {
        cwd: subdir,
        contextFiles: [{ path: agentsPath, content: "parent" }],
      },
    });

    expect(result?.systemPrompt).toContain("parent");
    expect(result?.systemPrompt).toContain("subdir local");
  });

  it("inserts companion AGENTS.local.md directly after its loaded context file", async () => {
    const agentsPath = join(testDir, "AGENTS.md");
    const localPath = join(testDir, "AGENTS.local.md");
    writeFileSync(localPath, "companion local");

    const result = await handler({
      systemPrompt: `<project_instructions path="${agentsPath}">\nproject\n</project_instructions>\n<other>later</other>`,
      systemPromptOptions: {
        cwd: testDir,
        contextFiles: [{ path: agentsPath, content: "project" }],
      },
    });

    expect(result?.systemPrompt).toBe(
      `<project_instructions path="${agentsPath}">\nproject\n</project_instructions>\n` +
        `<project_instructions path="${localPath}">\ncompanion local\n</project_instructions>\n\n` +
        `<other>later</other>`,
    );
  });

  it("strips HTML comments from AGENTS.local.md", async () => {
    writeFileSync(
      join(testDir, "AGENTS.local.md"),
      "visible <!-- hidden --> text",
    );

    const result = await handler({
      systemPrompt: "base prompt",
      systemPromptOptions: { cwd: testDir, contextFiles: [] },
    });

    expect(result?.systemPrompt).toContain("visible  text");
    expect(result?.systemPrompt).not.toContain("hidden");
  });

  it("strips HTML comments from loaded context files", async () => {
    const agentsPath = join(testDir, "AGENTS.md");
    const content = "project <!-- hidden --> instructions";

    const result = await handler({
      systemPrompt: `<project_instructions path="${agentsPath}">\n${content}\n</project_instructions>`,
      systemPromptOptions: {
        cwd: testDir,
        contextFiles: [{ path: agentsPath, content }],
      },
    });

    expect(result?.systemPrompt).toContain("project  instructions");
    expect(result?.systemPrompt).not.toContain("hidden");
  });

  it("warns when AGENTS.local.md exceeds 200 lines", async () => {
    const localPath = join(testDir, "AGENTS.local.md");
    writeFileSync(
      localPath,
      Array.from({ length: 201 }, () => "line").join("\n"),
    );
    const { warnings } = await captureWarningsAsync(() =>
      handler({
        systemPrompt: "base prompt",
        systemPromptOptions: { cwd: testDir, contextFiles: [] },
      }),
    );

    expect(warnings).toEqual([
      [
        `[better-system-prompts] ${localPath} has 201 lines (>200). Consider splitting into smaller files.`,
      ],
    ]);
  });
});
