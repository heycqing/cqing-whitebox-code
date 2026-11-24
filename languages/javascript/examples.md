# JavaScript 白盒模式正反例

> 本文档提供 JavaScript 环境下常见白盒规则的可执行正反例对比，严格保持相同业务逻辑。

---

## 示例 1：异步批量任务中的失败与因果保留 (W01, W07)

### 业务场景
处理一批外部用户同步任务，记录成功与失败详情。如果单个用户同步失败，保留其失败原因并在最终摘要中呈现，不使整个任务崩溃，但严禁静默吞掉异常。

### ❌ 反例 (黑盒：静默吞错、丢失堆栈)

```javascript
// ❌ 错误示范：catch 块吞掉错误，仅返回 null，无法得知失败原因
async function syncUsersBatch(userIds, apiClient) {
  const results = [];
  for (const id of userIds) {
    try {
      const res = await apiClient.syncUser(id);
      results.push({ id, status: "SUCCESS", data: res });
    } catch (e) {
      // 致命 W01：静默吞噬，外界完全不知道是网络超时、404 还是凭证失效
      results.push({ id, status: "FAILED", data: null });
    }
  }
  return results;
}
```

### ✅ 正例 (白盒：保留因果、单点记录)

```javascript
// ✅ 正确示范：保留错误 cause，区分失败原因，不无声吞错
class SyncUserError extends Error {
  constructor(userId, cause) {
    super(`Failed to sync user: ${userId}`, { cause });
    this.name = "SyncUserError";
    this.userId = userId;
  }
}

async function syncUsersBatch(userIds, apiClient) {
  if (!Array.isArray(userIds)) {
    throw new TypeError("userIds must be an array");
  }

  const results = [];
  for (const id of userIds) {
    try {
      const res = await apiClient.syncUser(id);
      results.push({
        id,
        status: "SUCCESS",
        data: Object.freeze({ ...res })
      });
    } catch (err) {
      // 保留因果：包装为带 cause 的领域异常，附带具体错误消息
      const syncErr = new SyncUserError(id, err);
      results.push({
        id,
        status: "FAILED",
        error: {
          message: syncErr.message,
          reason: err instanceof Error ? err.message : String(err)
        }
      });
    }
  }
  return Object.freeze(results);
}
```

---

## 示例 2：入参不可变与显式声明 (W02, W09)

### 业务场景
对购物车列表应用折扣券，返回打折后的商品明细与总价。

### ❌ 反例 (黑盒：未声明的原地修改、虚假只读命名)

```javascript
// ❌ 错误：名为 computeCartTotal（只读计算语义），却直接修改了传入的 cartItems 数组中对象的 price！
function computeCartTotal(cartItems, discountRate) {
  let total = 0;
  for (let i = 0; i < cartItems.length; i++) {
    // 致命 W02：就地篡改外部对象属性！
    cartItems[i].price = cartItems[i].price * (1 - discountRate);
    total += cartItems[i].price;
  }
  return total;
}
```

### ✅ 正例 (白盒：不可变浅拷贝、无副作用计算)

```javascript
// ✅ 正确：保持入参纯净，返回新数组与新计算结果
function computeCartWithDiscount(cartItems, discountRate) {
  if (!Array.isArray(cartItems)) {
    throw new TypeError("cartItems must be an array");
  }
  if (typeof discountRate !== "number" || discountRate < 0 || discountRate > 1) {
    throw new RangeError("discountRate must be a float between 0 and 1");
  }

  // 浅拷贝更新每个项目，保持原始 cartItems 不受影响
  const discountedItems = cartItems.map((item) => ({
    ...item,
    originalPrice: item.price,
    discountedPrice: Number((item.price * (1 - discountRate)).toFixed(2))
  }));

  const total = discountedItems.reduce((sum, item) => sum + item.discountedPrice, 0);

  return {
    items: Object.freeze(discountedItems),
    total: Number(total.toFixed(2))
  };
}
```
