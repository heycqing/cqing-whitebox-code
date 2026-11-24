# 模式 01：显式扁平控制流 (Explicit Flat Control Flow)

> 核心目标：保持核心业务逻辑在扁平的主干道上流动，先行处理边缘分支、鉴权失败和前置约束，消除深层条件嵌套。

---

## 1. 适用场景

任何包含多种前提条件检查（例如参数存在性校验、权限判定、账户状态检查、资源配额限制）的业务操作入口或数据处理管道。

---

## 2. AI 常见反例

AI 代码生成器经常按条件层层堆叠 `if-else`，导致主要业务逻辑被深埋在最内层缩进，且边缘错误分支被割裂在底部数百行之后：

```typescript
// ❌ AI 常见反例：多层嵌套导致主干逻辑深陷，且魔数内联
function processOrderCheckout(user: User, order: Order, couponCode?: string): CheckoutResult {
  if (user != null) {
    if (user.status === 1) { // 状态 1 是什么？无解释魔数
      if (order.items != null && order.items.length > 0) {
        let discount = 0;
        if (couponCode) {
          if (couponCode.startsWith("VIP_") && user.isVip) {
            discount = 0.2;
          } else {
            discount = 0.05;
          }
        }
        const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const finalPrice = total * (1 - discount);
        return { success: true, finalPrice, message: "Checkout completed" };
      } else {
        return { success: false, finalPrice: 0, message: "Order is empty" };
      }
    } else {
      return { success: false, finalPrice: 0, message: "User account suspended" };
    }
  } else {
    return { success: false, finalPrice: 0, message: "User is required" };
  }
}
```

---

## 3. 白盒正例

保持与反例**完全相同的业务逻辑与边缘返回值**，采用卫语句（Guard Clauses）提早返回，提取领域常量消除魔数，控制流平坦清晰：

```typescript
// ✅ 白盒正例：卫语句提早返回，主干平铺，完全保留所有边缘分支
const USER_STATUS_ACTIVE = 1;
const VIP_COUPON_PREFIX = "VIP_";
const VIP_DISCOUNT_RATE = 0.2;
const STANDARD_COUPON_DISCOUNT_RATE = 0.05;

function calculateDiscount(couponCode: string | undefined, isVip: boolean): number {
  if (!couponCode) return 0;
  if (couponCode.startsWith(VIP_COUPON_PREFIX) && isVip) {
    return VIP_DISCOUNT_RATE;
  }
  return STANDARD_COUPON_DISCOUNT_RATE;
}

function processOrderCheckout(user: User, order: Order, couponCode?: string): CheckoutResult {
  // 1. 卫语句：校验前置条件，快速失败并明确因果
  if (!user) {
    return { success: false, finalPrice: 0, message: "User is required" };
  }
  if (user.status !== USER_STATUS_ACTIVE) {
    return { success: false, finalPrice: 0, message: "User account suspended" };
  }
  if (!order.items || order.items.length === 0) {
    return { success: false, finalPrice: 0, message: "Order is empty" };
  }

  // 2. 主干通道：无缩进平铺执行计算
  const discount = calculateDiscount(couponCode, Boolean(user.isVip));
  const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const finalPrice = total * (1 - discount);

  return { success: true, finalPrice, message: "Checkout completed" };
}
```

---

## 4. 因果解释

1. **同等功能保障**：正例完整覆盖了 `!user`、`user.status !== 1`、`!order.items` 以及各类优惠券计算的所有边缘分支，未删减任何需求。
2. **认知负荷骤降**：阅读者可以在前 10 行确认所有拒绝准入的条件，不需要记住层层 `if` 的前置断言。
3. **可推演性**：任何修改只需在对应的卫语句处追加，无需在内层复杂的闭合括号中小心翼翼地对齐。

---

## 5. 不适用 / 例外

- **树形/图深度递归算法**：如 AST 节点遍历、DOM 树解析等自然递归结构，嵌套属于算法固有属性，此场景不强求卫语句扁平化。
- **不可拆分的互斥分支**：少数必须严格两两配对的事务分支（如两阶段提交或加解密锁包裹）。

---

## 6. 对应规则

- **W04** (P1): 显式扁平控制流（嵌套深度 $>3$ 视为审查信号）
- **W12** (P2): 显式领域概念与消除魔数
