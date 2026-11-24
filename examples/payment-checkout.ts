/**
 * examples/payment-checkout.ts
 *
 * 订单结算与支付演练纯逻辑实现 (TypeScript)
 * 演示：
 * - 纯计算函数 computeCheckoutTotal：严格账务恒等式 totalAmount === discount + finalPay
 * - 严格边界输入检查：拒绝 non-finite、NaN、零与非正金额
 * - 账务一致性：全额与超额抵扣券受最低支付额 0.01 元约束，实际抵扣额精准适配
 * - 纯 TypeScript 实现，由 Node 22 原生执行回归测试
 */

export const MIN_PAY_AMOUNT = 0.01;

export interface CheckoutCalculationResult {
  readonly totalAmount: number;
  readonly discount: number;
  readonly finalPay: number;
  readonly couponError?: string;
}

/**
 * 纯计算函数：计算订单总额与折扣
 * 严格账务一致性约束：totalAmount === Number((discount + finalPay).toFixed(2))
 */
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
    return {
      totalAmount,
      discount: 0,
      finalPay: totalAmount
    };
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

  // 5. 账务一致性与最低支付额 0.01 元兜底
  let finalPay: number;
  let actualDiscount: number;

  if (totalAmount <= MIN_PAY_AMOUNT) {
    // 订单总额本身小于或等于最低支付金额时，不予抵扣，全额支付
    actualDiscount = 0;
    finalPay = totalAmount;
  } else {
    // 最大允许抵扣金额为 totalAmount - MIN_PAY_AMOUNT，保证最少支付 0.01 元
    const maxDiscountAllowed = Number((totalAmount - MIN_PAY_AMOUNT).toFixed(2));
    actualDiscount = Number(Math.min(rawDiscount, maxDiscountAllowed).toFixed(2));
    finalPay = Number((totalAmount - actualDiscount).toFixed(2));
  }

  return {
    totalAmount,
    discount: actualDiscount,
    finalPay
  };
}

// 支付领域契约与状态类型定义
export interface PaymentSubmission {
  readonly orderId: string;
  readonly payAmount: number;
  readonly couponCode?: string;
}

export interface PaymentApiResponse {
  readonly transactionId: string;
}

export type PaymentApiSubmitter = (submission: PaymentSubmission) => Promise<PaymentApiResponse>;

export type PaymentState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "success"; readonly transactionId: string }
  | { readonly kind: "error"; readonly errorId: string; readonly userMessage: string };
