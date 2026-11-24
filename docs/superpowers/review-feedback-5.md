# 主审阅反馈：Profile CLI 缺参漏检

已复现：`node scripts/resolve-profile.mjs --language typescript --framework` 当前以退出码 0 输出纯 TypeScript 清单，悄悄忽略用户明确写出的 `--framework` 选项。这会漏加载框架规则，与按需加载契约冲突。

根因：`parseArgs` 在读取 `-f/--framework` 后未验证下一参数是否存在且非空；`resolveProfileFiles` 将 `undefined` 视作未指定框架。请先加失败回归测试，再在 CLI 参数解析处拒绝 `--framework` 和 `--language` 的缺值/空值，以及值位置被下一个选项占用的情况，返回非零退出码与明确错误。保持合法纯语言调用可用。

另请校验 `manifest.languages[*].compatibleFrameworks` 与 `manifest.frameworks[*].supportedLanguages` 双向一致；解析器和验证器不能在两侧声明冲突时仍判通过。加一个针对不一致 manifest 的有意义测试。只修复这两个边界，不做无关重构。不推送、不创建 PR。
