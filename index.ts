import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  ancestorDirs,
  buildLocalBlock,
  expandAtRefs,
  insertAfterBlock,
  replaceBlockContent,
  stripHtmlComments,
  warnIfLarge,
} from "./lib";

const LOCAL_FILENAME = "AGENTS.local.md";

export default function agentsLocalSupportExtension(pi: ExtensionAPI): void {
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
    const cwdDirs = ancestorDirs(event.systemPromptOptions.cwd);
    const localDirs = [...new Set([...contextDirs, ...cwdDirs])];

    for (const dir of localDirs) {
      const localPath = join(dir, LOCAL_FILENAME);
      if (!existsSync(localPath)) continue;

      try {
        const raw = readFileSync(localPath, "utf-8");
        warnIfLarge(localPath, raw);
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
