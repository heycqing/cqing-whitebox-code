#!/usr/bin/env node

/**
 * tests/validate-links.mjs
 * 
 * 校验仓库内所有文档与工程配置的完整性、可移植性与契约一致性：
 * 1. 【可移植性检查】：严禁在仓库任何 Markdown 文档中使用本机绝对路径或 file:/// 协议链接
 * 2. 【相对链接有效性】：所有相对链接指向的目标文件必须在本地仓库真实存在
 * 3. 【规则 ID 引用一致性】：所有引用的规则 ID (如 W01 - W13) 必须在 rules.json 中定义
 * 4. 【JSON Schema 文件与结构约束】：
 *    - rules.json 与 profiles/manifest.json 声明的 $schema 文件必须存在且为有效 JSON
 *    - 对 rules.json 与 manifest.json 执行具体的 Schema 属性与结构规则约束验证
 * 5. 【Manifest 路径真实性】：manifest.json 中声明的所有文件在本地仓库必须真实存在
 * 6. 【Profile 与 Manifest 精准路径对齐】：
 *    - profiles/*.md 必须按完整仓库相对路径（非 basename 混淆）链接 manifest 声明的全部文件
 *    - 防范同名 README.md 错指与漏指
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const RULES_PATH = path.join(REPO_ROOT, "rules.json");
const MANIFEST_PATH = path.join(REPO_ROOT, "profiles", "manifest.json");

export function getAllMarkdownFiles(dir) {
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

/**
 * 从 Markdown 文本中提取所有相对链接，并解析为相对于 repoRoot 的统一规范路径 (posix 风格)
 */
export function extractLinkedRepoPaths(markdownContent, markdownFilePath, repoRoot) {
  const fileDir = path.dirname(markdownFilePath);
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkedPaths = new Set();

  let match;
  while ((match = linkRegex.exec(markdownContent)) !== null) {
    const rawTarget = match[2].trim().split("#")[0];
    if (
      !rawTarget ||
      rawTarget.startsWith("http://") ||
      rawTarget.startsWith("https://") ||
      rawTarget.startsWith("mailto:")
    ) {
      continue;
    }

    // 相对文件目录解析为绝对路径，再转换为相对于仓库根目录的路径
    const fullTarget = path.resolve(fileDir, rawTarget);
    const relToRepo = path.relative(repoRoot, fullTarget).replace(/\\/g, "/");
    linkedPaths.add(relToRepo);
  }

  return linkedPaths;
}

/**
 * 校验 Profile Markdown 的链接是否精准覆盖 manifest 要求的完整路径
 */
export function verifyProfileContentAgainstManifest(markdownContent, markdownFilePath, requiredFiles, repoRoot) {
  const linkedPaths = extractLinkedRepoPaths(markdownContent, markdownFilePath, repoRoot);
  const missingFiles = [];

  for (const reqFile of requiredFiles) {
    const normalizedReq = reqFile.replace(/\\/g, "/");
    if (!linkedPaths.has(normalizedReq)) {
      missingFiles.push(normalizedReq);
    }
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
    linkedPaths
  };
}

/**
 * rules.json 结构与模式约束检查器
 */
export function validateRulesStructure(data) {
  const errors = [];
  if (!data || typeof data !== "object") errors.push("Root must be an object");
  if (!/^\d+\.\d+\.\d+$/.test(data.version || "")) errors.push("Invalid version format");
  if (!data.description || typeof data.description !== "string") errors.push("Missing description");
  if (!Array.isArray(data.rules) || data.rules.length === 0) errors.push("rules must be a non-empty array");

  for (const r of data.rules || []) {
    if (!/^W\d{2,}$/.test(r.id || "")) errors.push(`Rule ${r.id}: invalid ID format`);
    if (!["P0", "P1", "P2"].includes(r.level)) errors.push(`Rule ${r.id}: invalid level ${r.level}`);
    for (const f of ["title", "intent", "trigger", "evidence", "exceptions", "remediation"]) {
      if (!r[f] || typeof r[f] !== "string") errors.push(`Rule ${r.id}: missing string field ${f}`);
    }
    if (!Array.isArray(r.appliesTo) || r.appliesTo.length === 0) errors.push(`Rule ${r.id}: invalid appliesTo`);
  }
  return errors;
}

/**
 * manifest.json 结构与模式约束检查器
 */
