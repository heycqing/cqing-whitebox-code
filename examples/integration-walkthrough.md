# 白盒规范示例演练与审查示范 (Integration Walkthrough)

> **真实性与验证范围声明**：  
> 本文档面向业务项目协作者，提供标准的白盒工程实践示范。为了践行“代码质量以事实为依据、不得冒充真实验证”的核心纪律，本文档明确区分：
> 1. **【实际运行验证】**：核心纯计算业务逻辑（[examples/payment-checkout.ts](./payment-checkout.ts)）与安全配置加载器（[examples/secure-config.py](./secure-config.py)）为真实代码文件，分别由 Node 22 原生测试（[tests/templates-regression.test.mjs](../tests/templates-regression.test.mjs)）与 Python 3.14 单元测试（[tests/test_secure_config.py](../tests/test_secure_config.py)）实际执行断言覆盖；
> 2. **【说明性参考示例】**：React UI 状态机组件展示如何在前端界面应用判别联合与 W11 安全文案，因本规范库保持零 npm 构建依赖，该 UI 组件属于说明性规范模板，未经过浏览器端打包构建。

---

## 演练 A：TypeScript + React 订单结算演练

### 1. 业务需求与边缘用例契约
- **需求**：为电商收银台实现支持优惠券折抵的订单结算纯计算函数与支付交互卡片。
- **输入**：订单原始总额（`totalAmount`）、优惠券码（`couponCode`）、会员等级（`vipTier`）。
- **必须覆盖的边缘用例与账务恒等式**：
  1. **非法金额拦截**：`totalAmount <= 0`、`NaN`、`Infinity` 或非有限数值直接抛出 `RangeError` (W06)；
  2. **空券处理**：优惠券为空或未传，实付全额，抵扣 0 元；
  3. **VIP 权限边界**：非 VIP 用户使用 VIP 专属券，拒绝使用并返回提示，金额不扣减；
  4. **全额抵扣与账务一致性**：若优惠金额超过或等于订单金额，受最低支付额 `MIN_PAY_AMOUNT = 0.01` 元约束，实付为 0.01 元，实际抵扣额精准调整为 `Number((totalAmount - 0.01).toFixed(2))`。**严格保证账务恒等式：`totalAmount === Number((discount + finalPay).toFixed(2))`**；
  5. **异步支付异常处置**：网络超时或服务异常时，在处置边界记录原始技术错误与堆栈，面向用户界面仅呈现安全脱敏文案与排障追踪号 (W01, W07, W11)。

### 2. 真实纯计算函数实现（已由 Node 自动化测试运行）

真实代码位于 [examples/payment-checkout.ts](./payment-checkout.ts)：

```typescript
export const MIN_PAY_AMOUNT = 0.01;

export interface CheckoutCalculationResult {
  readonly totalAmount: number;
  readonly discount: number;
  readonly finalPay: number;
  readonly couponError?: string;
}

export function computeCheckoutTotal(
  totalAmount: number,
  couponCode: string | undefined,
  vipTier: "STANDARD" | "GOLD" | "PLATINUM" | string
): CheckoutCalculationResult {
  // 1. 严格输入校验：拒绝非有限值、NaN、零与负数 (W06)
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new RangeError("Order totalAmount must be a positive finite number");
  }

  // 2. 无优惠券或空白券
  if (!couponCode || couponCode.trim().length === 0) {
    return { totalAmount, discount: 0, finalPay: totalAmount };
  }

  const cleanCoupon = couponCode.trim();

  // 3. VIP 专属券资格校验 (W04 卫语句提早返回)
  if (cleanCoupon.startsWith("VIP_") && vipTier === "STANDARD") {
    return {
      totalAmount,
      discount: 0,
      finalPay: totalAmount,
      couponError: "此优惠券仅限 VIP 会员使用"
    };
  }

  // 4. 计算名义折扣
  const rawDiscount = cleanCoupon.startsWith("VIP_")
    ? Number((totalAmount * 0.2).toFixed(2))
    : 10;

  // 5. 账务一致性与最低支付额 0.01 元兜底 (严格维持 totalAmount === discount + finalPay)
  let finalPay: number;
  let actualDiscount: number;

  if (totalAmount <= MIN_PAY_AMOUNT) {
    actualDiscount = 0;
    finalPay = totalAmount;
  } else {
    const maxDiscountAllowed = Number((totalAmount - MIN_PAY_AMOUNT).toFixed(2));
    actualDiscount = Number(Math.min(rawDiscount, maxDiscountAllowed).toFixed(2));
    finalPay = Number((totalAmount - actualDiscount).toFixed(2));
  }

  return { totalAmount, discount: actualDiscount, finalPay };
}
```

