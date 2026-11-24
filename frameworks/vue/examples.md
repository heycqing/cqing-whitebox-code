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

### ✅ 正例 (白盒：联合状态机 + 显式依赖注入 + 错误现场保留)

```typescript
// ✅ 正确示范：使用联合状态机建模，显式注入获取函数，技术错误现场单点保留，UI 呈现安全文案
import { ref, readonly } from "vue";

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

// 显式声明数据获取契约与日志函数，避免调用未声明全局符号
export type NotificationFetcher = () => Promise<readonly NotificationItem[]>;
export type NotificationLogger = (err: unknown, errorId: string) => void;

export type NotificationState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "empty" }
  | { readonly kind: "success"; readonly items: readonly NotificationItem[] }
  | { readonly kind: "error"; readonly errorId: string; readonly userMessage: string };

export function useNotifications(
  fetchNotificationsApi: NotificationFetcher,
  logger?: NotificationLogger
) {
  const _state = ref<NotificationState>({ kind: "idle" });

  async function fetchNotifications(): Promise<void> {
    _state.value = { kind: "loading" };
    try {
      const data = await fetchNotificationsApi();
      if (!Array.isArray(data) || data.length === 0) {
        _state.value = { kind: "empty" };
      } else {
        _state.value = {
          kind: "success",
          items: Object.freeze(data.map((item) => ({ ...item })))
        };
      }
    } catch (err: unknown) {
      const errorId = crypto.randomUUID();

      // 【处置边界单点记录】：记录原始技术异常因果与调用堆栈，防止无声丢失 (W01, W07)
      if (logger) {
        logger(err, errorId);
      } else {
        console.error(`[useNotifications] Fetch notifications failed (trace: ${errorId}):`, err);
      }

      // 【安全文案展示】：UI 仅展示友好提示与排查追踪码，严禁直接把未经脱敏的 err.message 暴露给用户 (W11)
      _state.value = {
        kind: "error",
        errorId,
        userMessage: "通知列表暂时无法加载，请检查网络或稍后重试"
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

export interface TelemetryReport {
  readonly traceId: string;
  readonly error: unknown;
  readonly info: string;
}

export type GlobalTelemetryClient = {
  reportError: (report: TelemetryReport) => void;
};

// 显式声明全局遥测依赖接口（示例中提供默认安全降级）
declare global {
  interface Window {
    telemetryClient?: GlobalTelemetryClient;
  }
}

const app = createApp(App);

// 【全局处置边界单点记录】：记录全应用生命周期中未被局部拦截的逃逸异常
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
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack, cause: err.cause } : String(err),
    info
  });
};

app.mount("#app");
```

```vue
<!-- SafeWidget.vue - 局部降级组件 -->
<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";

export interface SafeWidgetProps {
  readonly fallbackTitle?: string;
  readonly logger?: (payload: { errorId: string; error: unknown; info: string }) => void;
}

const props = withDefaults(defineProps<SafeWidgetProps>(), {
  fallbackTitle: "小部件内容暂时无法加载"
});

const hasError = ref(false);
const errorId = ref<string | null>(null);

onErrorCaptured((err: unknown, targetInstance, info) => {
  const traceId = crypto.randomUUID();
  hasError.value = true;
  errorId.value = traceId;

  // 【局部处置边界单点记录】：既然返回 false 拦截了冒泡，就必须由本组件承担完整记录责任！
  // 记录完整因果、堆栈与组件上下文，严禁无声吞错
  const logPayload = {
    errorId: traceId,
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack, cause: err.cause } : String(err),
    info,
    componentName: targetInstance?.$options?.name ?? "ChildWidget"
  };

  if (props.logger) {
    props.logger(logPayload);
  } else {
    console.error(`[SafeWidget Error Boundary] traceId: ${traceId}`, logPayload);
  }

  // 返回 false 阻止继续向上传播（防止被 app.config.errorHandler 重复打印造成日志洪泛）
  return false;
});
</script>

<template>
  <div v-if="hasError" class="widget-fallback" role="alert">
    <!-- 安全防护：UI 仅展示脱敏后的友好文案与追踪码，绝不把原始 err.message 直接输出给用户 -->
    <p>{{ fallbackTitle }}，请稍后刷新重试（故障追踪号：{{ errorId }}）</p>
  </div>
  <slot v-else />
</template>
```
