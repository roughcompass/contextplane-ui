import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoots = ["apps", "packages"];
const ignoredDirectories = new Set(["coverage", "dist", "node_modules"]);
const forbiddenTestDirectories = new Set(["__tests__", "test", "tests"]);
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"];
const testFilePattern = /^(?<stem>.+)\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(entryPath)));
    else files.push(entryPath);
  }

  return files;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const failures = [];
let checkedTests = 0;

for (const projectRoot of projectRoots) {
  const absoluteRoot = path.join(workspaceRoot, projectRoot);
  if (!(await exists(absoluteRoot))) continue;

  for (const filePath of await walk(absoluteRoot)) {
    const match = path.basename(filePath).match(testFilePattern);
    if (!match?.groups) continue;

    checkedTests += 1;
    const relativePath = path.relative(workspaceRoot, filePath);
    const segments = relativePath.split(path.sep);
    const sourceIndex = segments.indexOf("src");

    if (sourceIndex === -1) {
      failures.push(
        `${relativePath}: unit and component tests must live under the owning project's src directory.`,
      );
      continue;
    }

    const containingDirectories = segments.slice(sourceIndex + 1, -1);
    const forbiddenDirectory = containingDirectories.find((segment) =>
      forbiddenTestDirectories.has(segment),
    );

    if (forbiddenDirectory) {
      failures.push(
        `${relativePath}: do not use a ${forbiddenDirectory}/ test directory; place the test beside its source file.`,
      );
      continue;
    }

    const implementationExists = await Promise.any(
      sourceExtensions.map(async (extension) => {
        const candidate = path.join(path.dirname(filePath), `${match.groups.stem}${extension}`);
        if (await exists(candidate)) return candidate;
        throw new Error("missing");
      }),
    ).catch(() => undefined);

    if (!implementationExists) {
      failures.push(
        `${relativePath}: no colocated implementation named ${match.groups.stem}.{ts,tsx,js,jsx,mts,mjs,cts,cjs} was found.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Test colocation check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Test colocation check passed (${checkedTests} test files).`);
}
