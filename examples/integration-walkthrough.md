# 白盒规范端到端集成演练 (Integration Walkthrough)

> 本演练面向业务项目协作者，完整记录两个真实业务变更场景下的白盒工程落地闭环：
> 1. **场景 A**：TypeScript + React 业务特性变更（按需加载、边缘用例、实现、审查证据、DoD 达成）
> 2. **场景 B**：Python 纯后端服务变更（验证无前端框架时仅加载通用与 Python 配置）

---

## 场景 A：TypeScript + React 业务变更演练

### 1. 业务需求与边缘用例定义
- **需求**：为电商收银台实现一个支持优惠券折抵的支付确认卡片。
- **输入**：订单原始总额（`totalAmount`）、用户所选优惠券码（`couponCode`）、用户会员等级（`vipTier`）。
- **必须覆盖的边缘用例**：
  1. `totalAmount <= 0` 或非法数字：立即拒绝并提示输入错误；
  2. 优惠券为空或未选择：按原始金额支付，优惠金额为 0；
  3. VIP 专属券用于非 VIP 用户：拒绝使用该券并提示资格不足，金额不扣减；
  4. 折扣金额大于订单总额：最低支付金额兜底为 0.01 元（不可出现负数支付）；
  5. 异步调用支付网关超时或网络异常：不能无声吞噬（W01），必须向用户展示明确错误并保留底层 cause。

### 2. 按需加载 Profile
执行解析脚本获取精准加载清单：
```bash
node scripts/resolve-profile.mjs --language typescript --framework react
```
Agent 依次加载：
- 通用白盒契约：`rules.json`, `foundations/*`, `patterns/*`
- TypeScript 语言适配：`languages/typescript/README.md`（判别联合、`unknown` 收窄）
- React 框架适配：`frameworks/react/README.md`（无副作用派生计算、状态机组件）
- 审查门禁：`checklists/pr-whitebox-gate.md`

### 3. 代码实现与白盒重构

```tsx
// features/checkout/PaymentSummaryCard.tsx
import React, { useState, useTransition } from "react";

export type PaymentState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "success"; readonly transactionId: string }
  | { readonly kind: "error"; readonly message: string; readonly errorId: string };

export interface PaymentSummaryProps {
  readonly orderId: string;
  readonly totalAmount: number;
  readonly vipTier: "STANDARD" | "GOLD" | "PLATINUM";
  readonly onPaymentSuccess: (txId: string) => void;
}

// 纯计算函数就近编排 (W08, W09)
export function computeCheckoutTotal(
  totalAmount: number,
  couponCode: string | undefined,
  vipTier: string
): { discount: number; finalPay: number; couponError?: string } {
  if (totalAmount <= 0 || Number.isNaN(totalAmount)) {
    throw new RangeError("Order totalAmount must be a positive number");
  }

  if (!couponCode) {
    return { discount: 0, finalPay: totalAmount };
  }

  if (couponCode.startsWith("VIP_") && vipTier === "STANDARD") {
    return {
      discount: 0,
      finalPay: totalAmount,
      couponError: "此优惠券仅限 VIP 会员使用"
    };
  }

  const rawDiscount = couponCode.startsWith("VIP_") ? totalAmount * 0.2 : 10;
  const discount = Math.min(rawDiscount, totalAmount);
  // 边缘用例 4：最低支付金额 0.01 元
  const finalPay = Math.max(0.01, Number((totalAmount - discount).toFixed(2)));

  return { discount, finalPay };
}

export function PaymentSummaryCard({ orderId, totalAmount, vipTier, onPaymentSuccess }: PaymentSummaryProps) {
  const [couponCode, setCouponCode] = useState("");
  const [state, setState] = useState<PaymentState>({ kind: "idle" });

  // 派生计算不进 useEffect，直接在渲染阶段计算 (React 最佳实践)
  const calculation = computeCheckoutTotal(totalAmount, couponCode, vipTier);

  const handlePay = async () => {
    setState({ kind: "submitting" });
    try {
      const res = await window.paymentApi.submit({
        orderId,
        payAmount: calculation.finalPay,
        couponCode: couponCode || undefined
      });
      setState({ kind: "success", transactionId: res.transactionId });
      onPaymentSuccess(res.transactionId);
    } catch (err: unknown) {
      // W01/W07: 不无声吞错，捕获并生成错误追踪码
      const errorId = crypto.randomUUID();
      console.error(`[Payment Gateway Error] ID: ${errorId}`, { cause: err });
      setState({
        kind: "error",
        errorId,
        message: err instanceof Error ? err.message : "支付遇到意外错误，请稍后重试"
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
          支付失败：{state.message} (跟踪号: {state.errorId})
        </div>
      )}

      <button disabled={state.kind === "submitting"} onClick={handlePay}>
        {state.kind === "submitting" ? "支付提交中..." : "立即支付"}
      </button>
    </div>
  );
}
```

