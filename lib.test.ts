import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildLocalBlock,
  expandAtRefs,
  insertAfterBlock,
  replaceBlockContent,
} from "./lib";

// ---------------------------------------------------------------------------
// expandAtRefs — file-backed tests using a temporary directory
// ---------------------------------------------------------------------------

const testDir = join(tmpdir(), `better-system-prompts-test-${process.pid}`);

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("expandAtRefs", () => {
  it("returns content unchanged when there are no @path references", () => {
    const input = "Hello world\nThis is a test\nNo references here.";
    expect(expandAtRefs(input, testDir)).toBe(input);
  });

  it("replaces standalone @path with file contents", () => {
    const refPath = join(testDir, "hello.txt");
    writeFileSync(refPath, "inlined content");
    const input = `Some text\n@${refPath}\nMore text`;
    expect(expandAtRefs(input, testDir)).toBe(
      "Some text\ninlined content\nMore text",
    );
  });

  it("handles multiple @path references on separate lines", () => {
    const ref1 = join(testDir, "multi1.txt");
    const ref2 = join(testDir, "multi2.txt");
    writeFileSync(ref1, "first");
    writeFileSync(ref2, "second");
    const input = `@${ref1}\n@${ref2}`;
    expect(expandAtRefs(input, testDir)).toBe("first\nsecond");
  });

  it("expands @path inside a sentence", () => {
    const refPath = join(testDir, "sentence_ref.txt");
    writeFileSync(refPath, "inline content");
    const input = `Consider the file @${refPath} for reference.`;
    expect(expandAtRefs(input, testDir)).toBe(
      "Consider the file inline content for reference.",
    );
  });

  it("expands multiple @path references on one line", () => {
    const ref1 = join(testDir, "inline_multi1.txt");
    const ref2 = join(testDir, "inline_multi2.txt");
    writeFileSync(ref1, "first");
    writeFileSync(ref2, "second");
    const input = `Read @${ref1} and @${ref2}`;
    expect(expandAtRefs(input, testDir)).toBe("Read first and second");
  });

  it("leaves @path inside backticks unchanged", () => {
    const refPath = join(testDir, "btick_ref.txt");
    writeFileSync(refPath, "leaked");
    const input = `Use \`@${refPath}\` as a reference.`;
    expect(expandAtRefs(input, testDir)).toBe(input);
  });

  it("leaves @path with trailing characters unchanged", () => {
    const refPath = join(testDir, "trailing.txt");
    writeFileSync(refPath, "content");
    const input = `@${refPath},`;
    expect(expandAtRefs(input, testDir)).toBe(input);
  });

  it("does not expand references inside fenced code blocks", () => {
    const refPath = join(testDir, "secret.txt");
    writeFileSync(refPath, "should not appear");
    const input = `Before\n\`\`\`\n@${refPath}\n\`\`\`\nAfter`;
    const result = expandAtRefs(input, testDir);
    expect(result).toBe(input);
  });

  it("toggles back out of fenced code blocks after closing fence", () => {
    const refPath = join(testDir, "after_fence.txt");
    writeFileSync(refPath, "expanded");
    const input = `\`\`\`\nsome code\n\`\`\`\n@${refPath}`;
    const result = expandAtRefs(input, testDir);
    expect(result).toBe("```\nsome code\n```\nexpanded");
  });

  it("resolves relative paths from baseDir", () => {
    const subDir = join(testDir, `sub_${process.pid}`);
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, "ref.txt"), "from sub");
    const input = "@ref.txt";
    expect(expandAtRefs(input, subDir)).toBe("from sub");
  });

  it("resolves absolute paths", () => {
    const refPath = join(testDir, "abs.txt");
    writeFileSync(refPath, "absolute content");
    const input = `@${refPath}`;
    expect(expandAtRefs(input, testDir)).toBe("absolute content");
  });

  it("expands up to 4 levels of recursion", () => {
    const a = join(testDir, "rec_a.txt");
    const b = join(testDir, "rec_b.txt");
    const c = join(testDir, "rec_c.txt");
    const d = join(testDir, "rec_d.txt");
    writeFileSync(a, `@${b}`);
    writeFileSync(b, `@${c}`);
    writeFileSync(c, `@${d}`);
    writeFileSync(d, "leaf");
    const input = `@${a}`;
    expect(expandAtRefs(input, testDir)).toBe("leaf");
  });

  it("stops expanding at 5 levels of recursion and leaves ref as @path", () => {
    const a = join(testDir, "deep_a.txt");
    const b = join(testDir, "deep_b.txt");
    const c = join(testDir, "deep_c.txt");
    const d = join(testDir, "deep_d.txt");
    const e = join(testDir, "deep_e.txt");
    const f = join(testDir, "deep_f.txt");
    writeFileSync(a, `@${b}`);
    writeFileSync(b, `@${c}`);
    writeFileSync(c, `@${d}`);
    writeFileSync(d, `@${e}`);
    writeFileSync(e, `@${f}`);
    writeFileSync(f, "bottom");
    const input = `@${a}`;
    const result = expandAtRefs(input, testDir);
    expect(result).toContain(`@${f}`);
    expect(result).not.toContain("bottom");
  });

  it("leaves missing references unchanged", () => {
    const input = "@/nonexistent/file.txt";
    expect(expandAtRefs(input, testDir)).toBe(input);
  });

  it("leaves directory paths (unreadable as text) unchanged", () => {
    const dirPath = join(testDir, "a_directory");
    mkdirSync(dirPath, { recursive: true });
    const input = `@${dirPath}`;
    expect(expandAtRefs(input, testDir)).toBe(input);
  });

  it("handles empty content", () => {
    expect(expandAtRefs("", testDir)).toBe("");
  });

  it("handles content with only newlines", () => {
    expect(expandAtRefs("\n\n", testDir)).toBe("\n\n");
  });

  it("expands references recursively from different base directories", () => {
    const subDir = join(testDir, `nested_${process.pid}`);
    mkdirSync(subDir, { recursive: true });
    const inner = join(subDir, "inner.txt");
    writeFileSync(inner, "deeply nested");
    const middle = join(subDir, "middle.txt");
    writeFileSync(middle, `@inner.txt`);
    const input = "@middle.txt";
    expect(expandAtRefs(input, subDir)).toBe("deeply nested");
  });
});

