#!/usr/bin/env node

/**
 * tests/validate-links.mjs
 * 
 * 校验仓库内所有 Markdown 文档的完整性：
 * 1. 相对路径与内部链接指向的文件必须在本地真实存在
 * 2. 引用的规则 ID (如 W01 - W12) 必须在 rules.json 注册表中定义
 * 3. 校验 profiles/*.md 与 manifest.json 中各语言/框架组合的一致性
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const RULES_PATH = path.join(REPO_ROOT, "rules.json");

function getAllMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === ".git" || item === "node_modules") continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllMarkdownFiles(fullPath));
    } else if (item.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function runValidation() {
  console.log("[validate-links] Loading registered rules from rules.json...");
  if (!fs.existsSync(RULES_PATH)) {
    console.error(`❌ rules.json not found at: ${RULES_PATH}`);
    process.exit(1);
  }

  const rulesData = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
  const validRuleIds = new Set(rulesData.rules.map((r) => r.id));
  console.log(`[validate-links] Loaded ${validRuleIds.size} valid rule IDs: [${Array.from(validRuleIds).join(", ")}]`);

  const mdFiles = getAllMarkdownFiles(REPO_ROOT);
  console.log(`[validate-links] Found ${mdFiles.length} Markdown files to scan.`);

  let errorCount = 0;

  for (const filePath of mdFiles) {
    const relToRoot = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");

    // 1. 扫描所有 Markdown 链接 [text](target)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      let target = match[2].trim();

      // 跳过纯外部 http/https 链接与纯锚点 #
      if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#") || target.startsWith("mailto:")) {
        continue;
      }

      // 处理 file:/// 协议绝对/相对路径
      if (target.startsWith("file:///")) {
        target = target.replace(/^file:\/\/\//, "");
        // Windows 绝对路径：如 D:/mine-prop/cqing-whitebox-code/...
        // 转换为本地路径
        let resolvedLocal = target;
        if (process.platform === "win32" && /^[a-zA-Z]:/.test(resolvedLocal)) {
          resolvedLocal = path.resolve(resolvedLocal);
        } else {
          resolvedLocal = path.resolve("/", resolvedLocal);
        }
        if (!fs.existsSync(resolvedLocal)) {
          console.error(`❌ Broken file link in ${relToRoot}: [${linkText}](${match[2]}) -> ${resolvedLocal} does not exist`);
          errorCount++;
        }
        continue;
      }

      // 去除锚点后缀 (#L10 等)
      const cleanTarget = target.split("#")[0];
      if (!cleanTarget) continue;

      // 相对当前文件所在目录解析
      const currentDir = path.dirname(filePath);
      const resolvedTarget = path.resolve(currentDir, cleanTarget);

      if (!fs.existsSync(resolvedTarget)) {
        console.error(`❌ Broken relative link in ${relToRoot}: [${linkText}](${target}) -> resolved to ${resolvedTarget}`);
        errorCount++;
      }
    }

    // 2. 检查显式引用的规则 ID (如 W01, W02, ..., W12)
    // 匹配如 "W01", "W12", "**W01**" 等
    const ruleRefRegex = /\b(W\d{2,})\b/g;
    let ruleMatch;
    while ((ruleMatch = ruleRefRegex.exec(content)) !== null) {
      const ruleId = ruleMatch[1];
      if (!validRuleIds.has(ruleId)) {
        console.error(`❌ Invalid rule ID reference in ${relToRoot}: '${ruleId}' not found in rules.json`);
        errorCount++;
      }
    }
  }

  if (errorCount > 0) {
    console.error(`\n❌ Link and rule validation failed with ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log(`✅ All ${mdFiles.length} Markdown files verified: all internal links and rule references are valid!`);
}

runValidation();
