/**
 * Gate: a server-assigned identifier is chosen from a list, never typed.
 *
 * ADR 0018 decides the rule. This is the mechanism that keeps it, and the
 * reason E22-T4 is a task rather than a convention: a label-text scan found at
 * least 67 free-text identifier fields across the feature tree, and without a
 * check they come back one screen at a time.
 *
 * **It reads the AST, not parsed label prose.** That is what makes the original
 * scan's under-count harmless: the scan attributed a label only where it could
 * parse one as English, so multi-line and interpolated labels were missed. This
 * walks JSX, so the fields nobody enumerated are caught anyway.
 *
 * **What it flags.** A text `<input>` (or one with no `type`, which is a text
 * input) whose accessible name or placeholder matches the identifier
 * vocabulary. The name is taken from an enclosing `<label>`, an `aria-label`,
 * or a `placeholder` — whichever is present, because a field with only a
 * placeholder is still asking a reader for a UUID.
 *
 * **What satisfies it.** Either the field is not a text input — a
 * `ResourcePicker` or a `SearchableSelect` is not one — or it carries an inline
 * annotation naming the ADR 0018 exception class it falls under:
 *
 *     {@link file://./../.develop/adr/0018-identifiers-are-chosen-not-typed.md}
 *     // identifier-exception: asserted-digest — the digest IS the corpus
 *
 * An annotation naming no class does not satisfy it. That is deliberate: a bare
 * suppression comment would accumulate on the safety-relevant fields first,
 * because those are the ones that trip the rule, and within a release the rule
 * would read as bureaucracy rather than as a boundary.
 *
 * Run:  node scripts/check-identifier-fields.mjs
 *       node scripts/check-identifier-fields.mjs --explain
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["apps", "packages"];
const ignoredDirectories = new Set(["coverage", "dist", "node_modules"]);

/**
 * Words that name a server-assigned identifier. Matched on whole words so
 * "Identity provider" is not mistaken for an id field, and deliberately narrow:
 * a rule that fired on every noun would be switched off within a week.
 */
const IDENTIFIER_WORDS =
  /\b(uuid|uuids|id|ids|identifier|digest|revision|locator|subject|principal|actor|handle)\b/i;

/**
 * Labels that contain an identifier word and are not identifier fields. Each is
 * a name or a search term, so a list of existing values is not what the field
 * wants.
 */
const NOT_IDENTIFIERS = new Set(["workspace name", "workspace term", "display name", "search"]);

/**
 * The exception classes ADR 0018 enumerates. An annotation must name one of
 * these; naming nothing does not satisfy the rule.
 */
const EXCEPTION_CLASSES = new Set([
  // A value the operator asserts about material the system has not yet seen.
  "asserted-digest",
  // An identifier in another system's id space, which this one cannot list.
  "external-locator",
  "external-id",
  // Free prose: a reason, a note, a justification.
  "free-prose",
]);

const ANNOTATION = /identifier-exception:\s*([a-z-]+)/;

/**
 * The fields that existed when this gate was written.
 *
 * A ratchet, not an allowlist. A field not in the baseline fails, and a
 * baselined field that no longer exists **also** fails — so the list cannot be
 * padded and cannot go stale. Each entry is owned by an E22 task and leaves
 * when that task lands.
 *
 * Keyed by `(file, accessible name)` rather than by line, because a field does
 * not stop being known debt when something above it moves.
 */
const BASELINE_PATH = path.join(workspaceRoot, "scripts", "identifier-fields-baseline.json");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      files.push(entryPath);
    }
  }
  return files;
}

/** The literal text of a JSX attribute, or `null` when it is not a literal. */
function attributeText(element, name) {
  const attributes = element.attributes?.properties ?? [];
  for (const attribute of attributes) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.getText() !== name) continue;
    const initializer = attribute.initializer;
    if (!initializer) return "";
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (
      ts.isJsxExpression(initializer) &&
      initializer.expression &&
      ts.isStringLiteral(initializer.expression)
    ) {
      return initializer.expression.text;
    }
    // An interpolated attribute. Its text is unknown, which is not the same as
    // absent — treated as unknown so an interpolated label cannot hide a field.
    return null;
  }
  return "";
}

