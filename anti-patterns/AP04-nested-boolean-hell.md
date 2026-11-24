# 反模式 AP04：复杂布尔状态地狱 (Nested Boolean Hell & Invalid States)

> 严重级别：**P1（状态建模与设计缺陷）**  
> 核心判定：使用多个独立的布尔变量组合表示本该互斥的生命周期状态，导致系统进入矛盾、未定义或不可解释的非法状态。

---

## 1. 表现形态与判定证据

### 表现形态
在一个组件或数据模型中，同时定义了 3 个以上的布尔开关来管理异步流程：
`isLoading`、`isSuccess`、`isError`、`isEmpty`、`isReloading`。
在各种事件回调中，开发者必须记得手工将某个布尔置为 `true`，同时将其余所有布尔重置为 `false`。

### 判定证据
1. 代码中存在 `if (isLoading && !isError && isSuccess)` 这样冗长的条件判断。
2. 组合布尔理论上存在 $2^n$ 种状态组合，但实际合法业务状态只有 $n$ 种，其余组合全部是未定义或矛盾状态（例如 `isLoading=true` 且 `isError=true` 同时成立）。
3. 状态重置遗漏：在某个 catch 分支中只改了 `isError = true`，却忘记把 `isLoading = false`，导致界面永远卡在骨架屏或 Loading 菊花。

---

## 2. 危害与因果破坏

1. **非法状态无法被静态类型检查拦截**：编译器无法识别 `isLoading: true, isError: true` 是个 Bug，Bug 只能在特定网络竞态时在线上暴发。
2. **状态转移难以追溯**：每个布尔值都可以被任何方法独立赋值，导致排查“到底是哪一步把 `isSuccess` 抹掉的”极其困难。

---

## 3. 代码对比 (保持同等业务功能)

### ❌ 黑盒反例

```typescript
// 业务要求：加载用户列表，支持加载中、加载失败、数据为空及正常展示
export class UserListViewModel {
  public isLoading: boolean = false;
  public isError: boolean = false;
  public errorMessage: string = "";
  public isEmpty: boolean = false;
  public users: User[] = [];

  async fetchUsers() {
    this.isLoading = true;
    this.isError = false; // 容易漏写！
    try {
      const data = await api.getUsers();
      this.users = data;
      this.isEmpty = data.length === 0;
      this.isLoading = false;
    } catch (err: any) {
      // 遗漏！忘记写 this.isLoading = false; 导致状态机卡死！
      this.isError = true;
      this.errorMessage = err.message;
    }
  }
}
```

### ✅ 白盒正例

```typescript
// ✅ 白盒正例：使用判别联合 (Discriminated Union) 建模排他性生命周期
export type UserListViewState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | { readonly kind: "success"; readonly users: readonly User[] }
  | { readonly kind: "error"; readonly error: Error };

export class UserListViewModel {
  private _state: UserListViewState = { kind: "idle" };

  public get state(): UserListViewState {
    return this._state;
  }

  async fetchUsers(): Promise<void> {
    this._state = { kind: "loading" };
    try {
      const data = await api.getUsers();
      if (data.length === 0) {
        this._state = { kind: "empty" };
      } else {
        this._state = { kind: "success", users: Object.freeze([...data]) };
      }
    } catch (err: unknown) {
      this._state = {
        kind: "error",
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  }
}

// UI 渲染端：模式匹配 (Pattern Matching)，类型安全且零冲突
function renderUserList(state: UserListViewState): string {
  switch (state.kind) {
    case "idle":
      return "请点击加载";
    case "loading":
      return "正在加载中，请稍候...";
    case "empty":
      return "暂无用户数据";
    case "success":
      return `加载成功：共 ${state.users.length} 名用户`;
    case "error":
      return `加载失败：${state.error.message}`;
  }
}
```

---

## 4. 因果解释

1. **同等功能保障**：加载中、空数据、成功渲染与错误反馈所有业务分支均 100% 覆盖。
2. **非法状态从数学上不可表达**：由于 `kind` 字段是字面量判别联合，系统永远不可能同时进入 `loading` 与 `error` 状态，彻底消灭状态机死锁。
3. **TS 编译器全量护航**：在 `switch (state.kind)` 中，若未来新增了一个状态（如 `refreshing`），编译器会自动提示未处理的分支，提供确定的可维护性。

---

## 5. 判定边界与允许例外

- **允许使用独立布尔标志的情况**：
  - 真正正交、彼此完全不影响的 UI 配置项（例如：`isDarkMode: boolean` 与 `sidebarCollapsed: boolean`，这两者互不相干，组合起来任意状态均合法）。

---

## 6. 对应规则

- **W05** (P1): 显式状态建模与避免非法状态
- **W01** (P0): 禁止无声丢失失败
