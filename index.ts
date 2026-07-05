import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildLocalBlock,
  expandAtRefs,
  insertAfterBlock,
  loadAndExpand,
  replaceBlockContent,
  rootToLeafDirs,
  stripHtmlComments,
  type WarnFn,
} from "./lib";

const LOCAL_FILENAME = "AGENTS.local.md";

interface ContextFile {
  path: string;
  content: string;
}

interface BeforeAgentStartEvent {
  systemPrompt: string;
  systemPromptOptions: {
    cwd: string;
    contextFiles?: ContextFile[];
  };
}

type BeforeAgentStartResult = { systemPrompt: string };

type BeforeAgentStartHandler = (
  event: BeforeAgentStartEvent,
  ctx?: BeforeAgentStartContext,
) =>
  | BeforeAgentStartResult
  | undefined
  | Promise<BeforeAgentStartResult | undefined>;

interface BeforeAgentStartContext {
  hasUI: boolean;
  ui: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
}

interface BeforeAgentStartApi {
  on(event: "before_agent_start", handler: BeforeAgentStartHandler): void;
}

export default function agentsLocalSupportExtension(
  pi: BeforeAgentStartApi,
): void {
  pi.on("before_agent_start", async (event, ctx) => {
    const contextFiles = event.systemPromptOptions.contextFiles ?? [];

    let systemPrompt = event.systemPrompt;

    const warn: WarnFn = ctx?.hasUI
      ? (message) => ctx.ui.notify(message, "warning")
      : (message) => console.warn(message);

    for (const file of contextFiles) {
      const stripped = stripHtmlComments(file.content);
      const expanded = expandAtRefs(stripped, dirname(file.path), 0, warn);
      if (expanded !== file.content) {
        systemPrompt = replaceBlockContent(systemPrompt, file.path, expanded);
      }
    }

    const contextDirs = contextFiles.map((file) => dirname(file.path));
    const cwdDirs = rootToLeafDirs(event.systemPromptOptions.cwd);
    const localDirs = [...new Set([...contextDirs, ...cwdDirs])];

    for (const dir of localDirs) {
      const localPath = join(dir, LOCAL_FILENAME);
      if (!existsSync(localPath)) continue;

      const expanded = loadAndExpand(localPath, dirname(localPath), 0, warn);
      if (expanded === undefined) continue;
      const block = buildLocalBlock(localPath, expanded);
      const matchingContextFile = contextFiles.find(
        (file) => dirname(file.path) === dir,
      );
      systemPrompt = matchingContextFile
        ? insertAfterBlock(systemPrompt, matchingContextFile.path, block)
        : `${systemPrompt}\n${block}`;
    }

    if (systemPrompt === event.systemPrompt) return;
    return { systemPrompt };
  });
}