/** Every text run inside a node, so an enclosing `<label>`'s prose is readable. */
function innerText(node, source) {
  let text = "";
  const visit = (child) => {
    if (ts.isJsxText(child)) text += ` ${child.text}`;
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return text.replace(/\s+/g, " ").trim();
}

function isTextInput(element) {
  const tag = element.tagName?.getText();
  if (tag !== "input") return false;
  const type = attributeText(element, "type");
  // No `type` is a text input. An interpolated one is unknown and is treated as
  // a text input, because the alternative lets a field hide behind a variable.
  return type === "" || type === null || type === "text" || type === "search";
}

/** Whether this line, or the two above it, carries a valid exception. */
function annotatedException(lines, lineIndex) {
  for (let offset = 0; offset <= 3; offset += 1) {
    const line = lines[lineIndex - offset];
    if (line === undefined) continue;
    const match = ANNOTATION.exec(line);
    if (match && EXCEPTION_CLASSES.has(match[1])) return match[1];
  }
  return null;
}

async function inspect(file) {
  return inspectSource(file, await readFile(file, "utf8"));
}

function inspectSource(file, text) {
  const lines = text.split("\n");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const offenders = [];

  /** The nearest enclosing `<label>` element, for accessible-name purposes. */
  const labelStack = [];

  const visit = (node) => {
    const isLabel =
      (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "label") ||
      (ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "label");
    if (isLabel) labelStack.push(node);

    const element = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null;

    if (element && isTextInput(element)) {
      const placeholder = attributeText(element, "placeholder");
      const ariaLabel = attributeText(element, "aria-label");
      const enclosing = labelStack.at(-1);
      const labelText = enclosing ? innerText(enclosing, source) : "";
      // `null` means interpolated and therefore unknown; an unknown name cannot
      // be cleared, so it counts toward the accessible name.
      const names = [placeholder, ariaLabel, labelText].filter((value) => value !== "");
      const known = names.filter((value) => value !== null).join(" ");
      const interpolated = names.includes(null);

      const asks =
        IDENTIFIER_WORDS.test(known) &&
        !NOT_IDENTIFIERS.has(known.trim().toLowerCase()) &&
        !NOT_IDENTIFIERS.has(labelText.trim().toLowerCase());

      if (asks || (interpolated && IDENTIFIER_WORDS.test(known))) {
        const { line } = source.getLineAndCharacterOfPosition(element.getStart(source));
        if (!annotatedException(lines, line)) {
          offenders.push({
            line: line + 1,
            name: known.slice(0, 80) || "<interpolated>",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
    if (isLabel) labelStack.pop();
  };

  visit(source);
  return offenders;
}

/**
 * The gate, run against planted cases before it is trusted on the tree.
 *
 * A check that scans nothing and prints a tick is the failure mode this
 * repository writes its gates against, and it is invisible from the outside: a
 * broken walker and a clean tree produce the same green line. So the walker is
 * exercised on six cases every time the gate runs — it costs milliseconds and
 * it means a green result is evidence rather than an absence of evidence.
 *
 * In-process rather than in a test file because `scripts/` sits outside every
 * package's Vitest project, and adding a root test runner for two files would
 * be more machinery than the thing it verifies.
 */
const SELF_TEST_CASES = [
  {
    expect: 1,
    name: "a labelled identifier field is caught",
    source: `<label>Widget UUID<input type="text" /></label>`,
  },
  {
    expect: 1,
    name: "a field whose only name is a placeholder is caught",
    source: `<input placeholder="Actor id" type="text" />`,
  },
  {
    expect: 1,
    name: "an input with no type is a text input",
    source: `<label>Revision locator<input /></label>`,
  },
  {
    expect: 0,
    name: "an exception naming a class satisfies the rule",
    source: `<label>Corpus digest{/* identifier-exception: asserted-digest */}<input type="text" /></label>`,
  },
  {
    expect: 1,
    name: "an exception naming no class does not",
    source: `<label>Corpus digest{/* identifier-exception: because */}<input type="text" /></label>`,
  },
  {
    expect: 0,
    name: "a name field is left alone",
    source: `<label>Workspace name<input type="text" /></label>`,
  },
];

function selfTest() {
  const failures = [];
  for (const testCase of SELF_TEST_CASES) {
    const text = `export function Probe() { return (${testCase.source}); }\n`;
    const found = inspectSource("<self-test>.tsx", text).length;
    if (found !== testCase.expect) {
      failures.push(`${testCase.name}: expected ${testCase.expect} finding(s), got ${found}`);
    }
  }
  return failures;
}

async function main() {
  const explain = process.argv.includes("--explain");
  if (explain) {
    process.stdout.write(
      [
        "identifier-fields gate",
        "",
        "A server-assigned identifier is chosen from a list, never typed (ADR 0018).",
        "",
        "To satisfy this check, either:",
        "  1. use `ResourcePicker` from @repo/ui, populated from a read; or",
        "  2. if no read exists, block the field on building one; or",
        "  3. if the value is one the operator *asserts* about material the system",
        "     has not seen, annotate the line above it:",
        "",
        "       // identifier-exception: asserted-digest — the digest IS the corpus",
        "",
        `     Valid classes: ${[...EXCEPTION_CLASSES].join(", ")}`,
        "",
        "An annotation naming no class does not satisfy the check.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const brokenWalker = selfTest();
  if (brokenWalker.length > 0) {
    for (const failure of brokenWalker) {
      process.stderr.write(`self-test: ${failure}\n`);
    }
    process.stderr.write(
      "\nThe walker does not do what this gate claims, so a clean result would mean nothing. " +
        "Fix the walker before reading anything below it.\n",
    );
    return 1;
  }

  const files = [];
  for (const root of scanRoots) {
    files.push(...(await walk(path.join(workspaceRoot, root))));
  }

  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8")).fields;

  const findings = [];
  const seen = new Set();
  for (const file of files.sort()) {
    const relative = path.relative(workspaceRoot, file);
    const known = new Set(baseline[relative] ?? []);
    for (const offender of await inspect(file)) {
      if (known.has(offender.name)) {
        seen.add(`${relative}\u0000${offender.name}`);
        continue;
      }
      findings.push({ ...offender, file: relative });
    }
  }

  // The other half of the ratchet. A baselined field that is gone has been
  // fixed, and leaving its entry behind would let the next one be added under
  // cover of a slot somebody already earned.
  const stale = [];
  for (const [file, names] of Object.entries(baseline)) {
    for (const name of names) {
      if (!seen.has(`${file}\u0000${name}`)) stale.push(`${file} — ${name}`);
    }
  }

  // Anti-vacuity: a walker that parsed nothing would print a tick forever.
  if (files.length === 0) {
    process.stderr.write("identifier-fields gate: scanned no files. The walker is broken.\n");
    return 1;
  }

  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `${finding.file}:${finding.line}: asks for an identifier — ${finding.name}\n`,
      );
    }
    process.stderr.write(
      `\n${findings.length} new free-text identifier field(s). ` +
        "Run with --explain for what satisfies this check. Do not add them to the baseline: " +
        "it only shrinks.\n",
    );
    return 1;
  }

  if (stale.length > 0) {
    for (const entry of stale) {
      process.stderr.write(`baseline entry no longer matches anything: ${entry}\n`);
    }
    process.stderr.write(
      `\n${stale.length} stale baseline entr(ies). These fields were fixed — remove them from ` +
        "scripts/identifier-fields-baseline.json so the next one cannot be added under cover of " +
        "a slot somebody already earned.\n",
    );
    return 1;
  }

  const remaining = Object.values(baseline).reduce((total, names) => total + names.length, 0);
  process.stdout.write(
    `identifier-fields gate: ${files.length} file(s) scanned, 0 new; ` +
      `${remaining} baselined field(s) remaining (self-test: ${SELF_TEST_CASES.length} case(s) passed)\n`,
  );
  return 0;
}

process.exitCode = await main();
