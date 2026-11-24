# React 白盒模式正反例

> 本文档提供 React 18+ 环境下的白盒模式正反例对比，重点演示异步请求状态机建模与 Effect 副作用治理。

---

## 示例 1：异步加载生命周期的状态机建模 (W05)

### 业务场景
商品详情卡片组件：支持初始状态、加载中、展示详情以及网络异常时的重试提示。

### ❌ 反例 (黑盒：组合多个 useState，时序混乱易死锁)

```tsx
// ❌ 错误示范：散落的 boolean flags，容易漏置状态
import React, { useState, useEffect } from "react";

export function ProductCard({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchProduct(productId)
      .then((data) => {
        setProduct(data);
        setLoading(false); // 若此时网络抛错，loading 永远停留在 true！
      })
      .catch((err) => {
        // 漏写了 setLoading(false)！
        setError(err.message);
      });
  }, [productId]);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!product) return null;
  return <div>{product.name}</div>;
}
```

### ✅ 正例 (白盒：判别联合，状态转移自洽且排他)

```tsx
// ✅ 正确示范：状态机单一源头，类型驱动 UI
import React, { useState, useEffect } from "react";

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

export type ProductCardState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "success"; readonly product: Product }
  | { readonly kind: "error"; readonly message: string };

export function ProductCard({ productId }: { productId: string }) {
  const [state, setState] = useState<ProductCardState>({ kind: "idle" });

  useEffect(() => {
    let isCancelled = false;
    setState({ kind: "loading" });

    fetchProduct(productId)
      .then((data) => {
        if (!isCancelled) {
          setState({ kind: "success", product: Object.freeze(data) });
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "获取商品详情失败";
          setState({ kind: "error", message });
        }
      });

    return () => {
      // 保证组件卸载或 id 变更时清理副作用，防范内存泄漏与竞态覆盖
      isCancelled = true;
    };
  }, [productId]);

  switch (state.kind) {
    case "idle":
      return null;
    case "loading":
      return <div role="status">商品加载中，请稍候...</div>;
    case "error":
      return <div role="alert" className="error-banner">加载失败：{state.message}</div>;
    case "success":
      return (
        <div className="product-card">
          <h4>{state.product.name}</h4>
          <p>售价：¥{state.product.price.toFixed(2)}</p>
        </div>
      );
  }
}
```

---

## 示例 2：错误边界与单点记录 (W01, W07)

### 业务场景
在组件树顶层提供 ErrorBoundary，防止局部页面渲染奔溃蔓延导致全站白屏，并单点上报监控。

### ✅ 白盒正例代码

```tsx
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  readonly fallbackTitle?: string;
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly errorId: string | null;
}

export class SafeModuleBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    errorId: null
  };

  public static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, errorId: crypto.randomUUID() };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 【处置边界单点记录】：上报完整错误堆栈与组件树调用帧
    window.telemetryClient?.reportError({
      errorId: this.state.errorId,
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="module-error-fallback" role="alert">
          <h3>{this.props.fallbackTitle ?? "该模块暂时无法加载"}</h3>
          <p>故障已记录（错误追踪码：{this.state.errorId}），请刷新重试。</p>
        </div>
      );
    }
    return this.props.children;
  }
}
```
