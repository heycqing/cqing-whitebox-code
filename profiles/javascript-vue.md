# Profile: JavaScript + Vue

> 适用技术栈：JavaScript (ES2022+) + Vue 3.x (Composition API)  
> 核心目标：在 JavaScript 动态语言下，利用 Vue 3 的 `readonly` 严格防范隐式状态修改，利用全局 `app.config.errorHandler` 与局部 `onErrorCaptured` 拦截未处理异常，实现清晰的状态流转与错误隔离。

---

## 1. 业务项目接入方法

在业务项目的 `CLAUDE.md`、`.cursorrules` 或 Agent 系统提示词中，声明加载本组合清单：

```bash
# 生成精确加载清单
node path/to/cqing-whitebox-code/scripts/resolve-profile.mjs --language javascript --framework vue
```

---

## 2. 该组合加载的文件清单与顺序

本组合严格按以下顺序加载规范，请依次阅读对应文件（**不在此处重复复制规则正文**）：

1. **通用入口**：
   - [README.md](file:///D:/mine-prop/cqing-whitebox-code/README.md)
   - [ONBOARDING.md](file:///D:/mine-prop/cqing-whitebox-code/ONBOARDING.md)
   - [rules.json](file:///D:/mine-prop/cqing-whitebox-code/rules.json)
2. **认知基础与通用模式**：
   - [foundations/cognitive-ergonomics.md](file:///D:/mine-prop/cqing-whitebox-code/foundations/cognitive-ergonomics.md)
   - [foundations/causal-traceability.md](file:///D:/mine-prop/cqing-whitebox-code/foundations/causal-traceability.md)
   - [patterns/01-explicit-control-flow.md](file:///D:/mine-prop/cqing-whitebox-code/patterns/01-explicit-control-flow.md)
   - [patterns/02-runtime-invariants.md](file:///D:/mine-prop/cqing-whitebox-code/patterns/02-runtime-invariants.md)
   - [patterns/03-causal-error-handling.md](file:///D:/mine-prop/cqing-whitebox-code/patterns/03-causal-error-handling.md)
   - [patterns/04-correlated-logging.md](file:///D:/mine-prop/cqing-whitebox-code/patterns/04-correlated-logging.md)
   - [patterns/05-behavior-colocation.md](file:///D:/mine-prop/cqing-whitebox-code/patterns/05-behavior-colocation.md)
   - [anti-patterns/AP01-silent-swallowing.md](file:///D:/mine-prop/cqing-whitebox-code/anti-patterns/AP01-silent-swallowing.md)
   - [anti-patterns/AP02-ghost-abstraction.md](file:///D:/mine-prop/cqing-whitebox-code/anti-patterns/AP02-ghost-abstraction.md)
   - [anti-patterns/AP03-implicit-mutation.md](file:///D:/mine-prop/cqing-whitebox-code/anti-patterns/AP03-implicit-mutation.md)
   - [anti-patterns/AP04-nested-boolean-hell.md](file:///D:/mine-prop/cqing-whitebox-code/anti-patterns/AP04-nested-boolean-hell.md)
3. **JavaScript 语言规范**：
   - [languages/javascript/README.md](file:///D:/mine-prop/cqing-whitebox-code/languages/javascript/README.md)
   - [languages/javascript/examples.md](file:///D:/mine-prop/cqing-whitebox-code/languages/javascript/examples.md)
4. **Vue 框架规范**：
   - [frameworks/vue/README.md](file:///D:/mine-prop/cqing-whitebox-code/frameworks/vue/README.md)
   - [frameworks/vue/examples.md](file:///D:/mine-prop/cqing-whitebox-code/frameworks/vue/examples.md)
5. **门禁与审查验收**：
   - [checklists/pr-whitebox-gate.md](file:///D:/mine-prop/cqing-whitebox-code/checklists/pr-whitebox-gate.md)
   - [templates/whitebox-review-checklist.md](file:///D:/mine-prop/cqing-whitebox-code/templates/whitebox-review-checklist.md)
