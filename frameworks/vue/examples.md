# Vue 白盒模式正反例

> 本文档提供 Vue 3 (Composition API) 环境下的白盒模式正反例对比，重点演示响应式不可变防护、状态机 Composable 与全局/局部错误边界。

---

## 示例 1：特性级 Composable 与状态机建模 (W05, W08)

### 业务场景
数据分页加载列表（如通知中心）：支持空数据、加载中、正常列表呈现与加载失败提示。

### ❌ 反例 (黑盒：散落的 ref boolean、跨层隐式篡改)

```typescript
// ❌ 错误示范：多个独立的 boolean ref，在组件模板中层层 v-if 判断
import { ref } from "vue";

export function useNotifications() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const notifications = ref<any[]>([]);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.getNotifications();
      notifications.value = res.data;
      loading.value = false;
    } catch (e: any) {
      // 遗漏：忘记设置 loading.value = false！
      error.value = e.message;
    }
  }

  // 暴露了可直接深层修改的 notifications 数组，子组件可能直接 notifications.value.splice(...)
  return { loading, error, notifications, load };
}
```

### ✅ 正例 (白盒：联合状态机 + 只读暴露)

```typescript
// ✅ 正确示范：使用联合状态机建模，只读暴露，状态转移闭环
import { ref, readonly } from "vue";

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export type NotificationState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | { readonly kind: "success"; readonly items: readonly NotificationItem[] }
  | { readonly kind: "error"; readonly message: string };

export function useNotifications() {
  const _state = ref<NotificationState>({ kind: "idle" });

  async function fetchNotifications(): Promise<void> {
    _state.value = { kind: "loading" };
    try {
      const data = await api.getNotifications();
      if (!Array.isArray(data) || data.length === 0) {
        _state.value = { kind: "empty" };
      } else {
        _state.value = {
          kind: "success",
          items: Object.freeze(data.map((item) => ({ ...item })))
        };
      }
    } catch (err: unknown) {
      _state.value = {
        kind: "error",
        message: err instanceof Error ? err.message : "获取通知失败，请稍后重试"
      };
    }
  }

  return {
    // 外部只读消费
    state: readonly(_state),
    fetchNotifications
  };
}
```

---

## 示例 2：Vue 全局与局部错误捕获处置边界 (W01, W07)

### 业务场景
在 Vue 应用启动时配置全局错误捕获，在局部卡片组件使用 `onErrorCaptured` 处理降级。

### ✅ 白盒正例代码

```typescript
// main.ts - 全局单点处置边界
import { createApp } from "vue";
import App from "./App.vue";

const app = createApp(App);

// 【处置边界单点记录】：记录全应用生命周期与渲染期逃逸异常
app.config.errorHandler = (err, instance, info) => {
  const traceId = crypto.randomUUID();
  console.error(`[Global Error Handler] traceId: ${traceId}`, {
    error: err,
    componentName: instance?.$options?.name ?? "AnonymousComponent",
    lifecycleHook: info
  });

  // 上报远程监控
  window.telemetryClient?.reportError({
    traceId,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    info
  });
};

app.mount("#app");
```

```vue
<!-- SafeWidget.vue - 局部降级组件 -->
<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";

const hasError = ref(false);
const errorInfo = ref("");

onErrorCaptured((err, targetInstance, info) => {
  // 捕获后代组件错误，展示局部降级卡片
  hasError.value = true;
  errorInfo.value = err instanceof Error ? err.message : String(err);
  
  // 返回 false 阻止继续向上传播（若当前卡片已完成自愈降级）
  return false;
});
</script>

<template>
  <div v-if="hasError" class="widget-fallback" role="alert">
    <p>小部件加载遇到问题：{{ errorInfo }}</p>
  </div>
  <slot v-else />
</template>
```
