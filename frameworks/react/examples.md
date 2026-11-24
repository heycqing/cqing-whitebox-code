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
// ✅ 正确示范：状态机单一源头，依赖显式注入，UI 脱敏呈现安全文案
import React, { useState, useEffect } from "react";

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

// 显式声明外部数据获取接口，支持业务注入，不产生未声明全局符号
export type ProductFetcher = (productId: string) => Promise<Product>;

export type ProductCardState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "success"; readonly product: Product }
  | { readonly kind: "error"; readonly errorId: string; readonly userMessage: string };

export interface ProductCardProps {
  readonly productId: string;
  readonly fetchProduct: ProductFetcher;
}

export function ProductCard({ productId, fetchProduct }: ProductCardProps) {
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
          const errorId = crypto.randomUUID();
          // 【因果保留】：在处置点记录详细技术日志（含堆栈与 cause），但向用户界面仅展示脱敏安全文案
          console.error(`[ProductCard] Failed to fetch product ${productId} (trace: ${errorId})`, err);
          setState({
            kind: "error",
            errorId,
            userMessage: "商品信息暂时无法加载，请检查网络或稍后重试"
          });
        }
      });

    return () => {
      // 保证组件卸载或 id 变更时清理副作用，防范内存泄漏与竞态覆盖
      isCancelled = true;
    };
  }, [productId, fetchProduct]);

  switch (state.kind) {
    case "idle":
      return null;
    case "loading":
      return <div role="status">商品加载中，请稍候...</div>;
    case "error":
      // 安全展示：UI 呈现脱敏文案与追踪号，避免将原始 SQL、网络 IP 或技术异常暴露给用户
      return (
        <div role="alert" className="error-banner">
          {state.userMessage}（故障排查号：{state.errorId}）
        </div>
      );
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

export interface TelemetryErrorReport {
  readonly errorId: string | null;
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: unknown;
  readonly componentStack?: string | null;
}

export type TelemetryReporter = (report: TelemetryErrorReport) => void;

export interface SafeModuleBoundaryProps {
  readonly fallbackTitle?: string;
  readonly reporter?: TelemetryReporter;
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly errorId: string | null;
}

export class SafeModuleBoundary extends Component<SafeModuleBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorId: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // 纯函数推导：仅从错误推导降级状态，绝不在静态推导函数中生成随机数或执行时钟/网络副作用
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 【处置边界】：在 componentDidCatch 副作用生命周期中生成唯一追踪 ID，确保 UI 与上报共用同一 ID
    const errorId = crypto.randomUUID();
    this.setState({ errorId });

    const report: TelemetryErrorReport = {
      errorId,
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      componentStack: errorInfo.componentStack
    };

    if (this.props.reporter) {
      this.props.reporter(report);
    } else {
      // 上报函数缺失时的保底单点记录，保留完整 cause 与现场堆栈，严禁无声丢失
      console.error(`[SafeModuleBoundary] Error caught at boundary (trace: ${errorId}):`, report);
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="module-error-fallback" role="alert">
          <h3>{this.props.fallbackTitle ?? "该模块暂时无法加载"}</h3>
          <p>
            故障已记录
            {this.state.errorId ? `（错误追踪码：${this.state.errorId}）` : "，正在登记排查凭证..."}
            ，请刷新重试。
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
```
