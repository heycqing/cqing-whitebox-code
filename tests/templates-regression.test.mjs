#!/usr/bin/env node

/**
 * tests/templates-regression.test.mjs
 * 
 * 模板回归测试：
 * 1. 验证 state-machine-template.ts 的确定性纯函数特性（零时钟副作用，完全可重现）
 * 2. 验证 state-machine-template.ts 的严格输入边界检查
 * 3. 验证 typed-error-template.ts 的三层因果链保留（ES2022+ Error.cause）
 */

import assert from "node:assert/strict";
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

console.log("[templates-regression.test] Running regression tests for templates...");

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

console.log("✅ All template regression tests passed successfully!");
