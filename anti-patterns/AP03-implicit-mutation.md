# 反模式 AP03：未声明修改与虚假命名 (Undeclared Mutation & Deceptive Naming)

> 严重级别：**P0（未声明的共享数据修改）** / **P1（函数命名与副作用冲突）**  
> 核心判定：函数就地修改传入对象或外部共享状态，且签名契约未予声明；或函数命名暗示只读却暗含状态写操作。

---

## 1. 表现形态与判定证据

### 形态 A：入参原地篡改 (In-Place Mutation)
函数接收一个引用类型参数（对象或数组），在内部直接调用 `.push()`、`.splice()`、`obj.field = value` 或 `delete obj.field`，导致外部调用者持有相同引用的数据被暗中污染。

### 形态 B：虚假命名与隐式副作用 (相关章节)
函数命名以 `get...`、`check...`、`isValid...`、`calculate...` 等只读、判定类词汇开头，但在执行过程中却向数据库写入记录、清空缓存、更新外部状态或触发远程网络写操作。
- **证据特征**：调用 `isUserAuthorized(user)` 居然执行了 `user.failedAttempts = 0` 或 `sessionStore.clear()`。

---

## 2. 危害与因果破坏

1. **诡异的时序 Bug (Action at a Distance)**：模块 A 传参调用了模块 B 的辅助函数，之后模块 A 发现自己的局部变量值变了，在并发或复杂事件循环中难以复盘根本原因。
2. **破坏不可变性假设**：在现代前端框架（如 React / Vue）中，就地修改对象属性不会触发重新渲染（引用未变），导致 UI 与底层状态脱节。

---

## 3. 代码对比 (保持同等业务功能)

### ❌ 黑盒反例

```typescript
// 业务要求：检查用户的待办事项是否超期，并返回超期任务列表
interface Task {
  id: string;
  dueDate: number;
  status: string;
}

// 虚假命名与隐式修改：命名为 checkOverdueTasks（暗示只读检查），内部却偷偷修改传入数组并写入外部缓存
export function checkOverdueTasks(tasks: Task[], now: number): Task[] {
  const overdue: Task[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].dueDate < now) {
      // 致命 P0：直接就地修改入参对象属性！
      tasks[i].status = "EXPIRED";
      overdue.push(tasks[i]);
    }
  }

  // 隐式副作用：只读函数暗中修改了模块级全局缓存
  globalTaskCache.lastCheckedTimestamp = now;

  return overdue;
}
```

### ✅ 白盒正例

```typescript
// ✅ 白盒正例：不可变映射、纯函数计算、显式命名与副作用对齐
export interface Task {
  readonly id: string;
  readonly dueDate: number;
  readonly status: "PENDING" | "COMPLETED" | "EXPIRED";
}

export interface OverdueCheckResult {
  readonly overdueTasks: readonly Task[];
  readonly updatedAllTasks: readonly Task[];
}

// 1. 纯计算函数：命名为 evaluateOverdueTasks，使用浅拷贝创建新对象，不修改入参
export function evaluateOverdueTasks(tasks: readonly Task[], now: number): OverdueCheckResult {
  const updatedAllTasks = tasks.map((task) => {
    if (task.dueDate < now && task.status !== "EXPIRED") {
      return { ...task, status: "EXPIRED" as const };
    }
    return task;
  });

  const overdueTasks = updatedAllTasks.filter((t) => t.dueDate < now);

  return { overdueTasks, updatedAllTasks };
}

// 2. 副作用独立隔离：明确命名的状态同步方法
export function syncTaskAuditTimestamp(cache: TaskCache, now: number): void {
  cache.recordCheck(now);
}
```

---

## 4. 判定边界与允许例外

- **允许就地修改的唯一例外**：
  - 局部封闭对象：完全由函数内部新分配的临时变量（如 `const list = []; list.push(x)`），从未被外部引用过，也不属于共享数据。
  - 显式声明的更新器：函数名明确包含 `mutateInPlace`、`populateInPlace` 等警示词，并在参数类型上明确标注为可变引用，并写清性能权衡注释。

---

## 5. 对应规则

- **W02** (P0): 禁止未声明的共享数据修改
- **W09** (P1): 函数命名与副作用严格一致
