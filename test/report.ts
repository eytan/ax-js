// Copyright (c) Meta Platforms, Inc. and affiliates. All rights reserved.

/**
 * Custom vitest reporter that generates a test-report.txt summary.
 *
 * Produces a concise, human-readable report grouped by test category
 * with pass/fail counts and the parity fixture report card.
 *
 * Usage: Automatically runs via vitest.config.ts (reporters: ['default', './test/report.ts'])
 *        Or manually: npx vitest run --reporter=default --reporter=./test/report.ts
 */
import type { Reporter, File, Task } from "vitest";

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Group test files into categories for the summary. */
function categorize(filepath: string): string {
  if (filepath.includes("integration/botorch_parity")) {
    return "BoTorch Parity";
  }
  if (filepath.includes("integration/predictor_parity")) {
    return "Ax-Level Parity";
  }
  if (filepath.includes("integration/relativize")) {
    return "Relativization";
  }
  if (filepath.includes("integration/explorer")) {
    return "Explorer Metadata";
  }
  if (filepath.includes("api_smoke")) {
    return "API Smoke Tests";
  }
  if (filepath.includes("acquisition/")) {
    return "Acquisition Functions";
  }
  if (filepath.includes("kernels/")) {
    return "Kernels";
  }
  if (filepath.includes("linalg/")) {
    return "Linear Algebra";
  }
  if (filepath.includes("models/")) {
    return "Models";
  }
  if (filepath.includes("transforms/")) {
    return "Transforms";
  }
  if (filepath.includes("io/")) {
    return "IO / Deserialization";
  }
  if (filepath.includes("predictor")) {
    return "Predictor";
  }
  return "Other";
}

/** Count passed/failed tests in a task tree. */
function countTests(tasks: Array<Task>): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const task of tasks) {
    if (task.type === "test" || task.type === "custom") {
      if (task.result?.state === "pass") {
        passed++;
      } else if (task.result?.state === "fail") {
        failed++;
      }
    }
    if ("tasks" in task && task.tasks) {
      const sub = countTests(task.tasks);
      passed += sub.passed;
      failed += sub.failed;
    }
  }
  return { passed, failed };
}

/** Collect describe-block names for a richer summary. */
function collectDescribes(tasks: Array<Task>, prefix = ""): Array<string> {
  const names: Array<string> = [];
  for (const task of tasks) {
    if (task.type === "suite" && task.name) {
      const fullName = prefix ? `${prefix} > ${task.name}` : task.name;
      if ("tasks" in task && task.tasks) {
        const { passed, failed } = countTests(task.tasks);
        if (passed + failed > 0) {
          names.push(`  ${passed}/${passed + failed}  ${fullName}`);
        }
        // Don't recurse into sub-describes to keep it concise
      }
    }
  }
  return names;
}

export default class TestReportGenerator implements Reporter {
  onFinished(files?: Array<File>): void {
    if (!files || files.length === 0) {
      return;
    }

    const lines: Array<string> = [];
    const now = new Date().toISOString().split("T")[0];

    lines.push("ax-js Test Report");
    lines.push("=".repeat(60), `Date: ${now}`, "");

    // Group files by category
    const categories = new Map<
      string,
      { files: Array<string>; passed: number; failed: number; describes: Array<string> }
    >();

    for (const file of files) {
      const shortPath = file.filepath.replace(/.*axjs\//, "");
      const cat = categorize(shortPath);
      if (!categories.has(cat)) {
        categories.set(cat, { files: [], passed: 0, failed: 0, describes: [] });
      }
      const entry = categories.get(cat)!;
      entry.files.push(shortPath);
      const { passed, failed } = countTests(file.tasks);
      entry.passed += passed;
      entry.failed += failed;
      entry.describes.push(...collectDescribes(file.tasks));
    }

    // Overall summary
    let totalPassed = 0;
    let totalFailed = 0;
    for (const [, v] of categories) {
      totalPassed += v.passed;
      totalFailed += v.failed;
    }
    const total = totalPassed + totalFailed;
    const status = totalFailed === 0 ? "ALL PASSED" : `${totalFailed} FAILED`;

    lines.push(`Result: ${status} (${totalPassed}/${total} tests)`, "");

    // Category summary table
    lines.push("-".repeat(60));
    lines.push("Category".padEnd(30) + "Tests".padStart(8) + "  Status");
    lines.push("-".repeat(60));

    // Sort categories for stable ordering
    const catOrder = [
      "BoTorch Parity",
      "Ax-Level Parity",
      "Relativization",
      "Explorer Metadata",
      "Predictor",
      "API Smoke Tests",
      "Kernels",
      "Linear Algebra",
      "Models",
      "Transforms",
      "IO / Deserialization",
      "Acquisition Functions",
      "Other",
    ];

    for (const cat of catOrder) {
      const entry = categories.get(cat);
      if (!entry) {
        continue;
      }
      const statusStr =
        entry.failed === 0
          ? `${entry.passed} passed`
          : `${entry.failed} FAILED / ${entry.passed} passed`;
      lines.push(
        cat.padEnd(30) + String(entry.passed + entry.failed).padStart(8) + "  " + statusStr,
      );
    }

    lines.push("-".repeat(60));
    lines.push(
      `${"Total".padEnd(30)}${String(total).padStart(8)}  ${status}`,
      "",
      "Detailed Breakdown",
    );
    lines.push("=".repeat(60));

    for (const cat of catOrder) {
      const entry = categories.get(cat);
      if (!entry) {
        continue;
      }
      lines.push("", `[${cat}]`);
      for (const d of entry.describes) {
        lines.push(d);
      }
    }

    lines.push("");
    lines.push(
      "-".repeat(60),
      "Parity fixture details are printed to console during test run.",
      "See docs/testing.md for fixture system documentation.",
      "",
    );

    const report = lines.join("\n");
    const outPath = join(__dirname, "..", "test-report.txt");
    writeFileSync(outPath, report);
  }
}
