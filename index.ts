import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	expandAtRefs,
	replaceBlockContent,
	insertAfterBlock,
	buildLocalBlock,
} from "./lib";

const LOCAL_FILENAME = "AGENTS.local.md";

export default function agentsLocalSupportExtension(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		const contextFiles = event.systemPromptOptions.contextFiles;
		if (!contextFiles || contextFiles.length === 0) return;

		let systemPrompt = event.systemPrompt;

		for (const file of contextFiles) {
			const expanded = expandAtRefs(file.content, dirname(file.path));
			if (expanded !== file.content) {
				systemPrompt = replaceBlockContent(systemPrompt, file.path, expanded);
			}
		}

		for (const file of contextFiles) {
			const localPath = join(dirname(file.path), LOCAL_FILENAME);
			if (!existsSync(localPath)) continue;

			try {
				const raw = readFileSync(localPath, "utf-8");
				const expanded = expandAtRefs(raw, dirname(localPath));
				const block = buildLocalBlock(localPath, expanded);
				systemPrompt = insertAfterBlock(systemPrompt, file.path, block);
			} catch {
				// Skip unreadable local files.
			}
		}

		if (systemPrompt === event.systemPrompt) return;
		return { systemPrompt };
	});
}
