# 模式 04：边界单点日志与链路关联 (Correlated Boundary Logging)

> 核心目标：在承担处置责任的系统边界单点记录结构化错误日志，严格绑定链路跟踪标识（Trace ID），消除日志重复洪泛与敏感凭据泄露。

---

## 1. 适用场景

Web 请求拦截器、RPC 网关出口、消息队列消费循环根节点、定时调度任务主入口等承担“处置终点责任”的架构边界。

---

## 2. AI 常见反例

AI 代码在多层架构中到处散落 `console.error` 或 `logger.error`，不仅每一层都重复打印同一错误，而且直接无脱敏打印整个上下文对象，同时没有任何链路追踪 ID：

```typescript
// ❌ AI 常见反例：层层重复打印、日志缺少 traceId、凭据明文泄露
// 在 DAO 层
async function findUserToken(userId: string) {
  try {
    return await db.query(...);
  } catch (e) {
    console.error("DB error in findUserToken:", e); // 第 1 次打印
    throw e;
  }
}

// 在 Service 层
async function authenticateUser(reqHeaders: any) {
  try {
    const token = reqHeaders["authorization"];
    console.log("Checking token:", token); // 严重：明文打印敏感 Token！
    return await findUserToken(token);
  } catch (e) {
    console.error("Auth service failed:", e); // 第 2 次重复打印
    throw e;
  }
}

// 在 Controller 层
async function handleLogin(req: Request, res: Response) {
  try {
    await authenticateUser(req.headers);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("Login controller error:", e); // 第 3 次重复打印！无 Request ID
    res.status(500).json({ error: "Internal error" });
  }
}
```

---

## 3. 白盒正例

保持所有错误向上冒泡，只在 Controller（处置边界）单点记录一次结构化错误日志，统一绑定 `requestId`，并对敏感信息进行脱敏：

```typescript
// ✅ 白盒正例：中间层只冒泡，边界单点结构化记录，敏感信息脱敏
interface LogContext {
  readonly traceId: string;
  readonly userId?: string;
  readonly path: string;
  readonly [key: string]: unknown;
}

function maskSensitiveToken(token: string | undefined): string {
  if (!token) return "[EMPTY]";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

// 统一的结构化边界记录器
function logBoundaryError(logger: Logger, error: unknown, context: LogContext) {
  logger.error({
    msg: "Request processing terminated with failure",
    traceId: context.traceId,
    path: context.path,
    userId: context.userId ?? "anonymous",
    // 递归展开所有 cause 链和错误堆栈
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    } : String(error)
  });
}

// 边界 Controller 处理函数
export async function handleLoginEndpoint(req: ApiRequest, res: ApiResponse) {
  const traceId = req.headers["x-trace-id"] ?? crypto.randomUUID();
  try {
    const rawAuth = req.headers["authorization"];
    // 调试若需输出，必须安全脱敏
    logger.debug({ msg: "Authenticating request", traceId, tokenMasked: maskSensitiveToken(rawAuth) });
    
    const session = await authService.authenticate(rawAuth, traceId);
    return res.status(200).json({ success: true, sessionId: session.id });
  } catch (err: unknown) {
    // 【处置边界单点记录】：全链路只在此处记录 1 次 ERROR 级别日志
    logBoundaryError(logger, err, {
      traceId,
      path: "/api/login",
      userId: req.body?.username
    });

    // 向客户端返回脱敏的安全错误响应，隐藏内部物理堆栈
    return res.status(500).json({
      success: false,
      traceId,
      message: "Authentication service encountered an unexpected error. Please retry later."
    });
  }
}
```

---

## 4. 因果解释

1. **同等功能保障**：系统在发生异常时依然向调用方返回 500 状态码，并保证系统不崩溃。
2. **排障效率提升**：生产日志从原先的 3 条杂乱碎片浓缩为 1 条包含完整 `cause` 和 `traceId` 的清晰条目，运维根据 `traceId` 即可直接拉取全量链路。
3. **合规安全**：杜绝将 Bearer Token、密码或数据库连接串明文写进磁盘日志文件。

---

## 5. 不适用 / 例外

- **告警计数器 (Metrics)**：在中间层进行普罗米修斯指标打点（如 `metrics.increment("rpc_retry_total")`）不属于错误堆栈日志，属于监控指标，允许在发生重试时计数。

---

## 6. 对应规则

- **W07** (P1): 保留错误因果链与边界单点记录
- **W11** (P2): 最小必要日志与脱敏原则
