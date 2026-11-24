#!/usr/bin/env node

/**
 * scripts/resolve-profile.mjs
 * 
 * 零第三方依赖的 Profile 加载清单解析脚本。
 * 
 * 用法：
 *   node scripts/resolve-profile.mjs --language <name> [--framework <name>] [--json]
 *   node scripts/resolve-profile.mjs -l typescript -f react
 *   node scripts/resolve-profile.mjs -l python --json
 * 
 * 输出顺序：
 *   1. 通用入口 (README.md, ONBOARDING.md, rules.json)
 *   2. 通用基础与模式 (foundations/*, patterns/*, anti-patterns/*)
 *   3. 语言适配 (languages/<lang>/*)
 *   4. 框架适配 (frameworks/<framework>/*，若指定)
 *   5. 审查入口 (checklists/pr-whitebox-gate.md, templates/whitebox-review-checklist.md)
 * 
 * 异常校验：
 *   - 未指定或未知语言 -> 非零退出码并报错
 *   - 未知框架或不兼容组合 (如 python + react) -> 非零退出码并报错
 *   - 清单中任何文件在仓库根目录不存在 -> 非零退出码并报错
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "profiles", "manifest.json");

function printUsageAndExit(code = 1, errorMsg = "") {
  if (errorMsg) {
    console.error(`❌ Error: ${errorMsg}\n`);
  }
  console.error(`Usage:`);
  console.error(`  node scripts/resolve-profile.mjs --language <name> [--framework <name>] [--json]`);
  console.error(`Options:`);
  console.error(`  -l, --language   Language name (typescript, javascript, python)`);
  console.error(`  -f, --framework  Optional framework name (react, vue)`);
  console.error(`      --json       Output resolved file list as a JSON array`);
  process.exit(code);
}

function parseArgs(args) {
  let language = null;
  let framework = null;
  let asJson = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--language" || arg === "-l") {
      const val = args[++i];
      if (val === undefined || typeof val !== "string" || val.trim().length === 0 || val.startsWith("-")) {
        printUsageAndExit(1, `Missing or invalid value for option '${arg}'`);
      }
      language = val.trim();
    } else if (arg === "--framework" || arg === "-f") {
      const val = args[++i];
      if (val === undefined || typeof val !== "string" || val.trim().length === 0 || val.startsWith("-")) {
        printUsageAndExit(1, `Missing or invalid value for option '${arg}'`);
      }
      framework = val.trim();
    } else if (arg === "--json") {
      asJson = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    } else {
      printUsageAndExit(1, `Unrecognized argument '${arg}'`);
    }
  }

  return { language, framework, asJson };
}

export function resolveProfileFiles(language, framework = null, customManifest = null) {
  let manifest = customManifest;
  if (!manifest) {
    if (!fs.existsSync(MANIFEST_PATH)) {
      throw new Error(`Manifest file not found at: ${MANIFEST_PATH}`);
    }
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  }

  // 1. 校验语言
  if (!language || typeof language !== "string" || language.trim().length === 0) {
    throw new Error("Language must be specified via --language <name>");
  }

  const langKey = language.trim().toLowerCase();
  const langConfig = manifest.languages?.[langKey];
  if (!langConfig) {
    const supported = Object.keys(manifest.languages || {}).join(", ");
    throw new Error(`Unsupported language '${language}'. Supported languages: ${supported}`);
  }

  // 2. 校验框架与双向兼容性一致性
  let fwConfig = null;
  let fwKey = null;
  if (framework) {
    if (typeof framework !== "string" || framework.trim().length === 0) {
      throw new Error("Framework cannot be an empty string if specified");
    }
    fwKey = framework.trim().toLowerCase();
    fwConfig = manifest.frameworks?.[fwKey];
    if (!fwConfig) {
      const supported = Object.keys(manifest.frameworks || {}).join(", ");
      throw new Error(`Unsupported framework '${framework}'. Supported frameworks: ${supported}`);
    }

    const isLangCompatible = Array.isArray(langConfig.compatibleFrameworks) && langConfig.compatibleFrameworks.includes(fwKey);
    const isFwSupported = Array.isArray(fwConfig.supportedLanguages) && fwConfig.supportedLanguages.includes(langKey);

    if (!isLangCompatible || !isFwSupported) {
      throw new Error(
        `Incompatible combination or bidirectional manifest conflict: ` +
        `Framework '${framework}' compatibility check failed with language '${language}'. ` +
        `(Language compatibleFrameworks: [${(langConfig.compatibleFrameworks || []).join(", ")}], ` +
        `Framework supportedLanguages: [${(fwConfig.supportedLanguages || []).join(", ")}])`
      );
    }
  }

  // 3. 严格按顺序组装相对路径列表
  // 顺位：通用入口 -> 通用规则/基础/模式 -> 语言配置 -> 框架配置 -> 审查入口
  const fileList = [];

  // (1) 通用入口
  if (manifest.common && Array.isArray(manifest.common.entry)) {
    fileList.push(...manifest.common.entry);
  }

  // (2) 通用基础与模式
  if (manifest.common) {
    if (Array.isArray(manifest.common.foundations)) {
      fileList.push(...manifest.common.foundations);
    }
    if (Array.isArray(manifest.common.patterns)) {
      fileList.push(...manifest.common.patterns);
    }
    if (Array.isArray(manifest.common.antiPatterns)) {
      fileList.push(...manifest.common.antiPatterns);
    }
  }

  // (3) 语言适配
  if (Array.isArray(langConfig.files)) {
    fileList.push(...langConfig.files);
  }

  // (4) 框架适配 (如有)
  if (fwConfig && Array.isArray(fwConfig.files)) {
    fileList.push(...fwConfig.files);
  }

  // (5) 审查入口
  if (manifest.common && Array.isArray(manifest.common.review)) {
    fileList.push(...manifest.common.review);
  }

  // 4. 严格校验：清单中声明的每一个文件在本地仓库必须真实存在
  for (const relPath of fileList) {
    const fullPath = path.resolve(REPO_ROOT, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Manifest declared file does not exist on disk: '${relPath}' (full path: ${fullPath})`);
    }
  }

  return fileList;
}

// CLI 执行入口
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const { language, framework, asJson } = parseArgs(process.argv.slice(2));

  try {
    const resolvedList = resolveProfileFiles(language, framework);
    if (asJson) {
      console.log(JSON.stringify(resolvedList, null, 2));
    } else {
      for (const filePath of resolvedList) {
        console.log(filePath);
      }
    }
  } catch (err) {
    console.error(`❌ Resolution Failed: ${err.message}`);
    process.exit(1);
  }
}
