import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The secret must never reach the browser. These checks read the source, so
// they fail on the change that would leak it rather than after it shipped.

const root = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (["node_modules", ".next", ".git"].includes(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(root).filter((path) => !path.includes(`${join(root, "tests")}`));

describe("credential isolation", () => {
  it("the API client is marked server-only", () => {
    expect(readFileSync(join(root, "lib/wfm.ts"), "utf8")).toMatch(/^import "server-only";$/m);
  });

  it("no Client Component imports the API client or reads the credentials", () => {
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      if (!/^["']use client["'];?/m.test(source)) continue;

      expect(source, path).not.toMatch(/@\/lib\/wfm|lib\/wfm/);
      expect(source, path).not.toMatch(/WFM_API_(KEY|SECRET)/);
    }
  });

  it("the credentials are never exposed as NEXT_PUBLIC_ variables", () => {
    for (const path of [...files, join(root, ".env.example")]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/NEXT_PUBLIC_WFM/);
    }
  });

  it(".env.example holds placeholders, and .env files are ignored by git", () => {
    expect(readFileSync(join(root, ".env.example"), "utf8")).toMatch(/^WFM_API_SECRET=your-api-secret$/m);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^\.env\*\.local$/m);
  });
});