export function validateManifestStructure(data) {
  const errors = [];
  if (!data || typeof data !== "object") errors.push("Root must be an object");
  if (!/^\d+\.\d+\.\d+$/.test(data.version || "")) errors.push("Invalid version format");
  if (!data.common || typeof data.common !== "object") errors.push("Missing common object");
  for (const key of ["entry", "foundations", "patterns", "antiPatterns", "review"]) {
    if (!Array.isArray(data.common?.[key])) errors.push(`common.${key} must be an array`);
  }
  if (!data.languages || typeof data.languages !== "object") errors.push("Missing languages object");
  for (const [lang, cfg] of Object.entries(data.languages || {})) {
    if (!cfg.displayName) errors.push(`language ${lang} missing displayName`);
    if (!Array.isArray(cfg.files) || cfg.files.length === 0) errors.push(`language ${lang} missing files`);
    if (!Array.isArray(cfg.compatibleFrameworks)) errors.push(`language ${lang} missing compatibleFrameworks`);
  }
  if (!data.frameworks || typeof data.frameworks !== "object") errors.push("Missing frameworks object");
  for (const [fw, cfg] of Object.entries(data.frameworks || {})) {
    if (!cfg.displayName) errors.push(`framework ${fw} missing displayName`);
    if (!Array.isArray(cfg.files) || cfg.files.length === 0) errors.push(`framework ${fw} missing files`);
    if (!Array.isArray(cfg.supportedLanguages) || cfg.supportedLanguages.length === 0) errors.push(`framework ${fw} missing supportedLanguages`);
  }

  // 双向一致性校验：manifest.languages[*].compatibleFrameworks 与 manifest.frameworks[*].supportedLanguages
  if (data.languages && data.frameworks) {
    for (const [lang, cfg] of Object.entries(data.languages)) {
      if (Array.isArray(cfg.compatibleFrameworks)) {
        for (const fw of cfg.compatibleFrameworks) {
          const fwCfg = data.frameworks[fw];
          if (!fwCfg) {
            errors.push(`Language '${lang}' declares compatibleFramework '${fw}', but '${fw}' is not defined in frameworks`);
          } else if (!Array.isArray(fwCfg.supportedLanguages) || !fwCfg.supportedLanguages.includes(lang)) {
            errors.push(`Bidirectional conflict: language '${lang}' declares compatibleFramework '${fw}', but framework '${fw}.supportedLanguages' does not include '${lang}'`);
          }
        }
      }
    }

    for (const [fw, cfg] of Object.entries(data.frameworks)) {
      if (Array.isArray(cfg.supportedLanguages)) {
        for (const lang of cfg.supportedLanguages) {
          const langCfg = data.languages[lang];
          if (!langCfg) {
            errors.push(`Framework '${fw}' declares supportedLanguage '${lang}', but '${lang}' is not defined in languages`);
          } else if (!Array.isArray(langCfg.compatibleFrameworks) || !langCfg.compatibleFrameworks.includes(fw)) {
            errors.push(`Bidirectional conflict: framework '${fw}' declares supportedLanguage '${lang}', but language '${lang}.compatibleFrameworks' does not include '${fw}'`);
          }
        }
      }
    }
  }

  return errors;
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
  // 2. 验证 JSON $schema 文件解析与结构约束验证
  // ----------------------------------------------------
  console.log("[validate-links] Validating JSON schema structure and constraints for rules.json and manifest.json...");
  const jsonFilesToCheck = [
    { file: RULES_PATH, validator: validateRulesStructure, name: "rules.json" },
    { file: MANIFEST_PATH, validator: validateManifestStructure, name: "profiles/manifest.json" }
  ];

  for (const item of jsonFilesToCheck) {
    const relJson = path.relative(REPO_ROOT, item.file).replace(/\\/g, "/");
    if (!fs.existsSync(item.file)) {
      console.error(`❌ JSON file not found: ${relJson}`);
      errorCount++;
      continue;
    }
    const data = JSON.parse(fs.readFileSync(item.file, "utf-8"));
    if (data.$schema) {
      const schemaPath = path.resolve(path.dirname(item.file), data.$schema);
      if (!fs.existsSync(schemaPath)) {
        console.error(`❌ Declared $schema file missing in ${relJson}: '${data.$schema}' (resolved to: ${schemaPath})`);
        errorCount++;
      } else {
        try {
          JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
          console.log(`  ✓ Schema file exists and valid JSON: ${relJson} -> ${data.$schema}`);
        } catch (err) {
          console.error(`❌ Invalid JSON in schema file ${schemaPath}: ${err.message}`);
          errorCount++;
        }
      }
    }

    // 运行结构性契约验证
    const structErrors = item.validator(data);
    if (structErrors.length > 0) {
      for (const err of structErrors) {
        console.error(`❌ Structural schema violation in ${item.name}: ${err}`);
      }
      errorCount += structErrors.length;
    } else {
      console.log(`  ✓ Structural schema constraints passed: ${item.name}`);
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
  // 4. 验证 profiles/*.md 与 manifest 精准相对路径一致性 (消除同名 basename 混淆)
  // ----------------------------------------------------
  console.log("[validate-links] Verifying exact repository-relative path consistency between profiles/*.md and manifest.json...");
  const profilesDir = path.join(REPO_ROOT, "profiles");
  const profileMds = fs.readdirSync(profilesDir).filter((f) => f.endsWith(".md"));

  for (const pFile of profileMds) {
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

    const fullProfilePath = path.join(profilesDir, pFile);
    const profileContent = fs.readFileSync(fullProfilePath, "utf-8");

    // 组装 manifest 为当前组合要求的所有精准路径
    const requiredFiles = [
      ...(manifest.common?.entry || []),
      ...(manifest.common?.foundations || []),
      ...(manifest.common?.patterns || []),
      ...(manifest.common?.antiPatterns || []),
      ...(langConfig.files || []),
      ...(fw ? manifest.frameworks[fw]?.files || [] : []),
      ...(manifest.common?.review || [])
    ];

    // 精准比对：按相对于 REPO_ROOT 的规范路径进行比较，彻底解决同名 README.md 混淆
    const checkResult = verifyProfileContentAgainstManifest(profileContent, fullProfilePath, requiredFiles, REPO_ROOT);
    if (!checkResult.valid) {
      for (const missing of checkResult.missingFiles) {
        console.error(`❌ Profile ${pFile} is missing exact path link to required file: '${missing}'`);
      }
      errorCount += checkResult.missingFiles.length;
    } else {
      console.log(`  ✓ Exact path consistency verified: ${pFile} (${requiredFiles.length} required paths linked)`);
    }
  }

  // ----------------------------------------------------
  // 5. 扫描所有 Markdown 文档的链接、可移植性与规则 ID 引用
  // ----------------------------------------------------
  console.log("[validate-links] Scanning Markdown files for portability, relative links, and rule references...");
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
    console.error(`\n❌ Validation failed with ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log(`✅ All ${mdFiles.length} Markdown files, schema constraints, and manifest configurations verified successfully!`);
}

// CLI 执行入口
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runValidation();
}
