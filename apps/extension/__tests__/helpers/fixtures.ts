import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const fixturePagesDirectory = path.resolve(
  currentDirectory,
  "../../../../fixtures/pages"
);

export function resolveFixturePagePath(fileName: string): string {
  return path.resolve(fixturePagesDirectory, fileName);
}

export function readFixturePage(fileName: string): string {
  return readFileSync(resolveFixturePagePath(fileName), "utf8");
}
