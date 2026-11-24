#!/usr/bin/env node

/**
 * tests/templates-regression.test.mjs
 * 
 * 模板与工程契约回归测试：
 * 1. 验证 state-machine-template.ts 的确定性纯函数特性（零时钟副作用，完全可重现）
 * 2. 验证 state-machine-template.ts 的严格输入边界检查
 * 3. 验证 typed-error-template.ts 的三层因果链保留（ES2022+ Error.cause）
 * 4. 验证 validate-links.mjs 的精准仓库相对路径解析（杜绝同名 README.md 混淆与错指漏检）
 * 5. 验证 rules / manifest 结构性模式约束验证器的有效性
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  transitionOrderState,
  IllegalArgumentError,
  IllegalStateTransitionError
} from "../templates/state-machine-template.ts";
import {
  loadUserProfileBusiness,
  UserServiceError,
  DatabaseQueryError
} from "../templates/typed-error-template.ts";
import {
  verifyProfileContentAgainstManifest,
  validateRulesStructure,
  validateManifestStructure
} from "./validate-links.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log("[templates-regression.test] Running regression tests for templates and link validation...");

// ==========================================
// 1. 状态机确定性与边界测试
// ==========================================

test("1. 状态机确定性：相同输入与显式时间戳产出严格相同的状态", () => {
  const initial = { status: "DRAFT", draftCreatedAt: 1000 };
  const event = { type: "SUBMIT", orderId: "ORD-1001", amount: 99.5, ttlSeconds: 300 };
  const fixedNow = 1700000000000;

  const result1 = transitionOrderState(initial, event, fixedNow);
  const result2 = transitionOrderState(initial, event, fixedNow);

  assert.deepStrictEqual(result1, result2);
  assert.strictEqual(result1.status, "PENDING_PAYMENT");
  if (result1.status === "PENDING_PAYMENT") {
    assert.strictEqual(result1.expireAt, fixedNow + 300 * 1000);
  }
});

test("2. 状态机边界校验：拒绝非法或非正数时间戳", () => {
  const initial = { status: "DRAFT", draftCreatedAt: 1000 };
  const event = { type: "CANCEL", reason: "User request" };

  assert.throws(
    () => transitionOrderState(initial, event, 0),
    (err) => err instanceof IllegalArgumentError && err.message.includes("currentTime")
  );
  assert.throws(
    () => transitionOrderState(initial, event, -100),
    (err) => err instanceof IllegalArgumentError
  );
  assert.throws(
    () => transitionOrderState(initial, event, NaN),
    (err) => err instanceof IllegalArgumentError
  );
});

test("3. 状态机边界校验：SUBMIT 拒绝非正金额与空订单号", () => {
  const initial = { status: "DRAFT", draftCreatedAt: 1000 };
  const fixedNow = 1000000;

  assert.throws(
    () => transitionOrderState(initial, { type: "SUBMIT", orderId: "", amount: 100, ttlSeconds: 60 }, fixedNow),
    (err) => err instanceof IllegalArgumentError && err.message.includes("orderId")
  );
  assert.throws(
    () => transitionOrderState(initial, { type: "SUBMIT", orderId: "OK", amount: 0, ttlSeconds: 60 }, fixedNow),
    (err) => err instanceof IllegalArgumentError && err.message.includes("amount")
  );
  assert.throws(
    () => transitionOrderState(initial, { type: "SUBMIT", orderId: "OK", amount: 100, ttlSeconds: 0 }, fixedNow),
    (err) => err instanceof IllegalArgumentError && err.message.includes("ttlSeconds")
  );
});

test("4. 状态机非法转移：PAID 状态拒绝直接 CANCEL（必须走 REFUND）", () => {
  const paidState = {
    status: "PAID",
    orderId: "ORD-1",
    amount: 100,
    paidAt: 2000,
    transactionId: "TX-99"
  };

  assert.throws(
    () => transitionOrderState(paidState, { type: "CANCEL", reason: "Change mind" }, 3000),
    (err) => err instanceof IllegalStateTransitionError && err.message.includes("Paid orders cannot be directly cancelled")
  );
});

test("5. 状态机退款边界校验：REFUND 金额不能超额或为负数", () => {
  const paidState = {
    status: "PAID",
    orderId: "ORD-1",
    amount: 100,
    paidAt: 2000,
    transactionId: "TX-99"
  };

  assert.throws(
    () => transitionOrderState(paidState, { type: "REFUND", refundedAmount: 150 }, 3000),
    (err) => err instanceof IllegalArgumentError && err.message.includes("cannot exceed paid amount")
  );
  assert.throws(
    () => transitionOrderState(paidState, { type: "REFUND", refundedAmount: 0 }, 3000),
    (err) => err instanceof IllegalArgumentError
  );

  const refunded = transitionOrderState(paidState, { type: "REFUND", refundedAmount: 50 }, 3500);
  assert.strictEqual(refunded.status, "REFUNDED");
  if (refunded.status === "REFUNDED") {
    assert.strictEqual(refunded.refundedAmount, 50);
    assert.strictEqual(refunded.refundedAt, 3500);
  }
});

// ==========================================
// 2. 强类型错误因果链测试
// ==========================================

await asyncTest("6. 强类型错误因果链保留：DAO -> Service 两层 cause 完整保留", async () => {
  let caughtError = null;
  try {
    await loadUserProfileBusiness("user-42");
  } catch (err) {
    caughtError = err;
  }

  assert(caughtError instanceof UserServiceError, "Should catch UserServiceError");
  assert.strictEqual(caughtError.code, "ERR_USER_SERVICE_OPERATION");
  assert.strictEqual(caughtError.safeContext.userId, "user-42");

  // 第一层 cause：DatabaseQueryError
  const daoCause = caughtError.cause;
  assert(daoCause instanceof DatabaseQueryError, "First cause should be DatabaseQueryError");
  assert.strictEqual(daoCause.code, "ERR_DATABASE_QUERY");

  // 第二层 cause：原始底层的网络异常
  const rootCause = daoCause.cause;
  assert(rootCause instanceof Error, "Root cause should be Error");
  assert(rootCause.message.includes("Connection reset by peer"), "Root cause should preserve raw driver message");
});

// ==========================================
// 3. Profile 与 Manifest 完整仓库路径校验回归测试 (防同名混淆)
// ==========================================

test("7. Profile 路径对齐测试：精准识别错指或漏指的同名 README.md", () => {
  const fakeProfilePath = path.join(REPO_ROOT, "profiles", "fake-profile.md");
  
  // 模拟一个 Markdown 文本：故意把 frameworks/react/README.md 漏掉，或者错指成 languages/typescript/README.md
  const mockContentWithMisdirection = `
# Fake Profile
- [Root README](../README.md)
- [TS README](../languages/typescript/README.md)
- [Another TS link (misdirected)](../languages/typescript/README.md)
  `;

  const requiredFiles = [
    "README.md",
    "languages/typescript/README.md",
    "frameworks/react/README.md" // 必须包含但 mock 中未链接它
  ];

  const result = verifyProfileContentAgainstManifest(mockContentWithMisdirection, fakeProfilePath, requiredFiles, REPO_ROOT);
  assert.strictEqual(result.valid, false, "Should detect that frameworks/react/README.md is missing");
  assert(result.missingFiles.includes("frameworks/react/README.md"));
  assert(!result.missingFiles.includes("README.md"));
  assert(!result.missingFiles.includes("languages/typescript/README.md"));
});

test("8. Profile 路径对齐测试：正确链接所有文件时通过验证", () => {
  const fakeProfilePath = path.join(REPO_ROOT, "profiles", "fake-profile.md");
  const mockContentValid = `
# Fake Profile
- [Root README](../README.md)
- [TS README](../languages/typescript/README.md)
- [React README](../frameworks/react/README.md)
  `;

  const requiredFiles = [
    "README.md",
    "languages/typescript/README.md",
    "frameworks/react/README.md"
  ];

  const result = verifyProfileContentAgainstManifest(mockContentValid, fakeProfilePath, requiredFiles, REPO_ROOT);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.missingFiles.length, 0);
});

// ==========================================
// 4. Schema 结构性校验器有效性测试
// ==========================================

test("9. Schema 校验器：拒绝不合法的 rules 与 manifest 结构", () => {
  // 非法 rules 结构（缺少 required rules 字段）
  const invalidRules = { version: "1.0.0", description: "test" };
  const ruleErrors = validateRulesStructure(invalidRules);
  assert(ruleErrors.length > 0);

  // 非法 manifest 结构（缺少 common 字段）
  const invalidManifest = { version: "1.0.0", description: "test" };
  const manifestErrors = validateManifestStructure(invalidManifest);
  assert(manifestErrors.length > 0);
});

console.log("✅ All 9 template & contract regression tests passed successfully!");
