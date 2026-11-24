/**
 * templates/state-machine-template.ts
 *
 * 判别联合显式状态机模板 (TypeScript)
 * 演示：
 * - W05: 判别联合精确建模排他性状态，消灭非法状态组合
 * - W01: 显式处理非法状态转移，快速失败，避免无声吞没
 * - W02: 不可变状态转换，返回新状态对象
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

// 3. 非法状态转移异常
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

// 4. 纯函数状态机核心逻辑 (Reducer)
export function transitionOrderState(currentState: OrderState, event: OrderEvent): OrderState {
  switch (currentState.status) {
    case "DRAFT": {
      if (event.type === "SUBMIT") {
        if (event.amount <= 0) {
          throw new IllegalArgumentError("Order amount must be positive");
        }
        return {
          status: "PENDING_PAYMENT",
          orderId: event.orderId,
          amount: event.amount,
          expireAt: Date.now() + event.ttlSeconds * 1000
        };
      }
      if (event.type === "CANCEL") {
        return {
          status: "CANCELLED",
          cancelledAt: Date.now(),
          reason: event.reason
        };
      }
      // 其他事件在此状态非法：快速失败，不无声吞噬
      throw new IllegalStateTransitionError(currentState.status, event.type);
    }

    case "PENDING_PAYMENT": {
      if (event.type === "PAY_SUCCESS") {
        return {
          status: "PAID",
          orderId: currentState.orderId,
          amount: currentState.amount,
          paidAt: event.paidAt ?? Date.now(),
          transactionId: event.transactionId
        };
      }
      if (event.type === "CANCEL") {
        return {
          status: "CANCELLED",
          orderId: currentState.orderId,
          cancelledAt: Date.now(),
          reason: event.reason
        };
      }
      throw new IllegalStateTransitionError(currentState.status, event.type);
    }

    case "PAID": {
      if (event.type === "REFUND") {
        if (event.refundedAmount <= 0 || event.refundedAmount > currentState.amount) {
          throw new IllegalArgumentError(`Refund amount must be between 1 and ${currentState.amount}`);
        }
        return {
          status: "REFUNDED",
          orderId: currentState.orderId,
          refundedAmount: event.refundedAmount,
          refundedAt: Date.now()
        };
      }
      // 已支付订单不可直接取消
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

// 辅助参数异常
export class IllegalArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalArgumentError";
  }
}
