import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildLocalBlock,
  expandAtRefs,
  insertAfterBlock,
  largeFileWarning,
  replaceBlockContent,
  rootToLeafDirs,
  stripHtmlComments,
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
) =>
  | BeforeAgentStartResult
  | undefined
  | Promise<BeforeAgentStartResult | undefined>;

interface BeforeAgentStartApi {
  on(event: "before_agent_start", handler: BeforeAgentStartHandler): void;
}

export default function agentsLocalSupportExtension(
  pi: BeforeAgentStartApi,
): void {
  pi.on("before_agent_start", async (event) => {
    const contextFiles = event.systemPromptOptions.contextFiles ?? [];

    let systemPrompt = event.systemPrompt;

    for (const file of contextFiles) {
      const stripped = stripHtmlComments(file.content);
      const expanded = expandAtRefs(stripped, dirname(file.path));
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

      try {
        const raw = readFileSync(localPath, "utf-8");
        const warning = largeFileWarning(localPath, raw);
        if (warning) console.warn(warning);
        const stripped = stripHtmlComments(raw);
        const expanded = expandAtRefs(stripped, dirname(localPath));
        const block = buildLocalBlock(localPath, expanded);
        const matchingContextFile = contextFiles.find(
          (file) => dirname(file.path) === dir,
        );
        systemPrompt = matchingContextFile
          ? insertAfterBlock(systemPrompt, matchingContextFile.path, block)
          : `${systemPrompt}\n${block}`;
      } catch {
        // Skip unreadable local files.
      }
    }

    if (systemPrompt === event.systemPrompt) return;
    return { systemPrompt };
  });
}
