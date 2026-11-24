/**
 * templates/state-machine-template.ts
 *
 * 判别联合显式状态机模板 (TypeScript)
 * 演示：
 * - W05: 判别联合精确建模排他性状态，消灭非法状态组合
 * - W01: 显式处理非法状态转移与非法边界输入，快速失败，避免无声吞没
 * - W02: 不可变状态转换，返回全新状态对象
 * - 纯函数与确定性保证：禁止隐式读取全局时钟（如 Date.now()），时间作为显式输入参数传入
 */

// 1. 显式状态集合（判别联合）
export type OrderState =
  | { readonly status: "DRAFT"; readonly draftCreatedAt: number }
  | { readonly status: "PENDING_PAYMENT"; readonly orderId: string; readonly amount: number; readonly expireAt: number }
  | { readonly status: "PAID"; readonly orderId: string; readonly amount: number; readonly paidAt: number; readonly transactionId: string }
  | { readonly status: "CANCELLED"; readonly orderId?: string; readonly cancelledAt: number; readonly reason: string }
  | { readonly status: "REFUNDED"; readonly orderId: string; readonly refundedAmount: number; readonly refundedAt: number };

// 2. 状态转移事件类型
export type OrderEvent =
  | { readonly type: "SUBMIT"; readonly orderId: string; readonly amount: number; readonly ttlSeconds: number }
  | { readonly type: "PAY_SUCCESS"; readonly transactionId: string; readonly paidAt?: number }
  | { readonly type: "CANCEL"; readonly reason: string }
  | { readonly type: "REFUND"; readonly refundedAmount: number };

// 3. 非法参数与非法状态转移异常
export class IllegalArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalArgumentError";
  }
}

export class IllegalStateTransitionError extends Error {
  public readonly fromStatus: string;
  public readonly eventType: string;

  constructor(fromStatus: string, eventType: string, customMessage?: string) {
    const msg = customMessage ?? `Cannot transition from state '${fromStatus}' via event '${eventType}'`;
    super(msg);
    this.name = "IllegalStateTransitionError";
    this.fromStatus = fromStatus;
    this.eventType = eventType;
  }
}

// 4. 100% 确定性纯函数状态机核心逻辑 (Pure Reducer)
// 注意：严格禁止在纯函数内部调用 Date.now()，时钟作为显式参数 currentTime 传入，确保完全可重现与单元测试确定性
export function transitionOrderState(
  currentState: OrderState,
  event: OrderEvent,
  currentTime: number
): OrderState {
  // 严格输入校验：验证时钟有效性
  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    throw new IllegalArgumentError("currentTime must be a strictly positive finite timestamp");
  }

  switch (currentState.status) {
    case "DRAFT": {
      if (event.type === "SUBMIT") {
        if (!event.orderId || event.orderId.trim().length === 0) {
          throw new IllegalArgumentError("orderId must be a non-empty string");
        }
        if (!Number.isFinite(event.amount) || event.amount <= 0) {
          throw new IllegalArgumentError("Order amount must be a positive finite number");
        }
        if (!Number.isFinite(event.ttlSeconds) || event.ttlSeconds <= 0) {
          throw new IllegalArgumentError("ttlSeconds must be a positive integer");
        }
        return {
          status: "PENDING_PAYMENT",
          orderId: event.orderId.trim(),
          amount: event.amount,
          expireAt: currentTime + event.ttlSeconds * 1000
        };
      }
      if (event.type === "CANCEL") {
        if (!event.reason || event.reason.trim().length === 0) {
          throw new IllegalArgumentError("Cancellation reason must be provided");
        }
        return {
          status: "CANCELLED",
          cancelledAt: currentTime,
          reason: event.reason.trim()
        };
      }
      // 其他事件在此状态非法：快速失败，不无声吞噬
      throw new IllegalStateTransitionError(currentState.status, event.type);
    }

    case "PENDING_PAYMENT": {
      if (event.type === "PAY_SUCCESS") {
        if (!event.transactionId || event.transactionId.trim().length === 0) {
          throw new IllegalArgumentError("transactionId must be a non-empty string");
        }
        const resolvedPaidAt = event.paidAt !== undefined ? event.paidAt : currentTime;
        if (!Number.isFinite(resolvedPaidAt) || resolvedPaidAt <= 0) {
          throw new IllegalArgumentError("paidAt must be a positive finite timestamp");
        }
        return {
          status: "PAID",
          orderId: currentState.orderId,
          amount: currentState.amount,
          paidAt: resolvedPaidAt,
          transactionId: event.transactionId.trim()
        };
      }
      if (event.type === "CANCEL") {
        if (!event.reason || event.reason.trim().length === 0) {
          throw new IllegalArgumentError("Cancellation reason must be provided");
        }
        return {
          status: "CANCELLED",
          orderId: currentState.orderId,
          cancelledAt: currentTime,
          reason: event.reason.trim()
        };
      }
      throw new IllegalStateTransitionError(currentState.status, event.type);
    }

    case "PAID": {
      if (event.type === "REFUND") {
        if (!Number.isFinite(event.refundedAmount) || event.refundedAmount <= 0) {
          throw new IllegalArgumentError("refundedAmount must be a positive finite number");
        }
        if (event.refundedAmount > currentState.amount) {
          throw new IllegalArgumentError(
            `Refund amount (${event.refundedAmount}) cannot exceed paid amount (${currentState.amount})`
          );
        }
        return {
          status: "REFUNDED",
          orderId: currentState.orderId,
          refundedAmount: event.refundedAmount,
          refundedAt: currentTime
        };
      }
      if (event.type === "CANCEL") {
        throw new IllegalStateTransitionError(
          currentState.status,
          event.type,
          "Paid orders cannot be directly cancelled. Must process via REFUND event."
        );
      }
      throw new IllegalStateTransitionError(currentState.status, event.type);
    }

    case "CANCELLED":
    case "REFUNDED": {
      // 终态不允许任何进一步转移
      throw new IllegalStateTransitionError(
        currentState.status,
        event.type,
        `Order is in terminal state '${currentState.status}', no transitions allowed`
      );
    }

    default: {
      // TypeScript 穷举检查 (Exhaustiveness Check)
      const exhaustiveCheck: never = currentState;
      throw new Error(`Unhandled order status: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
