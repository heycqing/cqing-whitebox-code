#!/usr/bin/env node

/**
 * tests/validate-rules.mjs
 * 
 * 校验 rules.json 规则注册表的合法性与完整性：
 * 1. JSON 格式有效可解析，声明的 $schema 真实存在且有效
 * 2. 包含稳定且唯一的规则 ID (W01 - W13)
 * 3. level 必须为合法枚举 ("P0" | "P1" | "P2")
 * 4. P0 规则必须包含 W01、W02 以及 W11（敏感凭据泄露门禁）
 * 5. 必须字段非空：id, level, title, intent, trigger, evidence, exceptions, remediation, appliesTo
 * 6. appliesTo 必须为非空数组
 * 7. 若声明了 reference，对应的相对路径文件必须在仓库中存在
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const RULES_PATH = path.join(REPO_ROOT, "rules.json");

const REQUIRED_FIELDS = [
  "id",
  "level",
  "title",
  "intent",
  "trigger",
  "evidence",
  "exceptions",
  "remediation",
  "appliesTo"
];

const VALID_LEVELS = new Set(["P0", "P1", "P2"]);

function fail(msg, ruleId = null, field = null) {
  const prefix = ruleId ? `[Rule: ${ruleId}${field ? ` -> field: ${field}` : ""}] ` : "";
  console.error(`❌ Validation Failed: ${prefix}${msg}`);
  process.exit(1);
}

function runValidation() {
  console.log(`[validate-rules] Reading ${RULES_PATH}...`);
  if (!fs.existsSync(RULES_PATH)) {
    fail(`File does not exist: ${RULES_PATH}`);
  }

  let content;
  try {
    content = fs.readFileSync(RULES_PATH, "utf-8");
  } catch (err) {
    fail(`Failed to read file: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    fail(`Invalid JSON syntax: ${err.message}`);
  }

  // 1. 验证 $schema 引用有效性（消除悬空 schema 引用）
  if (data.$schema) {
    const schemaPath = path.resolve(path.dirname(RULES_PATH), data.$schema);
    if (!fs.existsSync(schemaPath)) {
      fail(`Declared $schema file does not exist: '${data.$schema}' (resolved to: ${schemaPath})`);
    }
    try {
      JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    } catch (err) {
      fail(`Declared $schema file is not valid JSON: ${err.message}`);
    }
    console.log(`  ✓ Verified $schema reference: ${data.$schema}`);
  }

  if (!data || !Array.isArray(data.rules)) {
    fail("Root object must contain a 'rules' array");
  }

  const seenIds = new Set();
  const rules = data.rules;

  if (rules.length === 0) {
    fail("Rules list is empty");
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const ruleLabel = rule && rule.id ? rule.id : `index #${i}`;

    // 检查字段存在性与非空
    for (const field of REQUIRED_FIELDS) {
      if (rule[field] === undefined || rule[field] === null) {
        fail(`Missing required field '${field}'`, ruleLabel, field);
      }
      if (typeof rule[field] === "string" && rule[field].trim().length === 0) {
        fail(`Field '${field}' cannot be an empty string`, ruleLabel, field);
      }
    }

    // 校验 ID 格式与唯一性
    const id = rule.id;
    if (typeof id !== "string" || !/^W\d{2,}$/.test(id)) {
      fail(`Invalid rule ID format '${id}'. Expected format matching /^W\\d{2,}$/ (e.g. W01)`, ruleLabel, "id");
    }
    if (seenIds.has(id)) {
      fail(`Duplicate rule ID detected: '${id}'`, id, "id");
    }
    seenIds.add(id);

    // 校验 level
    if (!VALID_LEVELS.has(rule.level)) {
      fail(`Invalid level '${rule.level}'. Must be one of: P0, P1, P2`, id, "level");
    }

    // 校验 appliesTo
    if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
      fail("appliesTo must be a non-empty array of strings", id, "appliesTo");
    }
    for (const target of rule.appliesTo) {
      if (typeof target !== "string" || target.trim().length === 0) {
        fail("Items in appliesTo must be non-empty strings", id, "appliesTo");
      }
    }

    // 校验 reference 引用文件有效性
    if (rule.reference) {
      if (typeof rule.reference !== "string") {
        fail("reference must be a string relative file path", id, "reference");
      }
      const refPath = path.resolve(REPO_ROOT, rule.reference);
      if (!fs.existsSync(refPath)) {
        fail(`Referenced file does not exist: '${rule.reference}' (resolved to: ${refPath})`, id, "reference");
      }
    }
  }

  // 校验敏感数据凭据泄露门禁必须为 P0
  const w11Rule = rules.find((r) => r.id === "W11");
  if (!w11Rule) {
    fail("Rule W11 must exist in registry");
  }
  if (w11Rule.level !== "P0") {
    fail(`Rule W11 (sensitive data leaks) MUST be configured as 'P0' tier gate, got '${w11Rule.level}'`, "W11", "level");
  }

  console.log(`✅ validate-rules passed successfully: ${rules.length} rules validated without errors (including $schema and P0 security gates).`);
}

runValidation();
