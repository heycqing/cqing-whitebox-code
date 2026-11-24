# JavaScript 语言白盒规范适配指南

> 适用版本：ECMAScript 2022+ (ES2022+) / Node.js 18+  
> 权威参考：[ECMA-262 规范 (Error.cause)](https://tc39.es/ecma262/#sec-error-objects) | [MDN Web Docs: Error.cause](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)  
> 核验日期：2026-11

---

## 1. 语言特性与白盒映射

JavaScript 作为动态弱类型语言，在白盒代码实践中面临两个主要挑战：
1. **类型在运行时缺失**：外部调用者可以传入任意对象，若缺少显式边界守卫，容易导致未定义属性穿透；
2. **异步失败极易静默**：未捕获的 Promise rejection 或丢失的 `await` 会造成执行时序撕裂与未处理拒绝（Unhandled Promise Rejection）。

| 通用白盒规则 | JavaScript 适配关键点 | 推荐实现方式 | 验证方法 |
|---|---|---|---|
| **W01 (P0: 禁止无声吞错)** | 异步 Promise 链必须保证 rejection 被捕获并处理；catch 块严禁留空 | `await` 配合 `try...catch`，或返回含 cause 的自定义异常 | 静态检查（ESLint: `no-empty`, `no-unused-vars`）+ 运行时 `unhandledRejection` 监听 |
| **W02 (P0: 禁止未声明修改)** | 规避就地变动入参对象/数组，防范原型链污染 | 展开运算符 `{ ...obj }`，`Object.freeze()` 防护只读数据 | 运行时断言，冻结测试对象拦截修改 |
| **W06 (P1: 边界校验与断言)** | 运行时边界必须进行严格类型与字段检查 | 使用类型收窄辅助函数 (`typeof`, `Array.isArray`) 过滤外部数据 | 单元测试构造非法 payload 验证拦截 |
| **W07 (P1: 保留错误因果链)** | 跨层异常重新包装时必须保留根因堆栈 | 原生 `new Error(msg, { cause: err })` (ES2022+) | 检查打印的日志是否包含完整的 `cause` 链 |
| **W10 (P1: 禁伪防御性空值)** | 核心必填字段禁止滥用 `?.` 和 `?? ""` 假冒成功 | 显式前置验证，缺失关键参数立即抛出 `TypeError` | 单测覆盖缺失字段场景，确保快速失败 |

---

## 2. 惯用写法与规则落地

### 2.1 异常因果传递 (ES2022+ Error.cause)
从 ECMAScript 2022 起，JavaScript 原生支持 `Error` 构造函数的第二个参数选项 `{ cause }`。在包装底层异常时，必须传递原始错误：
```javascript
try {
  await databaseDriver.connect();
} catch (err) {
  // 原生标准方式保留 cause
  throw new Error("Database initialization failed", { cause: err });
}
```

### 2.2 契约防御与不可变数据流
在 JavaScript 中，函数默认传引用。若要防止意外就地修改，可约定对外返回只读数据，内部使用展开运算符创建新副本：
```javascript
export function appendTransaction(history, newTx) {
  // 不可变操作：不调用 history.push(newTx)
  return [...history, Object.freeze({ ...newTx })];
}
```

### 2.3 异步控制流与无声失败规避
杜绝忽略异步返回值：
```javascript
// ❌ 错误：未 await 导致后台 rejection 变成未捕获异常
function triggerSync(task) {
  backgroundUpload(task); // 丢失因果！
}

// ✅ 正确：显式 await 并处理异常，或明确注册 .catch
async function triggerSync(task) {
  try {
    await backgroundUpload(task);
  } catch (err) {
    logger.error("Background sync failed", { taskId: task.id, cause: err });
    throw err;
  }
}
```
