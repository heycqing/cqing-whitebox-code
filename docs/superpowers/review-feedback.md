# 主审阅反馈：首轮修正

请在原任务上修正以下问题，并报告改动、准确验证命令和退出结果。优先修复确定性错误；不要推送或创建 PR。

## 必须修复

1. **仓库文档不可移植。** `README.md` 与四个 `profiles/*.md` 中共有 81 处 `file:///D:/mine-prop/cqing-whitebox-code/...` 链接。这些链接只在当前机器成立，违反规范库供其他业务项目接入的目的。改为从所在 Markdown 文件出发的相对链接。`tests/validate-links.mjs` 应拒绝本仓库文档中的本机绝对 `file:///` 链接，而不是因为本机文件存在就判通过。
2. **JSON schema 引用悬空。** `rules.json` 声明 `./rules.schema.json`，`profiles/manifest.json` 声明 `./manifest.schema.json`，但这两个文件不存在。请补齐有实际约束力的 schema 并让验证脚本检查，或移除虚假的 `$schema` 声明并用现有验证器承担校验；不能保留悬空引用。
3. **跨仓库接入命令在当前 Windows 环境不可直接执行。** `cqing-better-code/templates/CLAUDE-template.md` 使用 `${WHITEBOX_CODE_ROOT:-../cqing-whitebox-code}` 这样的 Bash 参数展开。请改为跨 shell 可理解的配置步骤和路径占位符，给出 PowerShell 与 POSIX Shell 各自可直接执行的命令，且不要写死当前机器路径。保持原仓库的门控规则不变。
4. **Vue 正例违反自己的吞错规则。** `frameworks/vue/examples.md` 的局部 `onErrorCaptured` 返回 `false`，阻止错误到达全局记录处，却没有在局部记录原始错误；同时直接把 `err.message` 展示给用户。请明确谁承担处置责任，并确保只记录一次且保留因果，用户界面只显示安全文案。
5. **TS 状态机模板自称纯函数，但读取 `Date.now()`。** `templates/state-machine-template.ts` 中的 `transitionOrderState` 依赖当前时间，结果不可复现。请把时间作为显式输入/事件字段，或移除纯函数承诺并解释时钟副作用。若继续作为状态机模板，优先选择确定性写法并增加有效输入边界验证。
6. **敏感凭据写入日志被列为 P2。** `rules.json` 的 W11 把打印 Token、密码、密钥等与 traceId 缺失合在同一偏好级规则。请拆分或调整严重度：真实敏感数据泄露须是不可放行的门禁；traceId 完整性可以保留较低等级。同步更新各引用处与审查清单。

## 同步改进

7. `tests/validate-links.mjs` 顶部声称检查 profile 与 manifest 一致性，实际没有。请实现这项检查或删去该声明；并把 JSON `$schema` 路径、manifest 中的路径纳入验证，避免当前两类漏检再次发生。
8. `frameworks/react/examples.md` 的正例调用未定义的 `fetchProduct`，错误边界示例使用未声明的 `window.telemetryClient`。请把示例所需依赖写成显式接口/注入函数，或标明清楚的伪代码边界；关键正例应能被复制后补入业务依赖而不因未声明符号报错。正例避免把原始异常消息直接送到 UI。
9. `rules.json` 的 W08 使用“3 个以上独立模块复用”作为合法抽象条件，这是任意阈值；请按实际职责、稳定边界和项目约定判断，并同步修订对应模式文档。

修正后请运行现有 Node 验证，并针对上述回归风险增加有意义的测试。若无法运行 TypeScript/Vue/React 示例的编译检查，请如实列为未验证，勿声称全部通过。