// ---------------------------------------------------------------------------
// replaceBlockContent
// ---------------------------------------------------------------------------

describe("replaceBlockContent", () => {
  it("replaces content between project_instructions tags", () => {
    const prompt =
      '<project_instructions path="/a/b">\nold content\n</project_instructions>';
    const result = replaceBlockContent(prompt, "/a/b", "new content");
    expect(result).toBe(
      '<project_instructions path="/a/b">\nnew content\n</project_instructions>',
    );
  });

  it("handles special regex characters in file path", () => {
    const path = "/a/b.c[d]";
    const prompt = `<project_instructions path="${path}">\nold\n</project_instructions>`;
    const result = replaceBlockContent(prompt, path, "new");
    expect(result).toBe(
      `<project_instructions path="${path}">\nnew\n</project_instructions>`,
    );
  });

  it("returns prompt unchanged when path does not match", () => {
    const prompt =
      '<project_instructions path="/a/b">\nold\n</project_instructions>';
    const result = replaceBlockContent(prompt, "/x/y", "new");
    expect(result).toBe(prompt);
  });

  it("preserves multiline new content", () => {
    const prompt =
      '<project_instructions path="/a/b">\nold\n</project_instructions>';
    const result = replaceBlockContent(prompt, "/a/b", "new1\nnew2");
    expect(result).toBe(
      '<project_instructions path="/a/b">\nnew1\nnew2\n</project_instructions>',
    );
  });

  it("replaces content with empty string", () => {
    const prompt =
      '<project_instructions path="/a/b">\nstuff\n</project_instructions>';
    const result = replaceBlockContent(prompt, "/a/b", "");
    expect(result).toBe(
      '<project_instructions path="/a/b">\n\n</project_instructions>',
    );
  });
});

// ---------------------------------------------------------------------------
// insertAfterBlock
// ---------------------------------------------------------------------------

describe("insertAfterBlock", () => {
  it("inserts content after the matching block", () => {
    const prompt =
      '<project_instructions path="/a/b">\ncontent\n</project_instructions>\n';
    const insertion = "<new>block</new>\n";
    const result = insertAfterBlock(prompt, "/a/b", insertion);
    expect(result).toBe(
      '<project_instructions path="/a/b">\ncontent\n</project_instructions>\n<new>block</new>\n',
    );
  });

  it("handles no trailing newline after closing tag", () => {
    const prompt =
      '<project_instructions path="/a/b">\ncontent\n</project_instructions>';
    const insertion = "<new>block</new>\n";
    const result = insertAfterBlock(prompt, "/a/b", insertion);
    expect(result).toBe(
      '<project_instructions path="/a/b">\ncontent\n</project_instructions><new>block</new>\n',
    );
  });

  it("handles multiple trailing newlines", () => {
    const prompt =
      '<project_instructions path="/a/b">\ncontent\n</project_instructions>\n\n\n';
    const insertion = "inserted";
    const result = insertAfterBlock(prompt, "/a/b", insertion);
    expect(result).toBe(
      '<project_instructions path="/a/b">\ncontent\n</project_instructions>\n\n\ninserted',
    );
  });
});

// ---------------------------------------------------------------------------
// buildLocalBlock
// ---------------------------------------------------------------------------

describe("buildLocalBlock", () => {
  it("builds a project_instructions block with content", () => {
    const result = buildLocalBlock("/a/b/AGENTS.local.md", "content here");
    expect(result).toBe(
      '<project_instructions path="/a/b/AGENTS.local.md">\ncontent here\n</project_instructions>\n\n',
    );
  });

  it("builds a block with multiline content", () => {
    const result = buildLocalBlock("/x/y.md", "line1\nline2");
    expect(result).toBe(
      '<project_instructions path="/x/y.md">\nline1\nline2\n</project_instructions>\n\n',
    );
  });
});
