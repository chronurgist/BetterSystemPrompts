import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

export const MAX_DEPTH = 4;
export const SIZE_WARNING_THRESHOLD = 200;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveRefPath(refPath: string, baseDir: string): string {
  if (refPath.startsWith("~/")) {
    return join(homedir() ?? "", refPath.slice(2));
  }

  return isAbsolute(refPath) ? refPath : resolve(baseDir, refPath);
}

export function stripHtmlComments(content: string): string {
  return mapProseSegments(content, (text) =>
    text.replace(/<!--[\s\S]*?-->/g, ""),
  );
}

export function largeFileWarning(
  filePath: string,
  content: string,
): string | undefined {
  const lineCount = content.split("\n").length;
  if (lineCount <= SIZE_WARNING_THRESHOLD) return;

  return `[better-system-prompts] ${filePath} has ${lineCount} lines (>200). Consider splitting into smaller files.`;
}

function mapProseSegments(
  content: string,
  transform: (text: string) => string,
): string {
  const chunks = content.match(/.*(?:\n|$)/g) ?? [];
  const segments: Array<{ text: string; inFence: boolean }> = [];
  let current: string[] = [];
  let inFence = false;

  for (const chunk of chunks) {
    if (chunk === "") continue;

    const chunkInFence = inFence;
    current.push(chunk);

    if (chunk.trimStart().startsWith("```")) {
      segments.push({ text: current.join(""), inFence: chunkInFence });
      current = [];
      inFence = !inFence;
    }
  }

  if (current.length > 0) {
    segments.push({ text: current.join(""), inFence });
  }

  return segments
    .map((segment) =>
      segment.inFence ? segment.text : transform(segment.text),
    )
    .join("");
}

export function expandAtRefs(
  content: string,
  baseDir: string,
  depth = 0,
): string {
  if (depth > MAX_DEPTH) return content;

  return mapProseLines(content, (line) =>
    expandInlineRefs(line, baseDir, depth),
  );
}

export function loadAndExpand(
  filePath: string,
  baseDir: string,
  depth = 0,
): string | undefined {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const warning = largeFileWarning(filePath, raw);
    if (warning) console.warn(warning);
    const content = stripHtmlComments(raw);
    return expandAtRefs(content, baseDir, depth);
  } catch {
    // Leave unreadable files unchanged.
  }
}

function mapProseLines(
  content: string,
  transform: (line: string) => string,
): string {
  return mapProseSegments(content, (text) =>
    text.split("\n").map(transform).join("\n"),
  );
}

function expandInlineRefs(
  text: string,
  baseDir: string,
  depth: number,
): string {
  const backtickRanges = inlineBacktickRanges(text);
  const isInsideBacktick = (position: number) =>
    backtickRanges.some(([start, end]) => position >= start && position < end);

  const refRegex = /@(\S+)/g;
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(refRegex)) {
    if (isInsideBacktick(match.index)) continue;

    const refPath = match[1];
    const resolvedPath = resolveRefPath(refPath, baseDir);
    if (!existsSync(resolvedPath)) continue;

    const expanded = loadAndExpand(
      resolvedPath,
      dirname(resolvedPath),
      depth + 1,
    );
    if (expanded === undefined) continue;
    result += text.slice(lastIndex, match.index) + expanded;
    lastIndex = match.index + match[0].length;
  }

  return result + text.slice(lastIndex);
}

function inlineBacktickRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const backtickRegex = /`[^`]*`/g;
  for (const match of text.matchAll(backtickRegex)) {
    ranges.push([match.index, match.index + match[0].length]);
  }

  return ranges;
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

export function rootToLeafDirs(cwd: string): string[] {
  const dirs: string[] = [];
  let current = resolve(cwd);
  const root = parse(current).root;

  while (true) {
    dirs.unshift(current);
    if (current === root) return dirs;
    current = dirname(current);
  }
}
