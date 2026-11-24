# React 框架白盒规范适配指南

> 适用版本：React 18.x / React 19.x  
> 权威参考：  
> - [React 官方文档：You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)  
> - [React 官方文档：Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)  
> - [React 官方文档：Catching rendering errors with an Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)  
> 核验日期：2026-11

---

## 1. 框架特性与白盒契约映射

React 采用声明式 UI 与单向数据流。在白盒实践中，核心在于杜绝使用 `useEffect` 隐式同步派生状态，以及避免组合多个 `useState` 布尔值陷入状态地狱。

| 通用白盒规则 | React 适配关键点 | 推荐实现方式 | 验证方法 |
|---|---|---|---|
| **W01 (P0: 禁止无声吞错)** | 渲染期未捕获异常导致整棵组件树白屏 | 使用 `ErrorBoundary` 兜底，并在 `componentDidCatch` 处单点上报因果 | 测试故意 throw 错误验证降级 UI 与监控上报 |
| **W02 (P0: 禁止未声明修改)** | 严禁直接就地修改 `useState` 的引用对象 | 必须调用 `setState(prev => ({ ...prev, updated }))` 不可变更新 | React 严格模式 (StrictMode) 重复渲染检测 |
| **W05 (P1: 显式状态建模)** | 异步请求禁止分散在 `isLoading`, `isError`, `isSuccess` 3 个 `useState` | 使用判别联合状态对象管理请求生命周期（或配合 reducer） | 状态机测试验证不存在 `isLoading && isError` |
| **W08 (P1: 行为就近编排)** | 避免把仅单一组件消费的状态与交互逻辑硬拆到全局 Redux/Store | 提取就近的 Custom Hook (`useOrderCheckout`)，状态与动词自洽 | 目录审查：特性目录自包含 |
| **W09 (P1: 命名与副作用一致)** | `useEffect` 仅用于同步外部系统；纯渲染计算绝不用 effect | 派生状态直接在组件函数体内 `const fullName = firstName + ' ' + lastName` 计算 | ESLint 插件 `react-hooks/rules-of-hooks` |

---

## 2. 惯用写法与规则落地

### 2.1 派生状态不进 Effect (React 官方 "You Might Not Need an Effect")
许多 AI 生成的代码喜欢用 `useEffect` 监听状态变化并 `setOtherState`，造成二次渲染与竞态隐患。白盒规范遵循 React 官方原则：**只要能从现有 props 或 state 计算得出的，直接在渲染期间计算**。

```tsx
// ❌ 反例：滥用 Effect 产生级联渲染与时序脱节
function UserProfile({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [fullName, setFullName] = useState("");
  useEffect(() => {
    setFullName(`${firstName} ${lastName}`);
  }, [firstName, lastName]);
  return <h1>{fullName}</h1>;
}

// ✅ 正例：纯函数直接派生计算，执行路径清晰
function UserProfile({ firstName, lastName }: { firstName: string; lastName: string }) {
  const fullName = `${firstName} ${lastName}`;
  return <h1>{fullName}</h1>;
}
```

### 2.2 异步状态判别联合
异步请求组件采用单一状态对象，杜绝布尔地狱：
```tsx
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };
```

### 2.3 错误边界 (ErrorBoundary) 责任划分
- **渲染异常 (Render Errors)**：由 `ErrorBoundary` 捕获，负责展示全局或局部降级 UI，并在 `componentDidCatch` 中单点上报监控。
- **事件处理器异常 (Event Handler Errors)**：`ErrorBoundary` 无法捕获事件处理器中的异常，事件中的异步错误必须通过 `try...catch` 显式转换为局部 UI 错误状态或通知提示。
