# 反模式 AP01：无声吞错与伪防御性空值 (Silent Swallowing & Pseudo-Defensive Fallback)

> 严重级别：**P0（无声吞错）** / **P1（伪防御性可选链滥用）**  
> 核心判定：异常被隐匿捕获且未留可诊断痕迹，或用形式上的“安全空值”掩盖前置系统破损。

---

## 1. 表现形态与判定证据

### 形态 A：空的异常捕获与死寂返回
代码使用 `catch (e) {}` 丢弃所有错误，或者在发生错误时直接 `return null` / `return false`，既不上报监控，也不向外重新抛出。
- **证据特征**：`catch` 块为空或仅有无操作注释；或者捕获后仅仅 `console.log("error")` 却直接返回正常空对象。

### 形态 B：伪防御性空值与可选链滥用（相关章节）
当开发者遇到 `Cannot read properties of undefined` 时，不是去排查为什么此时上游未传数据，而是在整条链路上盲目追加 `?.` 和 `?? fallback`。
- **证据特征**：必填参数被加上 `?.` 访问，或者关键 ID 缺失时用 `?? ""` 兜底，导致不可预期的空字符串流入后端业务库。

---

## 2. 危害与因果破坏

1. **幽灵故障**：用户操作失败，但控制台与服务器日志没有任何报错，排查人员无法感知系统已陷入异常。
2. **级联数据损坏**：原本应当立即中断的流程带着伪造的空值（如 `""` 或 `0`）继续执行，导致后续数据库事务写入了垃圾数据。

---

## 3. 代码对比 (保持同等业务功能)

### ❌ 黑盒反例

```typescript
// 业务要求：加载用户的关键安全配置，若加载失败应提示用户重新登录，且记录安全审计
export async function loadUserSecurityProfile(userId: string): Promise<SecurityProfile | null> {
  try {
    const res = await securityApiClient.fetchProfile(userId);
    // 伪防御：明明 profile 必须有 permissionLevel，这里却用 ?? 掩盖字段缺失
    const level = res?.data?.permissionLevel ?? 0;
    return { level, mfaEnabled: Boolean(res?.data?.mfaEnabled) };
  } catch (err) {
    // 致命 P0 吞错：直接吞掉网络或鉴权错误，返回 null 假装没有配置！
    return null;
  }
}
```

### ✅ 白盒正例

```typescript
export interface SecurityProfile {
  readonly permissionLevel: number;
  readonly mfaEnabled: boolean;
}

export class SecurityProfileFetchError extends Error {
  constructor(userId: string, cause: unknown) {
    super(`Failed to load security profile for user: ${userId}`, { cause });
    this.name = "SecurityProfileFetchError";
  }
}

export async function loadUserSecurityProfile(userId: string): Promise<SecurityProfile> {
  // 1. 确保入参不变式
  if (!userId || userId.trim().length === 0) {
    throw new IllegalArgumentError("userId must be a non-empty string");
  }

  try {
    const res = await securityApiClient.fetchProfile(userId);
    
    // 2. 拒绝伪防御：强类型验证关键字段，缺失即视为协议破坏
    if (!res?.data || typeof res.data.permissionLevel !== "number") {
      throw new Error(`Invalid security profile response structure for user: ${userId}`);
    }

    return {
      permissionLevel: res.data.permissionLevel,
      mfaEnabled: Boolean(res.data.mfaEnabled)
    };
  } catch (err: unknown) {
    // 3. 白盒规范：严禁静默吞错，包装并完整保留原始 cause
    throw new SecurityProfileFetchError(userId, err);
  }
}
```

---

## 4. 判定边界与允许例外

- **允许例外**：显式的可选资源探测逻辑（例如：“尝试从本地临时缓存读取，未命中则继续拉取远端”）。
  - *合规证据要求*：代码中必须明确注释为何此处未命中属于合法分支，且在 debug 级别记录探测日志。
- **不允许例外**：任何核心业务操作、写请求、权限判断、金融交易与数据持久化逻辑，绝不允许使用无声吞错。

---

## 5. 对应规则

- **W01** (P0): 禁止无声丢失失败
- **W10** (P1): 禁止伪防御性空值与可选链滥用
