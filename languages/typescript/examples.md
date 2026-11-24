# TypeScript 白盒模式正反例

> 本文档提供 TypeScript 强类型环境下的白盒正反例对比，重点演示判别联合、unknown 类型守卫与运行时断言。

---

## 示例 1：判别联合取代多布尔地狱 (W05)

### 业务场景
文件上传组件的生命周期状态管理：支持就绪、上传中（带进度）、上传成功（带下载链接）、上传失败（带可重试标记与错误原因）。

### ❌ 反例 (黑盒：组合布尔地狱、无法律性约束)

```typescript
// ❌ 错误示范：4 个布尔值 + 3 个可选属性，产生 16 种可能组合，极易进入矛盾状态
interface UploadStatusState {
  isUploading: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  progressPercent: number;
  downloadUrl?: string;
  errorMessage?: string;
}

// 容易出现 isUploading=true 且 isFailed=true，或者 isCompleted=true 但 downloadUrl 未定义的非法状态！
```

### ✅ 正例 (白盒：判别联合，非法状态数学不可表达)

```typescript
// ✅ 正确示范：每个生命周期状态携带其专属的只读数据，互斥且排他
export type UploadState =
  | { readonly status: "ready" }
  | { readonly status: "uploading"; readonly progress: number }
  | { readonly status: "completed"; readonly downloadUrl: string }
  | { readonly status: "failed"; readonly reason: string; readonly canRetry: boolean };

export class FileUploadController {
  private _state: UploadState = { status: "ready" };

  public get state(): UploadState {
    return this._state;
  }

  public start(): void {
    if (this._state.status === "uploading") {
      throw new Error("Cannot start upload while another upload is in progress");
    }
    this._state = { status: "uploading", progress: 0 };
  }

  public updateProgress(progress: number): void {
    if (this._state.status !== "uploading") {
      throw new Error(`Cannot update progress in status: ${this._state.status}`);
    }
    this._state = { status: "uploading", progress: Math.min(100, Math.max(0, progress)) };
  }

  public complete(downloadUrl: string): void {
    if (this._state.status !== "uploading") {
      throw new Error(`Cannot complete upload from status: ${this._state.status}`);
    }
    if (!downloadUrl || !downloadUrl.startsWith("https://")) {
      throw new Error("Invalid secure download URL");
    }
    this._state = { status: "completed", downloadUrl };
  }

  public fail(reason: string, canRetry = true): void {
    this._state = { status: "failed", reason, canRetry };
  }
}
```

---

## 示例 2：外部输入收窄 vs 运行时断言 (W06)

### 业务场景
解析从外部 Redis 缓存中取出的订单快照并执行金额折算。

### ❌ 反例 (黑盒：as 强制断言，掩盖数据损坏)

```typescript
// ❌ 错误：盲目使用 as，若缓存数据被其他旧版本写入了错误字段，直接造成下游 NaN 事故
export function processCachedOrder(rawString: string) {
  const order = JSON.parse(rawString) as { orderId: string; totalAmount: number };
  
  // 伪防御：若 totalAmount 缺失，order.totalAmount 为 undefined，乘法变成 NaN！
  const tax = (order.totalAmount ?? 0) * 0.1;
  return { orderId: order.orderId, tax };
}
```

### ✅ 正例 (白盒：unknown 类型守卫 + 不变式断言)

```typescript
// ✅ 正确：严谨类型收窄，内部断言快速失败
export interface CachedOrder {
  readonly orderId: string;
  readonly totalAmount: number;
}

function isCachedOrder(obj: unknown): obj is CachedOrder {
  if (typeof obj !== "object" || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.orderId === "string" &&
    c.orderId.trim().length > 0 &&
    typeof c.totalAmount === "number" &&
    !Number.isNaN(c.totalAmount) &&
    c.totalAmount >= 0
  );
}

export function processCachedOrder(rawString: string): { orderId: string; tax: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawString);
  } catch (err: unknown) {
    throw new Error("Failed to parse cached order JSON", { cause: err });
  }

  // 边界校验：拦截任何不符合契约的数据结构
  if (!isCachedOrder(parsed)) {
    throw new Error(`Corrupted cached order data structure detected`);
  }

  // 此时 parsed 在类型和运行时均严格保证合法
  const tax = Number((parsed.totalAmount * 0.1).toFixed(2));
  return {
    orderId: parsed.orderId,
    tax
  };
}
```
