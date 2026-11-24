# 反模式 AP02：无边界职责的幽灵抽象 (Ghost Abstraction)

> 严重级别：**P1（审查与重构项）**  
> 核心判定：抽象层仅执行简单机械的参数透传，既无契约转换，也无依赖隔离或错误处理，徒增跳转认知负担。

---

## 1. 表现形态与判定证据

### 表现形态
为每个简单操作生搬硬套地包裹一层类或函数。常见于“经典三层架构强迫症”：`Controller` -> `Service` -> `Manager` -> `DAO` -> `Repository`，其中中间两层甚至三层的内容仅仅是把入参原封不动地传给下一层。

### 判定证据
1. 函数体内部仅包含单行对另一函数的调用。
2. 入参与出参完全透传，没有任何字段映射、计算、参数校验或错误包装。
3. 该抽象仅有单一调用方，不存在多处复用。
4. **审阅核心原则**：按职责判断，不以单次调用自动判错。若单次调用具有防腐层、单测 mock 缝隙或平台 SDK 隔离职责，则属于合法设计；若无任何边界职责，则判定为幽灵抽象。

---

## 2. 危害与因果破坏

1. **调用栈噪音**：排查问题或阅读代码时，需要在 4~5 个文件之间频繁跳转（F12），打断心流。
2. **重构阻力**：修改一个参数字段时，必须同步修改所有中间透传层的签名。

---

## 3. 代码对比 (保持同等业务功能)

### ❌ 黑盒反例

```typescript
// 业务要求：获取用户基础配置信息
// user.controller.ts
export async function getUserSettings(userId: string) {
  return userSettingsManager.fetch(userId); // 仅跳转
}

// user-settings.manager.ts
export class UserSettingsManager {
  async fetch(userId: string) {
    return userSettingsService.getSettings(userId); // 仅跳转
  }
}

// user-settings.service.ts
export class UserSettingsService {
  async getSettings(userId: string) {
    // 实际执行位置
    return db.table("settings").where({ userId }).first();
  }
}
```

### ✅ 白盒正例

```typescript
// ✅ 白盒正例：消除无意义中间透传，职责边界清晰合并
// user-settings.service.ts（作为业务与数据访问的直接边界）
export class UserSettingsService {
  constructor(private readonly dbClient: DatabaseClient) {}

  async getSettings(userId: string): Promise<UserSettings | null> {
    if (!userId) {
      throw new IllegalArgumentError("userId is required");
    }
    return this.dbClient.table("settings").where({ userId }).first();
  }
}

// user.controller.ts（直接调用 Service，内联掉幽灵 Manager）
export async function getUserSettings(userId: string, service: UserSettingsService) {
  return service.getSettings(userId);
}
```

---

## 4. 判定边界与允许例外

- **允许保留抽象的情况**：
  - **防腐隔离 (Anti-Corruption Layer)**：即使只有单次调用，但若其职责是将第三方外部 API 的脆弱数据结构转换为系统内部稳定的 Domain Entity，属于合法防腐。
  - **单元测试隔离点**：为屏蔽耗时的真实 I/O 而专门保留的依赖注入接口。
- **必须内联的情况**：
  - 在同一模块内部，既不跨越进程也不跨越架构边界的纯转发包装函数。

---

## 5. 对应规则

- **W03** (P1): 消除无边界职责的幽灵抽象
- **W08** (P1): 行为就近编排原则
