/**
 * templates/typed-error-template.ts
 *
 * 强类型三层因果传递错误模板 (TypeScript)
 * 演示：DAO -> Service -> Controller 三层因果保留 (ES2022+ Error.cause)
 * 规则体现：
 * - W01: 禁止无声吞错
 * - W07: 保留错误因果链，不在中间层重复记录日志，仅在边界单点记录
 * - W11: 附带安全可定位上下文，排除敏感凭据
 */

// 1. 基础结构化领域错误类
export interface SafeErrorContext {
  readonly [key: string]: string | number | boolean | null | undefined;
}

export class AppBaseError extends Error {
  public readonly code: string;
  public readonly safeContext: SafeErrorContext;
  public readonly timestamp: number;

  constructor(
    message: string,
    options: {
      code: string;
      cause?: unknown;
      context?: SafeErrorContext;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code;
    this.safeContext = Object.freeze({ ...(options.context ?? {}) });
    this.timestamp = Date.now();
  }
}

// 领域细分异常定义
export class DatabaseQueryError extends AppBaseError {
  constructor(message: string, options: { cause?: unknown; context?: SafeErrorContext }) {
    super(message, { code: "ERR_DATABASE_QUERY", ...options });
  }
}

export class UserServiceError extends AppBaseError {
  constructor(message: string, options: { cause?: unknown; context?: SafeErrorContext }) {
    super(message, { code: "ERR_USER_SERVICE_OPERATION", ...options });
  }
}

// ==========================================
// 三层调用演示：只在最外层单点记录日志
// ==========================================

// Layer 1: DAO (底层数据访问)
export async function queryUserRecordFromDb(userId: string): Promise<{ id: string; name: string }> {
  try {
    // 模拟底层网络或数据库连接异常
    throw new Error(`Connection reset by peer: 192.168.1.50:5432`);
  } catch (err: unknown) {
    // 【DAO 层职责】：捕获原生驱动异常，转换为结构化 DatabaseQueryError，携带 cause
    // 关键原则：不在 DAO 层调用 logger.error()！
    throw new DatabaseQueryError(`Failed to execute query for user table`, {
      cause: err,
      context: { userId, table: "users" }
    });
  }
}

// Layer 2: Service (业务逻辑层)
export async function loadUserProfileBusiness(userId: string): Promise<{ id: string; name: string }> {
  try {
    return await queryUserRecordFromDb(userId);
  } catch (err: unknown) {
    // 【Service 层职责】：捕获底层数据异常，根据业务语境包装为 UserServiceError，保留底层 cause
    // 关键原则：不在 Service 层调用 logger.error()！
    throw new UserServiceError(`Unable to complete user profile loading workflow`, {
      cause: err,
      context: { userId, workflow: "USER_LOGIN_SYNC" }
    });
  }
}

// Layer 3: Controller / Entry Boundary (处置边界)
export interface MockApiResponse {
  statusCode: number;
  body: {
    success: boolean;
    traceId: string;
    errorCode: string;
    message: string;
  };
}

export async function handleGetUserProfileEndpoint(userId: string, traceId: string): Promise<MockApiResponse> {
  try {
    const profile = await loadUserProfileBusiness(userId);
    return {
      statusCode: 200,
      body: {
        success: true,
        traceId,
        errorCode: "OK",
        message: `Profile loaded for ${profile.name}`
      }
    };
  } catch (err: unknown) {
    // 【处置边界单点记录】：全链路唯一的一处 logger.error()
    console.error(`[Boundary Logger] Request ${traceId} failed. Full Cause Tree:`, {
      traceId,
      errorName: err instanceof Error ? err.name : "UnknownError",
      errorMessage: err instanceof Error ? err.message : String(err),
      errorCode: err instanceof AppBaseError ? err.code : "ERR_UNHANDLED",
      safeContext: err instanceof AppBaseError ? err.safeContext : {},
      // 递归获取原始 cause
      rootCause: err instanceof Error ? err.cause : undefined,
      stack: err instanceof Error ? err.stack : undefined
    });

    // 向调用方返回脱敏且安全的结构化错误
    return {
      statusCode: 500,
      body: {
        success: false,
        traceId,
        errorCode: err instanceof AppBaseError ? err.code : "ERR_INTERNAL_SERVER_ERROR",
        message: "An internal server error occurred while retrieving user profile. Please contact support with trace ID."
      }
    };
  }
}
