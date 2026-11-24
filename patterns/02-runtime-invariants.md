# 模式 02：运行时不变式与边界断言 (Runtime Invariants and Boundary Assertions)

> 核心目标：在不可信的系统 I/O 边界进行严格模式校验与收窄；在内部受信任私有模块维护确定性契约，杜绝掩盖缺陷的内部伪防御。

---

## 1. 适用场景

处理外部不可信数据（如 HTTP 请求体、URL query 参数、第三方 API 响应、文件反序列化）并流转到系统内部核心领域模型的全生命周期。

---

## 2. AI 常见反例

AI 代码常常在系统边界直接做无校验的类型断言（`as Type`），而在底层深处到处使用 `?.`、`??` 或 `try...catch` 兜底容错，导致外部脏数据静默穿透：

```typescript
// ❌ AI 常见反例：边界盲目信任，内部到处伪防御掩盖损坏
export async function handleWebhookPayload(rawPayload: unknown) {
  // 危险：在边界使用类型断言冒充真实验证，实际 payload 可能是 null 或缺少字段
  const event = rawPayload as { eventType: string; data: { orderId: string; amount: number } };

  // 内部深层调用
  processOrderPayment(event.data);
}

function processOrderPayment(data: { orderId: string; amount: number }) {
  // 伪防御：明明业务要求 orderId 和 amount 必填，这里却用 ?? 掩盖前置损坏
  const id = data?.orderId ?? "UNKNOWN_ORDER";
  const amount = data?.amount ?? 0;
  
  // 内部产生脏数据：向数据库记录一条 ID 为 UNKNOWN_ORDER、金额为 0 的垃圾对账单
  recordAuditTrail(id, amount);
}
```

---

## 3. 白盒正例

在边界进行类型收窄与模式校验，内部函数基于不可变契约直接访问，关键节点使用断言快速失败：

```typescript
// ✅ 白盒正例：边界严防死守，内部断言失败快速暴露
export interface PaymentEventData {
  readonly orderId: string;
  readonly amount: number;
}

// 1. 边界模式校验器 (Type Guard / Schema)
function isValidPaymentPayload(payload: unknown): payload is { eventType: string; data: PaymentEventData } {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.eventType !== "string") return false;
  
  const d = p.data;
  if (typeof d !== "object" || d === null) return false;
  const dataObj = d as Record<string, unknown>;
  return typeof dataObj.orderId === "string" && dataObj.orderId.trim().length > 0 &&
         typeof dataObj.amount === "number" && !Number.isNaN(dataObj.amount) && dataObj.amount > 0;
}

// 内部不变式断言工具
function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Internal Invariant Violation] ${message}`);
  }
}

export async function handleWebhookPayload(rawPayload: unknown): Promise<{ success: boolean; error?: string }> {
  // 边界拦截：外部输入校验失败，返回结构化错误，不污染内部系统
  if (!isValidPaymentPayload(rawPayload)) {
    return { success: false, error: "Invalid webhook payload structure: orderId and positive amount required" };
  }

  // 此时数据已被安全收窄为 PaymentEventData
  await processOrderPayment(rawPayload.data);
  return { success: true };
}

function processOrderPayment(data: PaymentEventData) {
  // 内部契约明确：直接使用强类型属性，辅以不变式断言保护内部逻辑
  assertInvariant(data.amount > 0, "Amount must be strictly positive in payment processing");
  
  recordAuditTrail(data.orderId, data.amount);
}
```

---

## 4. 因果解释

1. **同等功能保障**：正例同样完成了对合法 webhook 支付事件的审计记录，并且对非法输入提供了准确的拒绝原因（不会造成未处理崩溃）。
2. **零脏数据污染**：反例中的 `UNKNOWN_ORDER` 与金额为 0 的虚假数据被彻底根除，边界拦截阻止了脏状态进入下游。
3. **因果清晰**：如果测试中触发了 `assertInvariant`，表明系统内部状态被破坏，调用栈直指错误起点；如果是边界返回 `Invalid webhook payload structure`，则明确归类为外部请求方参数错误。

---

## 5. 不适用 / 例外

- **公开第三方 SDK / 插件入口**：在作为公共类库向不可控的外部 JS 运行时暴露方法时，内部可能仍需做一定的运行时防御，但应当在文档中明确抛出 `TypeError` 而非静默 fallback。

---

## 6. 对应规则

- **W06** (P1): 区分边界校验与内部不变式断言
- **W10** (P1): 禁止伪防御性空值与可选链滥用
