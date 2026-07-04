import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOCAL_FILENAME = "AGENTS.local.md";
const MAX_DEPTH = 4;

interface ContextFile {
	path: string;
	content: string;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandAtRefs(content: string, baseDir: string, depth = 0): string {
	if (depth > MAX_DEPTH) return content;

	const lines = content.split("\n");
	const result: string[] = [];
	let inFence = false;

	for (const line of lines) {
		if (line.trimStart().startsWith("```")) {
			inFence = !inFence;
			result.push(line);
			continue;
		}
		if (inFence) {
			result.push(line);
			continue;
		}

		const match = line.trim().match(/^@(\S+)$/);
		if (!match) {
			result.push(line);
			continue;
		}

		const refPath = match[1];
		const resolvedPath = isAbsolute(refPath) ? refPath : resolve(baseDir, refPath);
		if (!existsSync(resolvedPath)) {
			result.push(line);
			continue;
		}

		try {
			const refContent = readFileSync(resolvedPath, "utf-8");
			result.push(expandAtRefs(refContent, dirname(resolvedPath), depth + 1));
		} catch {
			result.push(line);
		}
	}

	return result.join("\n");
}

function replaceBlockContent(prompt: string, filePath: string, newContent: string): string {
	const open = `<project_instructions path="${filePath}">\n`;
	const close = "\n</project_instructions>";
	const regex = new RegExp(`(${escapeRegex(open)})[\\s\\S]*?(${escapeRegex(close)})`);
	return prompt.replace(regex, (_match, openTag, closeTag) => `${openTag}${newContent}${closeTag}`);
}

function insertAfterBlock(prompt: string, filePath: string, insertion: string): string {
	const regex = new RegExp(
		`(<project_instructions path="${escapeRegex(filePath)}">\\n[\\s\\S]*?\\n</project_instructions>\\n*)`,
	);
	return prompt.replace(regex, (match) => `${match}${insertion}`);
}

function buildLocalBlock(localPath: string, content: string): string {
	return `<project_instructions path="${localPath}">\n${content}\n</project_instructions>\n\n`;
}

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
