# Vue 框架白盒规范适配指南

> 适用版本：Vue 3.x (Composition API)  
> 权威参考：  
> - [Vue 3 官方指南：Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)  
> - [Vue 3 官方指南：State Management & Composables](https://vuejs.org/guide/scaling-up/state-management.html)  
> - [Vue 3 官方 API：onErrorCaptured](https://vuejs.org/api/composition-api-lifecycle.html#onerrorcaptured) | [app.config.errorHandler](https://vuejs.org/api/application.html#app-config-errorhandler)  
> 核验日期：2026-11

---

## 1. 框架特性与白盒契约映射

Vue 3 的响应式基于 Proxy，支持深度响应式与细粒度追踪。在白盒实践中，核心在于防范“跨组件深层篡改响应式对象”与“组合式函数无边界蔓延”。

| 通用白盒规则 | Vue 3 适配关键点 | 推荐实现方式 | 验证方法 |
|---|---|---|---|
| **W01 (P0: 禁止无声吞错)** | 生命周期钩子与异步 watcher 中抛出异常被静默处理 | 全局统一配置 `app.config.errorHandler` 兜底；局部使用 `onErrorCaptured` | 单元测试模拟异常抛出，检查全局 errorHandler 是否收到错误与实例 |
| **W02 (P0: 禁止未声明修改)** | 严禁子组件通过 Props 传入的 `reactive` 对象直接就地修改属性 | 外部只暴露 `readonly(state)`；修改必须调用 Composable 暴露的具名方法 | 在开发环境下修改 `readonly` 响应式对象会触发 Vue 警告 |
| **W05 (P1: 显式状态建模)** | 避免在组合式函数中定义多个独立的 boolean ref (`isLoading`, `isError`) | 使用联合字面量 `ref<'idle' | 'loading' | 'success' | 'error'>` 或状态对象 | 状态机转移逻辑单测 |
| **W08 (P1: 行为就近编排)** | 避免无意义的全局单一 Pinia Store 膨胀，把局部状态割裂在外面 | 采用就近原则构建特性级 Composable (`useUserProfile.ts`) | 特性目录自包含性检查 |
| **W09 (P1: 命名与副作用一致)** | `computed` 必须是无副作用的纯计算；副作用只在事件回调或 `watch` 中显式执行 | 严禁在 `computed` 内部修改其他响应式状态或发起网络请求 | Vue 官方静态 lint 规则 `vue/no-side-effects-in-computed-properties` |

---

## 2. 惯用写法与规则落地

### 2.1 只读暴露与显式修改 (State Management 规范)
根据 Vue 官方状态管理指南，当需要在多个组件间共享响应式状态时，应将内部状态保持私有，对外暴露 `readonly` 视图，并通过显式命名的函数（Actions）进行变动：

```typescript
// useAuthUser.ts
import { ref, readonly } from "vue";

interface UserInfo {
  id: string;
  name: string;
}

const _user = ref<UserInfo | null>(null);

export function useAuthUser() {
  // ✅ 外部只读：防止外部任意组件直接 _user.value.name = "xxx"
  const user = readonly(_user);

  // ✅ 显式副作用方法：变动来源清晰可查
  function updateUserName(newName: string) {
    if (!newName.trim()) {
      throw new Error("User name cannot be empty");
    }
    if (_user.value) {
      _user.value = { ..._user.value, name: newName };
    }
  }

  return { user, updateUserName };
}
```

### 2.2 计算属性纯净性 (Computed Purity)
`computed` 的 getter 仅用于从已有响应式状态推导结果，绝不能触发写操作：
```typescript
// ❌ 错误：在 computed 中产生副作用
const formattedPrice = computed(() => {
  auditLog.push("Price calculated"); // 违背纯函数原则！
  return `¥${price.value.toFixed(2)}`;
});

// ✅ 正确：纯推导
const formattedPrice = computed(() => `¥${price.value.toFixed(2)}`);
```

### 2.3 错误处置边界 (`onErrorCaptured` 与全局 handler)
- **处置责任与单点记录**：
  - 若局部组件使用 `onErrorCaptured` 拦截并展示降级 UI，且通过返回 `false` 阻止继续向上冒泡，则**该局部组件即为当前错误的处置边界**。处置边界必须在拦截处单点记录包含完整 `cause`、堆栈与 `traceId` 的错误日志，不可返回 `false` 却不记录任何日志（否则构成 W01 无声吞错）；同时，UI 界面仅展示脱敏安全文案，禁止将底层技术堆栈或裸 `err.message` 直接输出给终端用户。
  - 若当前组件无法提供降级修复，则不得返回 `false`，让异常自然冒泡至根节点的 `app.config.errorHandler` 进行全局单点兜底记录，杜绝层层重复打印。