### 3. 可执行断言验证（已在 `tests/templates-regression.test.mjs` 中运行）

- **测试 10**：验证拒绝 `0`, `-10`, `NaN`, `Infinity`, `-Infinity`，全部触发 `RangeError`；
- **测试 11**：普通订单 `totalAmount = 50, coupon = "NORM_10"`，断言 `discount = 10, finalPay = 40`，严格满足 `50 === 10 + 40`；
- **测试 12**：全额券 `totalAmount = 10, coupon = "NORM_10"`，受最低支付 0.01 约束，断言 `finalPay = 0.01, discount = 9.99`，严格满足 `10 === 9.99 + 0.01`；
- **测试 13**：非 VIP 用户使用 VIP 券，断言 `discount = 0, finalPay = 100` 并提示 `couponError`。

### 4. React UI 状态机与安全文案示例（说明性参考）

```tsx
import React, { useState } from "react";
import { computeCheckoutTotal, PaymentApiSubmitter } from "./payment-checkout.ts";

export type PaymentState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "success"; readonly transactionId: string }
  | { readonly kind: "error"; readonly errorId: string; readonly userMessage: string };

export interface PaymentSummaryProps {
  readonly orderId: string;
  readonly totalAmount: number;
  readonly vipTier: "STANDARD" | "GOLD" | "PLATINUM";
  readonly paymentApi: PaymentApiSubmitter; // 显式依赖注入
  readonly onPaymentSuccess: (txId: string) => void;
  readonly logger?: (payload: { errorId: string; error: unknown; orderId: string }) => void;
}

export function PaymentSummaryCard({
  orderId,
  totalAmount,
  vipTier,
  paymentApi,
  onPaymentSuccess,
  logger
}: PaymentSummaryProps) {
  const [couponCode, setCouponCode] = useState("");
  const [state, setState] = useState<PaymentState>({ kind: "idle" });

  const calculation = computeCheckoutTotal(totalAmount, couponCode, vipTier);

  const handlePay = async () => {
    setState({ kind: "submitting" });
    try {
      const res = await paymentApi({
        orderId,
        payAmount: calculation.finalPay,
        couponCode: couponCode || undefined
      });
      setState({ kind: "success", transactionId: res.transactionId });
      onPaymentSuccess(res.transactionId);
    } catch (err: unknown) {
      const errorId = crypto.randomUUID();

      // 【处置边界单点记录】：保留底层异常现场与堆栈 (W01, W07)
      if (logger) {
        logger({ errorId, error: err, orderId });
      } else {
        console.error(`[PaymentGateway] Order ${orderId} failed (trace: ${errorId}):`, err);
      }

      // 【UI 安全文案】：向用户仅展示脱敏安全文案，严禁直接展示裸 err.message (W11)
      setState({
        kind: "error",
        errorId,
        userMessage: "支付处理遇到问题，请检查网络或稍后重试"
      });
    }
  };

  return (
    <div className="checkout-card">
      <h3>订单结算明细</h3>
      <p>订单总额：¥{totalAmount.toFixed(2)}</p>
      <div>
        <input
          placeholder="输入优惠券码"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
        />
        {calculation.couponError && <span className="warning-text">{calculation.couponError}</span>}
      </div>
      <p>优惠抵扣：-¥{calculation.discount.toFixed(2)}</p>
      <h4>应付总额：¥{calculation.finalPay.toFixed(2)}</h4>

      {state.kind === "error" && (
        <div role="alert" className="error-box">
          {state.userMessage}（排查跟踪号: {state.errorId}）
        </div>
      )}

      <button disabled={state.kind === "submitting"} onClick={handlePay}>
        {state.kind === "submitting" ? "支付提交中..." : "立即支付"}
      </button>
    </div>
  );
}
```

### 5. 白盒审查规范示范记录

| 规则 ID | 审查范围 | 观察事实与判定依据 | 验证性质 |
|---|---|---|---|
| **W01** | `PaymentSummaryCard` 错误分支 | `catch` 中显式生成 `errorId` 并记录日志与状态，未出现空的 catch 块 | 说明性代码审查 |
| **W02** | `computeCheckoutTotal` 计算 | 函数内部未修改入参对象，返回全新的只读计算结果对象 | **【已实际测试验证】** |
| **W04** | `computeCheckoutTotal` 结构 | 前 3 处分支均为平铺卫语句提早返回，无任何嵌套 `if-else` | **【已实际测试验证】** |
| **W05** | `PaymentState` 建模 | 4 种互斥状态组成的判别联合，消灭 `isSubmitting && isError` 矛盾 | 说明性代码审查 |
| **W06** | `computeCheckoutTotal` 输入 | 拒绝 `NaN`、`Infinity`、非正数并抛出 `RangeError` | **【已实际测试验证】** |
| **W11** | 界面错误展示 | 发生异常时 UI 仅呈现脱敏提示与追踪号，未输出原始底层异常文本 | 说明性代码审查 |

