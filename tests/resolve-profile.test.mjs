#!/usr/bin/env node

/**
 * tests/resolve-profile.test.mjs
 * 
 * 自动化测试脚本：验证 resolve-profile.mjs 的解析正确性与边界处理：
 * 1. 四种合法 JS/TS + React/Vue 组合
 * 2. 纯 Python 组合（无框架）
 * 3. 纯 TypeScript、纯 JavaScript 组合
 * 4. 验证严格顺序：通用入口 -> 通用基础模式 -> 语言配置 -> 框架配置 -> 审查入口
 * 5. 异常情况：未知语言、未知框架、不兼容组合 (python + react)
 * 6. CLI 命令行退出码测试
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProfileFiles } from "../scripts/resolve-profile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "resolve-profile.mjs");

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log("[resolve-profile.test] Running profile resolution tests...");

test("1. TypeScript + React 合法组合解析与准确顺位", () => {
  const files = resolveProfileFiles("typescript", "react");
  assert(Array.isArray(files));
  assert(files.length > 0);

  // 验证顺位
  const idxReadme = files.indexOf("README.md");
  const idxRules = files.indexOf("rules.json");
  const idxCog = files.indexOf("foundations/cognitive-ergonomics.md");
  const idxPattern = files.indexOf("patterns/01-explicit-control-flow.md");
  const idxLang = files.indexOf("languages/typescript/README.md");
  const idxFw = files.indexOf("frameworks/react/README.md");
  const idxGate = files.indexOf("checklists/pr-whitebox-gate.md");

  assert(idxReadme < idxRules, "README should precede rules.json");
  assert(idxRules < idxCog, "rules.json should precede foundations");
  assert(idxCog < idxPattern, "foundations should precede patterns");
  assert(idxPattern < idxLang, "patterns should precede language files");
  assert(idxLang < idxFw, "language files should precede framework files");
  assert(idxFw < idxGate, "framework files should precede review gate");
});

test("2. TypeScript + Vue 合法组合解析", () => {
  const files = resolveProfileFiles("typescript", "vue");
  assert(files.includes("languages/typescript/README.md"));
  assert(files.includes("frameworks/vue/README.md"));
  assert(!files.includes("frameworks/react/README.md"));
});

test("3. JavaScript + React 合法组合解析", () => {
  const files = resolveProfileFiles("javascript", "react");
  assert(files.includes("languages/javascript/README.md"));
  assert(files.includes("frameworks/react/README.md"));
  assert(!files.includes("languages/typescript/README.md"));
});

test("4. JavaScript + Vue 合法组合解析", () => {
  const files = resolveProfileFiles("javascript", "vue");
  assert(files.includes("languages/javascript/README.md"));
  assert(files.includes("frameworks/vue/README.md"));
});

test("5. 纯 Python 组合解析（无前端框架）", () => {
  const files = resolveProfileFiles("python");
  assert(files.includes("languages/python/README.md"));
  assert(files.includes("languages/python/examples.md"));
  assert(!files.some((f) => f.startsWith("frameworks/")), "Python profile must not include any frameworks");
});

test("6. 纯 TypeScript 组合解析（无框架）", () => {
  const files = resolveProfileFiles("typescript");
  assert(files.includes("languages/typescript/README.md"));
  assert(!files.some((f) => f.startsWith("frameworks/")));
});

test("7. 未知语言拒绝测试", () => {
  assert.throws(
    () => resolveProfileFiles("golang"),
    /Unsupported language 'golang'/
  );
});

test("8. 未知框架拒绝测试", () => {
  assert.throws(
    () => resolveProfileFiles("typescript", "angular"),
    /Unsupported framework 'angular'/
  );
});

test("9. 不兼容组合拒绝测试 (Python + React)", () => {
  assert.throws(
    () => resolveProfileFiles("python", "react"),
    /Incompatible combination/
  );
});

test("10. 不兼容组合拒绝测试 (Python + Vue)", () => {
  assert.throws(
    () => resolveProfileFiles("python", "vue"),
    /Incompatible combination/
  );
});

test("11. CLI 命令行调用测试：成功退出码 0", () => {
  const stdout = execFileSync("node", [SCRIPT_PATH, "--language", "typescript", "--framework", "react"], {
    encoding: "utf-8"
  });
  assert(stdout.includes("languages/typescript/README.md"));
  assert(stdout.includes("frameworks/react/README.md"));
});

test("12. CLI 命令行调用测试：--json 模式", () => {
  const stdout = execFileSync("node", [SCRIPT_PATH, "-l", "python", "--json"], {
    encoding: "utf-8"
  });
  const parsed = JSON.parse(stdout);
  assert(Array.isArray(parsed));
  assert(parsed.includes("languages/python/README.md"));
});

test("13. CLI 命令行调用测试：不兼容参数返回非零退出码", () => {
  let failed = false;
  try {
    execFileSync("node", [SCRIPT_PATH, "-l", "python", "-f", "react"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1);
  }
  assert(failed, "Expected command to fail with non-zero exit code");
});

test("14. CLI 缺失或非法参数拒绝：--framework 缺少参数值时返回非零退出码", () => {
  let failed = false;
  try {
    execFileSync("node", [SCRIPT_PATH, "--language", "typescript", "--framework"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1);
  }
  assert(failed, "Expected command to fail when --framework has no value");
});

test("15. CLI 缺失或非法参数拒绝：--framework 的值被下一个选项占用 (--json)", () => {
  let failed = false;
  try {
    execFileSync("node", [SCRIPT_PATH, "--language", "typescript", "--framework", "--json"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1);
  }
  assert(failed, "Expected command to fail when --framework is followed by an option");
});

test("16. CLI 缺失或非法参数拒绝：--language 缺值或为空串", () => {
  let failed = false;
  try {
    execFileSync("node", [SCRIPT_PATH, "--language"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
  } catch (err) {
    failed = true;
    assert.strictEqual(err.status, 1);
  }
  assert(failed, "Expected command to fail when --language has no value");
});

test("17. 双向一致性校验：manifest 声明冲突时解析器拒绝通过", () => {
  // 模拟冲突的 manifest：languages.typescript 声明兼容 react，但 frameworks.react.supportedLanguages 仅包含 javascript
  const conflictingManifest = {
    languages: {
      typescript: {
        displayName: "TypeScript",
        files: ["languages/typescript/README.md"],
        compatibleFrameworks: ["react"]
      }
    },
    frameworks: {
      react: {
        displayName: "React",
        files: ["frameworks/react/README.md"],
        supportedLanguages: ["javascript"] // 冲突：未包含 typescript
      }
    }
  };

  assert.throws(
    () => resolveProfileFiles("typescript", "react", conflictingManifest),
    /Incompatible combination or bidirectional manifest conflict/
  );
});

console.log("✅ All 17 profile resolution tests passed successfully!");
