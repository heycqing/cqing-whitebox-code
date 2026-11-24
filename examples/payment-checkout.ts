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
const MIN_PAY_CENTS = 1;

export interface CheckoutCalculationResult {
  readonly totalAmount: number;
  readonly discount: number;
  readonly finalPay: number;
  readonly couponError?: string;
}

/**
 * 纯计算函数：计算订单总额与折扣
 * 严格账务一致性约束：totalAmount === Number((discount + finalPay).toFixed(2))
 *
 * 精度契约：
 * 1. totalAmount 必须为正有限数，且最多包含两位小数（精确到分）；对超出两位小数的金额（如 0.001, 1.005, 1.015）抛出 RangeError。
 * 2. 内部全部在整数“分”（cents）级别完成抵扣与最低实付保底计算，杜绝浮点精度丢失。
 * 3. 最终换算为“元”输出，无条件严格保证：totalAmount === Number((discount + finalPay).toFixed(2))。
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

  // 2. 精度契约校验：仅接受精确到“分”的合法金额（最多两位小数），拒绝多余小数位 (如 0.001, 1.005)
  const totalCents = Math.round(totalAmount * 100);
  if (
    Math.abs(totalAmount * 100 - totalCents) > 1e-9 ||
    totalCents <= 0 ||
    totalCents > Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError(
      `Order totalAmount must have at most 2 decimal places (cents precision), got: ${totalAmount}`
    );
  }

  // 3. 无优惠券或空白券
  if (!couponCode || couponCode.trim().length === 0) {
    return {
      totalAmount,
      discount: 0,
      finalPay: totalAmount
    };
  }

  const cleanCoupon = couponCode.trim();

  // 4. VIP 专属券资格校验 (W04 卫语句提早返回)
  if (cleanCoupon.startsWith("VIP_") && vipTier === "STANDARD") {
    return {
      totalAmount,
      discount: 0,
      finalPay: totalAmount,
      couponError: "此优惠券仅限 VIP 会员使用"
    };
  }

  // 5. 在整数“分”级别计算名义折扣
  // VIP 折扣按 20% 计算四舍五入到分；普通满减券面额 10 元即 1000 分
  const rawDiscountCents = cleanCoupon.startsWith("VIP_")
    ? Math.round(totalCents * 0.2)
    : 1000;

  // 6. 账务一致性与最低支付额 0.01 元 (1 分) 约束
  let discountCents: number;
  let finalPayCents: number;

  if (totalCents <= MIN_PAY_CENTS) {
    // 订单总额本身小于或等于最低支付金额 (1分) 时，不予抵扣，全额支付
    discountCents = 0;
    finalPayCents = totalCents;
  } else {
    // 最大允许抵扣金额为 totalCents - MIN_PAY_CENTS，保证最少支付 1 分钱 (0.01 元)
    const maxDiscountAllowedCents = totalCents - MIN_PAY_CENTS;
    discountCents = Math.min(rawDiscountCents, maxDiscountAllowedCents);
    finalPayCents = totalCents - discountCents;
  }

  // 7. 转换回“元”输出，保证严格的代数恒等式 totalAmount === discount + finalPay
  return {
    totalAmount,
    discount: Number((discountCents / 100).toFixed(2)),
    finalPay: Number((finalPayCents / 100).toFixed(2))
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
