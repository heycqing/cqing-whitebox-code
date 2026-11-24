# 模式 03：保留错误因果链 (Causal Error Handling)

> 核心目标：在多层架构与异步传递中完整保留异常的因果链（Cause Chain），消除因果丢失与粗暴截断，使定位根因直达问题发源点。

---

## 1. 适用场景

跨层调用（例如 DAO -> Service -> Controller）或异步任务调用第三方外部网络服务时发生的异常转换与包装。

---

## 2. AI 常见反例

AI 代码常常为了所谓的“统一业务异常格式”，粗暴地 catch 住底层异常并丢弃原始错误实例，导致原始堆栈与系统错误码荡然无存：

```typescript
// ❌ AI 常见反例：直接丢弃底层原始因果
export async function fetchUserBillingDetails(userId: string): Promise<BillingDetails> {
  try {
    const rawRes = await httpClient.get(`/api/v1/billing/${userId}`);
    return parseBilling(rawRes.data);
  } catch (error: any) {
    // 危险：原始的 error 堆栈、网络状态码（如 ECONNREFUSED、404、502）被彻底扔掉！
    throw new Error(`Failed to load billing for user ${userId}`);
  }
}
```

---

## 3. 白盒正例

保持同等的异常拦截与业务抽象能力，但使用现代标准原生支持的 `cause` 机制（ES2022+ 标准），并携带不含敏感信息的结构化上下文：

```typescript
// ✅ 白盒正例：使用标准 Error.cause 完整保留根因链
export class ServiceOperationError extends Error {
  public readonly code: string;
  public readonly safeContext: Record<string, unknown>;

  constructor(message: string, options: { code: string; cause: unknown; context?: Record<string, unknown> }) {
    super(message, { cause: options.cause });
    this.name = "ServiceOperationError";
    this.code = options.code;
    this.safeContext = options.context ?? {};
  }
}

export async function fetchUserBillingDetails(userId: string): Promise<BillingDetails> {
  try {
    const rawRes = await httpClient.get(`/api/v1/billing/${userId}`);
    return parseBilling(rawRes.data);
  } catch (error: unknown) {
    // 完整保留 cause，附加可定位的无敏感业务 ID，不在中间层多余打印日志
    throw new ServiceOperationError(`Failed to load billing for user ${userId}`, {
      code: "BILLING_SERVICE_UNAVAILABLE",
      cause: error,
      context: { userId }
    });
  }
}
```

---

## 4. 因果解释

1. **同等功能保障**：上层调用者仍然捕获到统一的高级业务异常 `ServiceOperationError`，不会破坏上层的业务契约。
2. **根因可达**：在最外层监控系统打印日志或做错误聚合时，`error.cause` 会递归打印出所有底层的原始错误（例如 `AxiosError: connect ECONNREFUSED 10.0.1.20:443`），无需重现即可定位网络还是鉴权根因。
3. **零日志洪泛**：底层和中间层只负责抛出并保留 cause，不在此处调用 `logger.error`，防止层层刷屏。

---

## 5. 不适用 / 例外

- **向公网客户端返回 HTTP JSON 响应**：在接口出口处（API 响应体中），必须对外过滤底层的 SQL 堆栈或第三方内部网络 IP，但**服务端日志**必须单点记录完整的 cause 堆栈。

---

## 6. 对应规则

- **W01** (P0): 禁止无声丢失失败
- **W07** (P1): 保留错误因果链与边界单点记录
