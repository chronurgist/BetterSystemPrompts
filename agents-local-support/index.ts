import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_DEPTH = 4;

interface ContextFile {
	path: string;
	content: string;
}

function siblingLocal(filePath: string): string | null {
	const candidate = resolve(dirname(filePath), "AGENTS.local.md");
	try {
		return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
	} catch {
		return null;
	}
}

function expandReferences(content: string, baseDir: string, depth: number): string {
	if (depth >= MAX_DEPTH) return content;

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

		const expanded = line.replace(/@(\S+)/g, (match, ref) => {
			const absPath = isAbsolute(ref) ? ref : resolve(baseDir, ref);
			try {
				if (!statSync(absPath).isFile()) return match;
				const refContent = readFileSync(absPath, "utf-8");
				return expandReferences(refContent, dirname(absPath), depth + 1);
			} catch {
				return match;
			}
		});
		result.push(expanded);
	}

	return result.join("\n");
}

export default function (pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		const contextFiles = event.systemPromptOptions.contextFiles;
		if (!contextFiles || contextFiles.length === 0) return;

		let prompt = event.systemPrompt;
		let offset = 0;

		for (const cf of contextFiles as ContextFile[]) {
			const idx = prompt.indexOf(cf.content, offset);
			if (idx === -1) continue;

			const localPath = siblingLocal(cf.path);
			if (!localPath) {
				offset = idx + cf.content.length;
				continue;
			}

			const localContent = readFileSync(localPath, "utf-8");
			const expandedContext = expandReferences(cf.content, dirname(cf.path), 0);
			const expandedLocal = expandReferences(localContent, dirname(localPath), 0);

			const before = prompt.slice(0, idx);
			const after = prompt.slice(idx + cf.content.length);
			const injection = expandedContext + "\n\n" + expandedLocal;

			prompt = before + injection + after;
			offset = before.length + injection.length;
		}

		return { systemPrompt: prompt };
	});
}
