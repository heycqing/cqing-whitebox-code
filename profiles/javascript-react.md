# Profile: JavaScript + React

> 适用技术栈：JavaScript (ES2022+) + React 18/19  
> 核心目标：在动态 JavaScript 环境下建立可靠的运行时防御守卫，利用 ES2022+ Error.cause 保留全链路因果，结合 React 单向数据流实现清晰无死锁的 UI 状态。

---

## 1. 业务项目接入方法

在业务项目的 `CLAUDE.md`、`.cursorrules` 或 Agent 系统提示词中，声明加载本组合清单：

```bash
# 生成精确加载清单
node path/to/cqing-whitebox-code/scripts/resolve-profile.mjs --language javascript --framework react
```

---

## 2. 该组合加载的文件清单与顺序

本组合严格按以下顺序加载规范，请依次阅读对应文件（**不在此处重复复制规则正文**）：

1. **通用入口**：
   - [README.md](../README.md)
   - [ONBOARDING.md](../ONBOARDING.md)
   - [rules.json](../rules.json)
2. **认知基础与通用模式**：
   - [foundations/cognitive-ergonomics.md](../foundations/cognitive-ergonomics.md)
   - [foundations/causal-traceability.md](../foundations/causal-traceability.md)
   - [patterns/01-explicit-control-flow.md](../patterns/01-explicit-control-flow.md)
   - [patterns/02-runtime-invariants.md](../patterns/02-runtime-invariants.md)
   - [patterns/03-causal-error-handling.md](../patterns/03-causal-error-handling.md)
   - [patterns/04-correlated-logging.md](../patterns/04-correlated-logging.md)
   - [patterns/05-behavior-colocation.md](../patterns/05-behavior-colocation.md)
   - [anti-patterns/AP01-silent-swallowing.md](../anti-patterns/AP01-silent-swallowing.md)
   - [anti-patterns/AP02-ghost-abstraction.md](../anti-patterns/AP02-ghost-abstraction.md)
   - [anti-patterns/AP03-implicit-mutation.md](../anti-patterns/AP03-implicit-mutation.md)
   - [anti-patterns/AP04-nested-boolean-hell.md](../anti-patterns/AP04-nested-boolean-hell.md)
3. **JavaScript 语言规范**：
   - [languages/javascript/README.md](../languages/javascript/README.md)
   - [languages/javascript/examples.md](../languages/javascript/examples.md)
4. **React 框架规范**：
   - [frameworks/react/README.md](../frameworks/react/README.md)
   - [frameworks/react/examples.md](../frameworks/react/examples.md)
5. **门禁与审查验收**：
   - [checklists/pr-whitebox-gate.md](../checklists/pr-whitebox-gate.md)
   - [templates/whitebox-review-checklist.md](../templates/whitebox-review-checklist.md)
