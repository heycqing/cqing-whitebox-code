# Python 语言白盒规范适配指南

> 适用版本：Python 3.10+  
> 权威参考：[PEP 3134 – Exception Chaining and Embedded Tracebacks](https://peps.python.org/pep-3134/) | [Python Tutorial: Default Argument Values](https://docs.python.org/3/tutorial/controlflow.html#default-argument-values) | [Python Logging HOWTO](https://docs.python.org/3/howto/logging.html)  
> 核验日期：2026-11

---

## 1. 语言特性与白盒契约映射

Python 的动态特性与灵活性极高，在白盒工程化中需重点规避“可变默认参数暗中共享”、“裸 except 吞掉系统信号”以及“重新抛出异常时割裂原始 Traceback”。

| 通用白盒规则 | Python 适配关键点 | 推荐实现方式 | 验证方法 |
|---|---|---|---|
| **W01 (P0: 禁止无声吞错)** | 绝对禁止裸 `except:`，避免捕获并吞掉 `KeyboardInterrupt` / `SystemExit`；避免无日志的 pass | 捕获具体异常类型（如 `except (KeyError, ValueError) as e:`），或记录完整 `logger.exception()` | Flake8 / Ruff 规则 `E722` (do not use bare 'except') |
| **W02 (P0: 禁止未声明修改)** | 严禁使用可变对象（list、dict）作为函数默认实参；入参避免就地变动 | `def func(items: list | None = None): items = list(items) if items is not None else []` | 静态检查（Ruff `B006`），单测多次调用验证默认参数独立性 |
| **W04 (P1: 显式扁平控制流)** | 提早返回，卫语句减少缩进，善用上下文管理器 `with` | 利用 guard clauses 快速 return，利用 `contextlib` 保持流程平坦 | 人工代码审查或静态圈复杂度检测 |
| **W07 (P1: 保留错误因果链)** | 转换或包装自定义异常时，必须保留底层原始回溯 | 原生语法 `raise CustomError(...) from err` (PEP 3134) | 触发异常检查打印的 Traceback 是否包含 `The above exception was the direct cause...` |
| **W11 (P2: 最小必要日志与脱敏)** | 日志输出结构化上下文，不泄露密钥，单点记录 | 使用 `logger.exception()` 自动附加 `exc_info=True`，配合 `extra={"request_id": req_id}` | 单元测试捕获 `caplog` 校验字段 |

---

## 2. 惯用写法与规则落地

### 2.1 PEP 3134 显式异常因果链 (`raise ... from ...`)
当捕获底层库（如 `requests`、`asyncpg`、`redis`）抛出的低级异常并向业务层转换时，必须使用 `from err` 显式关联：

```python
import logging
from typing import Any

logger = logging.getLogger(__name__)

class PaymentGatewayError(Exception):
    def __init__(self, message: str, transaction_id: str):
        super().__init__(message)
        self.transaction_id = transaction_id

def charge_customer(transaction_id: str, amount_cents: int) -> dict[str, Any]:
    try:
        return payment_sdk.charge(tx_id=transaction_id, amount=amount_cents)
    except ThirdPartyNetworkTimeout as err:
        # ✅ 正确：显式保留原始底层网络超时异常作为 cause
        raise PaymentGatewayError(
            f"Payment provider timed out for tx: {transaction_id}",
            transaction_id=transaction_id
        ) from err
```

### 2.2 防范可变默认实参陷阱 (B006)
在 Python 中，函数定义中的默认实参在函数加载时仅求值一次并全局共享。如果使用 `def append_to(item, target=[])`，会导致多个调用者共享同一个列表实例：

```python
# ❌ 错误示范：致命的共享状态篡改
def register_user(username: str, tags: list[str] = []) -> dict:
    tags.append("active")  # 所有用户将共享并不断累加 tags 列表！
    return {"username": username, "tags": tags}

# ✅ 正确示范：使用 None 并在函数体内按需新建副本
def register_user(username: str, tags: list[str] | None = None) -> dict:
    resolved_tags = list(tags) if tags is not None else []
    resolved_tags.append("active")
    return {"username": username, "tags": resolved_tags}
```

### 2.3 边界日志结构化与 trace 关联
使用标准库 `logging.LoggerAdapter` 或 `extra` 字典，仅在服务边界记录日志：

```python
def handle_incoming_request(request_data: dict, request_id: str):
    extra_context = {"request_id": request_id}
    try:
        result = process_order(request_data)
        logger.info("Order processed successfully", extra=extra_context)
        return result
    except Exception as err:
        # ✅ 边界单点记录：logger.exception 自动捕获完整的 cause 链和调用堆栈
        logger.exception("Order processing failed at boundary", extra=extra_context)
        raise
```
