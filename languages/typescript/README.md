# TypeScript 语言白盒规范适配指南

> 适用版本：TypeScript 5.x+  
> 权威参考：[TypeScript Handbook: Narrowing & Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) | [TypeScript: Type Guards and Differentiating Types](https://www.typescriptlang.org/docs/handbook/advanced-types.html)  
> 核验日期：2026-11

---

## 1. 语言特性与白盒契约映射

TypeScript 拥有强大的静态类型系统，但白盒代码实践中必须清醒认识到：**TypeScript 类型在编译后会被完全擦除 (Type Erasure)**。
编译期类型通过并不代表运行时事实。如果混淆编译期类型与运行时校验，极易滋生虚假的安全感。

| 通用白盒规则 | TypeScript 适配关键点 | 推荐实现方式 | 验证方法 |
|---|---|---|---|
| **W01 (P0: 禁止无声吞错)** | catch (err: unknown) 强制类型收窄，不得将错误忽略或粗暴当做 any | `err instanceof Error ? err : new Error(String(err))` 并保留 `cause` | tsc 启用 `useUnknownInCatchVariables: true` |
| **W02 (P0: 禁止未声明修改)** | 利用类型系统从源头上限制属性变动 | 使用 `readonly` 修饰符与 `ReadonlyArray<T>`，冻结运行时不可变结构 | 编译器报错（尝试赋值只读属性时报错） |
| **W05 (P1: 显式状态建模)** | 消除多重布尔标记组合，杜绝非法中间状态 | 判别联合 (Discriminated Unions) 建模排他性生命周期 | 结合 `never` 做穷举检查 (Exhaustiveness Check) |
| **W06 (P1: 边界校验与断言)** | 区分不可控外部 I/O 与内部高置信不变式；严禁滥用 `as T` 强转 | 外部数据用 `unknown` + 自定义类型守卫 (`is`)；内部使用断言函数 (`asserts condition`) | 单测用非法结构调用断言函数验证抛错 |
| **W10 (P1: 禁伪防御性可选链)** | 核心强契约字段禁止盲目加 `?.` 与 `?? ""` | 直接声明必填字段，依靠类型检查暴露上游缺失 | 开启 `strictNullChecks: true` |

---

## 2. 惯用写法与规则落地

### 2.1 判别联合 (Discriminated Unions) 与穷举检查
排他性状态必须由一个共同的字面量判别字段（如 `kind` 或 `status`）区分。利用 TypeScript 的 `never` 类型进行穷举检查，确保未来新增状态时编译器强制提醒：

```typescript
type AsyncState<T> =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "success"; readonly data: T }
  | { readonly kind: "error"; readonly error: Error };

function assertUnreachable(x: never): never {
  throw new Error(`Unhandled discriminant value: ${JSON.stringify(x)}`);
}

function handleState<T>(state: AsyncState<T>): string {
  switch (state.kind) {
    case "idle": return "Ready";
    case "loading": return "Loading...";
    case "success": return "Success";
    case "error": return `Error: ${state.error.message}`;
    default: return assertUnreachable(state); // 若漏处理新分支，编译期直接报错！
  }
}
```

### 2.2 外部不可信数据的类型收窄 (Narrowing unknown)
严禁在接收网络、缓存、文件数据时写 `payload as MyType`。必须将其声明为 `unknown`，通过运行时守卫收窄：

```typescript
function isUserRecord(obj: unknown): obj is { id: string; email: string } {
  if (typeof obj !== "object" || obj === null) return false;
  const candidate = obj as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.email === "string";
}

export function parseIncomingUser(raw: unknown) {
  if (!isUserRecord(raw)) {
    throw new TypeError("Invalid incoming user payload: expected { id: string, email: string }");
  }
  // 此时 raw 在编译期被安全收窄为 { id: string; email: string }
  return { id: raw.id, email: raw.email };
}
```

### 2.3 异常捕获未知类型收窄 (unknown catch)
在 TypeScript 中捕获的异常默认是 `unknown`，必须安全收窄后包装：
```typescript
try {
  await doRiskyAction();
} catch (err: unknown) {
  const normalizedError = err instanceof Error ? err : new Error(String(err));
  throw new BusinessError("Action failed", { cause: normalizedError });
}
```
