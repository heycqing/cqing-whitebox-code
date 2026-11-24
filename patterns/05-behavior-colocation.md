# 模式 05：行为就近编排 (Behavior Colocation)

> 核心目标：将强相关的状态定义、衍生逻辑与修改动作组织在物理相近的上下文（同一文件或同级特性目录）中，消除按技术名词机械切割导致的跨文件跳转与脑力消耗。

---

## 1. 适用场景

业务特性模块（如购物车交互、审批工作流、表单验证器）的状态管理与衍生计算。

---

## 2. AI 常见反例

AI 代码生成器经常机械套用“架构分层模板”，把一个仅有 30 行业务逻辑的小特性强行拆散在 4 个完全不同的顶层目录：

```text
src/
├── types/cart.ts                 # 仅定义一个 CartState 接口
├── utils/format-cart-item.ts     # 仅包含一个格式化金额的单行函数
├── constants/cart-status.ts      # 定义 CART_OPEN = "OPEN"
└── components/CartView.tsx       # 渲染组件，跨文件引用上述所有文件
```

```typescript
// ❌ AI 常见反例：跨越多个孤立文件，理解一个按钮点击需要同时打开 4 个窗口
// components/CartView.tsx
import { CartState } from "@/types/cart";
import { formatCartCurrency } from "@/utils/format-cart-item";
import { CART_ACTIVE_STATUS } from "@/constants/cart-status";

export function CartView({ cart, onUpdate }: { cart: CartState; onUpdate: (c: CartState) => void }) {
  // 逻辑散落在外，组件内部只做零散胶水
  const formattedTotal = formatCartCurrency(cart.total);
  // ...
}
```

---

## 3. 白盒正例

保持**完全相同的组件呈现与交互逻辑**，采用“特性就近原则（Feature Colocation）”，将该特性私有的类型、衍生计算、格式化器与状态机收拢在一个独立、自洽的文件或特性文件夹中：

```typescript
// ✅ 白盒正例：高内聚特性包，局部自洽，所有依赖与行为一屏尽览
// features/cart/CartDrawer.tsx

// 1. 就近定义领域私有类型与常量（不污染全局 types）
const CART_DISCOUNT_THRESHOLD = 100;
const STANDARD_TAX_RATE = 0.08;

export interface CartItem {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
}

export interface CartState {
  readonly items: readonly CartItem[];
}

// 2. 就近封装纯计算逻辑（易于本地测试，无需跳入 utils）
export function computeCartSummary(items: readonly CartItem[]) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const discount = subtotal >= CART_DISCOUNT_THRESHOLD ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * STANDARD_TAX_RATE;
  const finalTotal = subtotal - discount + tax;

  return {
    subtotal,
    discount,
    tax,
    finalTotal,
    formattedTotal: `¥${finalTotal.toFixed(2)}`
  };
}

// 3. 就近渲染组件
export function CartDrawer({ cart, onCheckout }: { cart: CartState; onCheckout: (total: number) => void }) {
  const summary = computeCartSummary(cart.items);

  return (
    <div className="cart-drawer">
      <h3>购物车明细</h3>
      <ul>
        {cart.items.map((it) => (
          <li key={it.id}>{it.name} x {it.quantity} - ¥{(it.price * it.quantity).toFixed(2)}</li>
        ))}
      </ul>
      <div className="summary-block">
        <p>合计：{summary.formattedTotal} (含税 ¥{summary.tax.toFixed(2)})</p>
        <button onClick={() => onCheckout(summary.finalTotal)}>确认结算</button>
      </div>
    </div>
  );
}
```

---

## 4. 因果解释

1. **同等功能保障**：结算计算、税费计算、格式化展示与交互事件完全相同，没有删减任何业务边界条件。
2. **重构与删除极其简单**：当产品决定下线或重构该购物车抽屉时，开发者只需关注 `features/cart/CartDrawer.tsx`，不会在全局 `utils/` 和 `types/` 遗留无法确定是否被其他模块使用的无主死代码（Zombie Code）。
3. **推演成本最低**：修改税费或优惠阈值时，在当前文件直接就能看到它对 UI 渲染的影响。

---

## 5. 不适用 / 例外

- **真正被 3 个以上独立业务模块跨域调用的通用基础设施**：例如底层的日期解析库、安全加解密套件、统一 HTTP 请求客户端。此类经证实的高频共用逻辑方可沉淀至全局 `packages/` 或 `lib/`。

---

## 6. 对应规则

- **W08** (P1): 行为就近编排原则
- **W03** (P1): 消除无边界职责的幽灵抽象
