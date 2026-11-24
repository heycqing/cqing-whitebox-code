#!/usr/bin/env node

/**
 * tests/validate-links.mjs
 * 
 * 校验仓库内所有文档与工程配置的完整性与可移植性：
 * 1. 【可移植性检查】：严禁在仓库任何 Markdown 文档中使用本机绝对路径或 file:/// 协议链接
 * 2. 【相对链接有效性】：所有相对链接指向的目标文件必须真实存在
 * 3. 【规则 ID 引用一致性】：所有引用的规则 ID (如 W01 - W13) 必须在 rules.json 中定义
 * 4. 【JSON Schema 完整性】：rules.json 与 profiles/manifest.json 中声明的 $schema 必须真实存在且为有效 JSON
 * 5. 【Manifest 路径真实性】：manifest.json 中声明的所有文件在本地仓库必须真实存在
 * 6. 【Profile 与 Manifest 一致性】：profiles/*.md 必须与 manifest.json 声明的语言/框架组合及加载清单严格对齐
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const RULES_PATH = path.join(REPO_ROOT, "rules.json");
const MANIFEST_PATH = path.join(REPO_ROOT, "profiles", "manifest.json");

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
  let errorCount = 0;

  // ----------------------------------------------------
  // 1. 加载规则注册表
  // ----------------------------------------------------
  console.log("[validate-links] Loading registered rules from rules.json...");
  if (!fs.existsSync(RULES_PATH)) {
    console.error(`❌ rules.json not found at: ${RULES_PATH}`);
    process.exit(1);
  }

  const rulesData = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"));
  const validRuleIds = new Set(rulesData.rules.map((r) => r.id));
  console.log(`[validate-links] Loaded ${validRuleIds.size} valid rule IDs: [${Array.from(validRuleIds).join(", ")}]`);

  // ----------------------------------------------------
  // 2. 验证 JSON $schema 完整性 (rules.json & manifest.json)
  // ----------------------------------------------------
  console.log("[validate-links] Verifying JSON $schema integrity...");
  const jsonFilesToCheck = [RULES_PATH, MANIFEST_PATH];
  for (const jsonFilePath of jsonFilesToCheck) {
    const relJson = path.relative(REPO_ROOT, jsonFilePath).replace(/\\/g, "/");
    if (!fs.existsSync(jsonFilePath)) {
      console.error(`❌ JSON file not found: ${relJson}`);
      errorCount++;
      continue;
    }
    const data = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));
    if (data.$schema) {
      const schemaPath = path.resolve(path.dirname(jsonFilePath), data.$schema);
      if (!fs.existsSync(schemaPath)) {
        console.error(`❌ Declared $schema file missing in ${relJson}: '${data.$schema}' (resolved to: ${schemaPath})`);
        errorCount++;
      } else {
        try {
          JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
          console.log(`  ✓ Schema valid: ${relJson} -> ${data.$schema}`);
        } catch (err) {
          console.error(`❌ Invalid JSON in schema file ${schemaPath}: ${err.message}`);
          errorCount++;
        }
      }
    }
  }

  // ----------------------------------------------------
  // 3. 验证 manifest.json 声明的相对路径真实存在
  // ----------------------------------------------------
  console.log("[validate-links] Verifying manifest.json path declarations...");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const manifestDeclaredFiles = new Set();

  function checkAndCollect(fileList, sourceDesc) {
    if (!Array.isArray(fileList)) return;
    for (const relPath of fileList) {
      manifestDeclaredFiles.add(relPath);
      const full = path.resolve(REPO_ROOT, relPath);
      if (!fs.existsSync(full)) {
        console.error(`❌ Manifest path does not exist (${sourceDesc}): '${relPath}'`);
        errorCount++;
      }
    }
  }

  if (manifest.common) {
    checkAndCollect(manifest.common.entry, "common.entry");
    checkAndCollect(manifest.common.foundations, "common.foundations");
    checkAndCollect(manifest.common.patterns, "common.patterns");
    checkAndCollect(manifest.common.antiPatterns, "common.antiPatterns");
    checkAndCollect(manifest.common.review, "common.review");
  }

  for (const [lang, cfg] of Object.entries(manifest.languages || {})) {
    checkAndCollect(cfg.files, `language.${lang}`);
  }
  for (const [fw, cfg] of Object.entries(manifest.frameworks || {})) {
    checkAndCollect(cfg.files, `framework.${fw}`);
  }
  console.log(`  ✓ Manifest declares ${manifestDeclaredFiles.size} distinct files across all configurations.`);

  // ----------------------------------------------------
  // 4. 验证 profiles/*.md 与 manifest 一致性
  // ----------------------------------------------------
  console.log("[validate-links] Verifying consistency between profiles/*.md and manifest.json...");
  const profilesDir = path.join(REPO_ROOT, "profiles");
  const profileMds = fs.readdirSync(profilesDir).filter((f) => f.endsWith(".md"));

  for (const pFile of profileMds) {
    // profile 文件名形如：typescript-react.md, javascript-vue.md
    const baseName = pFile.replace(/\.md$/, "");
    const parts = baseName.split("-");
    const lang = parts[0];
    const fw = parts.slice(1).join("-");

    const langConfig = manifest.languages[lang];
    if (!langConfig) {
      console.error(`❌ Profile ${pFile} corresponds to unknown language '${lang}' in manifest`);
      errorCount++;
      continue;
    }

    if (fw) {
      const fwConfig = manifest.frameworks[fw];
      if (!fwConfig) {
        console.error(`❌ Profile ${pFile} corresponds to unknown framework '${fw}' in manifest`);
        errorCount++;
        continue;
      }
      if (!langConfig.compatibleFrameworks || !langConfig.compatibleFrameworks.includes(fw)) {
        console.error(`❌ Profile ${pFile} represents incompatible pair: ${lang} + ${fw}`);
        errorCount++;
        continue;
      }
    }

    // 检查 profile 文档内引用的文件是否完整覆盖 manifest 该组合声明的文件
    const profileContent = fs.readFileSync(path.join(profilesDir, pFile), "utf-8");
    const requiredFiles = [
      ...(manifest.common?.entry || []),
      ...(manifest.common?.foundations || []),
      ...(manifest.common?.patterns || []),
      ...(manifest.common?.antiPatterns || []),
      ...(langConfig.files || []),
      ...(fw ? manifest.frameworks[fw]?.files || [] : []),
      ...(manifest.common?.review || [])
    ];

    for (const reqFile of requiredFiles) {
      const baseReq = path.basename(reqFile);
      if (!profileContent.includes(baseReq)) {
        console.error(`❌ Profile ${pFile} is missing reference to required file: '${reqFile}'`);
        errorCount++;
      }
    }
    console.log(`  ✓ Profile consistency verified: ${pFile}`);
  }

  // ----------------------------------------------------
  // 5. 扫描所有 Markdown 文档的链接、可移植性与规则 ID 引用
  // ----------------------------------------------------
  console.log("[validate-links] Scanning Markdown files for portability, links, and rule references...");
  const mdFiles = getAllMarkdownFiles(REPO_ROOT);
  console.log(`[validate-links] Found ${mdFiles.length} Markdown files to scan.`);

  for (const filePath of mdFiles) {
    const relToRoot = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");

    // 5.1 扫描所有 Markdown 链接 [text](target)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkText = match[1];
      let target = match[2].trim();

      // 跳过纯外部 http/https 链接与纯内部当前页锚点 #
      if (
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("#") ||
        target.startsWith("mailto:")
      ) {
        continue;
      }

      // 【核心门禁】：严禁本机绝对路径与 file:/// 链接（防范不可移植链接）
      if (
        target.startsWith("file:///") ||
        /^[a-zA-Z]:[\\/]/.test(target) ||
        target.startsWith("/Users/") ||
        target.startsWith("/home/")
      ) {
        console.error(
          `❌ Portability Violation in ${relToRoot}: Local machine absolute link detected: [${linkText}](${match[2]})`
        );
        errorCount++;
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

    // 5.2 检查引用的规则 ID (W01 - W13)
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
    console.error(`\n❌ Link, portability, and manifest validation failed with ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log(`✅ All ${mdFiles.length} Markdown files & manifest configurations verified successfully!`);
}

runValidation();