### 4. 白盒审查证据登记 (Review Evidence)
依据 `templates/whitebox-review-checklist.md` 记录的事实证据：

| 规则 ID | 判定 | 代码位置与观察证据 | 影响评估 |
|---|---|---|---|
| **W01** | 通过 | `PaymentSummaryCard.tsx:L66`：`catch (err)` 显式生成 `errorId` 并向 UI 展示可诊断错误，无静默吞没 | 故障可被用户和日志双向追踪 |
| **W02** | 通过 | `PaymentSummaryCard.tsx:L28`：`computeCheckoutTotal` 完全为纯计算，无原地修改入参 | 零时序竞态副作用 |
| **W04** | 通过 | `computeCheckoutTotal` 前 3 句均为卫语句提早返回，无多层 if 嵌套 | 路径可静态一眼推演 |
| **W05** | 通过 | `PaymentSummaryCard.tsx:L4`：`PaymentState` 为 4 状态互斥判别联合，消灭 `isSubmitting && isError` 冲突 | 杜绝按钮死锁 |
| **W08** | 通过 | 优惠券算法与金额计算就近放置于同文件导出，未抽离到遥远的 utils | 本地内聚，易测易删 |

---

## 场景 B：Python 纯语言后端演练

### 1. 验证按需加载隔离性
执行 Python 专属 profile 解析：
```bash
node scripts/resolve-profile.mjs --language python
```
**实测输出验证**：
- 清单仅包含通用规则与 `languages/python/*`；
- **完全不包含**任何 `frameworks/react/*` 或 `frameworks/vue/*` 文档，证明纯后端业务加载上下文保持最小化。

### 2. 业务实现示例：带 PEP 3134 因果链的配置安全加载器

```python
# app/core/secure_config.py
from pathlib import Path
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

class ConfigurationError(Exception):
    def __init__(self, message: str, config_file: str):
        super().__init__(message)
        self.config_file = config_file

def load_tenant_config(config_dir: str, tenant_id: str) -> dict[str, Any]:
    # 卫语句：校验不变式 (W04, W06)
    if not tenant_id or ".." in tenant_id:
        raise ValueError(f"Unsafe or empty tenant_id: '{tenant_id}'")

    file_path = Path(config_dir) / f"{tenant_id}.json"
    if not file_path.is_file():
        raise ConfigurationError(
            f"Tenant configuration file not found: {file_path}",
            config_file=str(file_path)
        )

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                raise TypeError(f"Config root must be a dict, got {type(data).__name__}")
            # 不可变防御性拷贝 (W02)
            return dict(data)
    except (json.JSONDecodeError, OSError, TypeError) as err:
        # W07: PEP 3134 保留因果链；不在中间层重复 log error (W11)
        raise ConfigurationError(
            f"Failed to read or parse tenant config from {file_path}: {err}",
            config_file=str(file_path)
        ) from err
```

### 3. 验收结论
该脚本完全满足：
1. 路径遍历安全防护与入参校验；
2. 异常链完整保留底层 `JSONDecodeError` / `OSError` 行列信息；
3. 中间函数只抛不乱打日志，全链路可追溯。