---

## 演练 B：Python 纯后端安全配置加载器演练

### 1. 业务需求与安全防御契约
- **需求**：根据租户 ID 从指定配置目录读取其 JSON 配置文件，并返回业务可用的配置对象。
- **输入**：配置根目录 `config_dir`、租户标识 `tenant_id`。
- **安全与不可变契约**：
  1. **严格白名单防越界**：`tenant_id` 仅允许 1~64 位字符 `^[a-zA-Z0-9_-]{1,64}$`，坚决拒绝 `..`、`/`、`\\`、空字符、绝对路径与特殊符号；
  2. **双重路径边界断言**：通过 `Path.resolve().is_relative_to(base_dir)` 二次验证目标文件确实位于指定根目录下；
  3. **真正只读不可变 (W02)**：使用 `types.MappingProxyType` 与 `tuple` 递归冻结配置，外部试图修改属性将触发 `TypeError`；
  4. **PEP 3134 因果链保留 (W07)**：底层 `JSONDecodeError` 或 `OSError` 必须通过 `from err` 保留。

### 2. 真实实现（已由 Python 3.14 单元测试运行）

真实代码位于 [examples/secure-config.py](./secure-config.py)：

```python
import json
import logging
from pathlib import Path
import re
from types import MappingProxyType
from typing import Any, Mapping

logger = logging.getLogger(__name__)

# 严格租户 ID 白名单：仅允许 1~64 位大小写字母、数字、下划线、连字符
VALID_TENANT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

class ConfigurationError(Exception):
    def __init__(self, message: str, config_file: str):
        super().__init__(message)
        self.config_file = config_file

def _freeze_mapping(obj: Any) -> Any:
    """递归将嵌套字典转换为 MappingProxyType，列表转为 tuple，保证真正不可变"""
    if isinstance(obj, dict):
        return MappingProxyType({k: _freeze_mapping(v) for k, v in obj.items()})
    elif isinstance(obj, list):
        return tuple(_freeze_mapping(x) for x in obj)
    return obj

def load_tenant_config(config_dir: str | Path, tenant_id: str) -> Mapping[str, Any]:
    # 1. 严格白名单正则校验（防御路径遍历）
    if not isinstance(tenant_id, str) or not VALID_TENANT_ID_PATTERN.match(tenant_id):
        raise ValueError(
            f"Invalid tenant_id format: {tenant_id!r}. Must strictly match ^[a-zA-Z0-9_-]{{1,64}}$"
        )

    base_dir = Path(config_dir).resolve()
    target_file = (base_dir / f"{tenant_id}.json").resolve()

    # 2. 路径防越界二次防护断言
    if not target_file.is_relative_to(base_dir):
        raise ValueError(f"Path traversal detected: {target_file} is outside {base_dir}")

    # 3. 文件存在性卫语句 (W04)
    if not target_file.is_file():
        raise ConfigurationError(
            f"Tenant configuration file not found: {target_file}",
            config_file=str(target_file)
        )

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                raise TypeError(f"Config root must be a JSON object, got {type(data).__name__}")
            return _freeze_mapping(data)
    except (json.JSONDecodeError, OSError, TypeError) as err:
        raise ConfigurationError(
            f"Failed to read or parse tenant config from {target_file}: {err}",
            config_file=str(target_file)
        ) from err
```

### 3. 可执行单元测试结果（已由 `tests/test_secure_config.py` 执行）

执行 Python 单元测试：
```bash
python tests/test_secure_config.py
```
**实测结果全部通过 (Ran 4 tests in 0.008s, OK)**：
1. **测试 1 (路径防越界断言)**：针对 `..`, `../evil`, `evil/..`, `..\evil`, `/etc/passwd`, `C:\boot.ini`, `tenant/sub`, `tenant\sub`, `tenant\0null`, `""`, `tenant*` 等各类非法租户 ID 执行断言，100% 触发 `ValueError`；
2. **测试 2 (真正不可变防护断言)**：读取合法租户配置后，试图执行 `config["appName"] = "Hacked"` 或深层 `config["database"]["host"] = "x"`，均抛出 `TypeError: 'mappingproxy' object does not support item assignment`；
3. **测试 3 (配置文件缺失断言)**：不存在的文件抛出结构化 `ConfigurationError`；
4. **测试 4 (因果链保留断言)**：对格式损坏的 JSON 执行加载，断言捕获到的 `ConfigurationError.__cause__` 严格为 `json.JSONDecodeError` 实例，保留详细行列号。
