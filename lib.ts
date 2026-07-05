import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, parse, resolve } from "node:path";

export const MAX_DEPTH = 4;

export interface ContextFile {
  path: string;
  content: string;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expandAtRefs(
  content: string,
  baseDir: string,
  depth = 0,
): string {
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
    const resolvedPath = isAbsolute(refPath)
      ? refPath
      : resolve(baseDir, refPath);
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

export function replaceBlockContent(
  prompt: string,
  filePath: string,
  newContent: string,
): string {
  const open = `<project_instructions path="${filePath}">\n`;
  const close = "\n</project_instructions>";
  const regex = new RegExp(
    `(${escapeRegex(open)})[\\s\\S]*?(${escapeRegex(close)})`,
  );
  return prompt.replace(
    regex,
    (_match, openTag, closeTag) => `${openTag}${newContent}${closeTag}`,
  );
}

export function insertAfterBlock(
  prompt: string,
  filePath: string,
  insertion: string,
): string {
  const regex = new RegExp(
    `(<project_instructions path="${escapeRegex(filePath)}">\\n[\\s\\S]*?\\n</project_instructions>\\n*)`,
  );
  return prompt.replace(regex, (match) => `${match}${insertion}`);
}

export function buildLocalBlock(localPath: string, content: string): string {
  return `<project_instructions path="${localPath}">\n${content}\n</project_instructions>\n\n`;
}

export function ancestorDirs(cwd: string): string[] {
  const dirs: string[] = [];
  let current = resolve(cwd);
  const root = parse(current).root;

  while (true) {
    dirs.unshift(current);
    if (current === root) return dirs;
    current = dirname(current);
  }
}
