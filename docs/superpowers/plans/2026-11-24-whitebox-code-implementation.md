# cqing-whitebox-code 实施计划

> 本计划供实施者逐项执行。每项完成后核对验收条件，并记录实际验证结果。

**目标：** 建立一套可按业务项目的语言、框架按需加载的白盒编码规范库，并与 `cqing-better-code` 的流程门控衔接。

**架构：** `foundations/` 与 `rules.json` 定义跨语言的结果契约；`languages/` 和 `frameworks/` 解释如何在特定技术栈落实契约；`profiles/` 只声明组合及加载顺序，不复制规则正文。模板和清单消费同一规则编号。业务项目保留自己的约定，但不得降低需求正确性和失败可追溯性。

**技术栈：** Markdown、JSON、零依赖 Node.js 脚本、TypeScript 示例；首批覆盖 JavaScript、TypeScript、Python、React、Vue。

## 全局约束

- 需求一致性优先：不因白盒规则删减已确认的业务行为或边缘用例。
- 区分外部输入校验、预期业务失败、内部不变式失败。
- 错误只在承担处置责任的边界记录一次；传递时保留原因和必要上下文。
- 规则描述可观察的质量目标；语言和框架文档描述惯用实现方式。
- 每条规则须包含触发条件、判定证据、允许例外、修复方向和跨语言适用性。
- 示例不记录凭据、令牌、完整个人数据；日志上下文遵守最小必要原则。
- 首批语言与框架以本计划列出的五个配置为准；新增配置遵循同一契约。

## 文件职责

```text
README.md                         定位、边界、入口和目录导航
ONBOARDING.md                     业务项目接入与按需加载协议
rules.json                        跨语言规则注册表
foundations/                      认知工效与因果追溯的共同定义
patterns/                         五种跨语言模式及反例/正例
anti-patterns/                    四类黑盒病及判定边界
languages/javascript/             JS 适配与示例
languages/typescript/             TS 适配与示例
languages/python/                 Python 适配与示例
frameworks/react/                 React 适配与示例
frameworks/vue/                   Vue 适配与示例
profiles/manifest.json            可选语言/框架、组合限制和加载文件
profiles/*.md                     人工可读的组合入口
scripts/resolve-profile.mjs       解析并输出准确的文件加载清单
templates/                        提示词、审查清单、TS 代码模板
checklists/                       PR 门禁清单
tests/                             注册表、链接和 profile 解析验证
```

## 阶段 1：规则基线与仓库入口

### 任务 1：明确规范边界

**文件：** 新建 `README.md`、`ONBOARDING.md`、`foundations/cognitive-ergonomics.md`、`foundations/causal-traceability.md`。

- [ ] 写清 `cqing-better-code` 管范围、审核和验证证据；本仓库管代码表达和故障因果。
- [ ] 定义“白盒”可检查的三个结果：执行路径可推演、状态变化可定位、失败原因可追溯。
- [ ] 写出按需加载协议：选定语言，按需选框架，依次读取通用规则、语言配置、框架配置、业务项目约定；同一概念只在一个位置维护正文。
- [ ] 规定冲突处理：业务正确性和安全边界优先；语言惯用法可替换通用示例，但不能取消规则目标；项目例外须附理由和验证证据。
- [ ] 验收：只读 `README.md` 和 `ONBOARDING.md` 的新协作者能选对入口，并知道哪些规则适用。

### 任务 2：建立可判定的规则注册表

**文件：** 新建 `rules.json`、`tests/validate-rules.mjs`。

- [ ] 为每条规则设定稳定 `id`、`level`、`title`、`intent`、`trigger`、`evidence`、`exceptions`、`remediation`、`appliesTo` 字段。
- [ ] P0 保留“无声丢失失败”和“未声明的共享数据修改”；把“幽灵抽象”改为 P1 评审项，不以单次调用自动判错。
- [ ] P1 保留控制流、状态建模、断言边界；把嵌套深度 `>3` 改为审查信号，不作为自动失败条件。
- [ ] 为日志、行为就近、命名与副作用匹配、禁止伪防御性可选链定义 P1 或 P2，并说明适用范围。
- [ ] 验证脚本检查 JSON 可解析、ID 唯一、等级合法、字段非空、引用文件存在；失败时输出具体规则 ID 与字段。
- [ ] 验收：每一条规则都能回答“何时命中、证据是什么、什么情况允许例外”。

## 阶段 2：模式、反模式与语言适配

### 任务 3：完成通用模式和反模式

**文件：** 新建 `patterns/01-explicit-control-flow.md` 至 `05-behavior-colocation.md`；新建 `anti-patterns/AP01-silent-swallowing.md` 至 `AP04-nested-boolean-hell.md`。

- [ ] 每篇模式统一写“适用场景 → AI 常见反例 → 白盒正例 → 因果解释 → 不适用/例外 → 对应规则”。
- [ ] 五篇分别覆盖控制流、不变式、错误因果、日志关联、行为就近。
- [ ] 四篇反模式分别覆盖吞错、幽灵抽象、隐式修改、复杂布尔状态；将伪防御性空值处理和虚假命名作为相关章节纳入。
- [ ] 反例与正例保持相同业务行为；说明正例如何保留边缘用例，不以减少功能换可读性。
- [ ] 验收：审查者能指出具体代码证据；反例不会仅因风格不同而被错误判定。

### 任务 4：建立首批语言配置

**文件：** 新建 `languages/javascript/README.md`、`languages/typescript/README.md`、`languages/python/README.md`，以及各目录内的 `examples.md`。

- [ ] JavaScript：覆盖运行时边界校验、异常因果、可变对象契约、异步失败和可见副作用。
- [ ] TypeScript：覆盖判别联合、`unknown` 输入收窄、运行时校验边界、类型与运行时事实的区别。
- [ ] Python：覆盖异常类型与 `raise ... from ...`、可变参数契约、宽泛捕获边界和日志上下文。
- [ ] 每个语言配置逐条映射适用的 W 规则：推荐写法、语言特有例外、反例/正例、可执行或可人工核对的验证方法。
- [ ] 验收：同一通用规则在三种语言中语义一致，且示例符合各语言的自然写法。

### 任务 5：建立首批框架配置

**文件：** 新建 `frameworks/react/README.md`、`frameworks/vue/README.md`，以及各目录内的 `examples.md`。

- [ ] React：覆盖异步状态表达、effect 中副作用的可见性、错误展示与故障记录的边界、组件职责。
- [ ] Vue：覆盖响应式状态修改的可见性、组合式逻辑的职责、异步状态和错误处理边界。
- [ ] 每条框架建议注明适用的框架主版本或 API 范围、来源链接、核验日期；版本变化时重新核验，不把过期写法作为门禁。
- [ ] 框架文档只描述框架特有实现，不复制通用规则与语言章节。
- [ ] 验收：React/Vue 配置均可与 TypeScript 配置组合，且不会产生互相矛盾的指令。

## 阶段 3：按需加载与工程资产

### 任务 6：实现 profile 解析

**文件：** 新建 `profiles/manifest.json`、`profiles/typescript-react.md`、`profiles/typescript-vue.md`、`profiles/javascript-react.md`、`profiles/javascript-vue.md`、`scripts/resolve-profile.mjs`、`tests/resolve-profile.test.mjs`。

- [ ] manifest 为每个语言、框架列出准确文件路径；声明 React/Vue 可与 JavaScript 或 TypeScript 配对，Python 不可与这两个前端框架配对。
- [ ] 解析器接受 `--language <name>` 与可选 `--framework <name>`；输出按顺序排列的仓库相对路径清单：通用入口 → 通用规则/模式 → 语言 → 框架 → 审查入口。
- [ ] 未知语言、未知框架、不兼容组合和缺失文件均返回非零退出码及明确错误信息。
- [ ] profile Markdown 展示如何在业务项目引用本仓库，以及该组合应加载哪些文件；不粘贴规则正文。
- [ ] 测试覆盖四种 JS/TS + React/Vue 合法组合、纯 Python 组合、未知配置与不兼容配置；比较准确输出顺序。
- [ ] 验收：业务项目只声明技术栈，就能得到确定且最小的加载清单。

### 任务 7：提供可复用模板与审查门禁

**文件：** 新建 `templates/system-prompt-snippet.md`、`templates/whitebox-review-checklist.md`、`templates/typed-error-template.ts`、`templates/state-machine-template.ts`、`checklists/pr-whitebox-gate.md`。

- [ ] 提示词正文控制在 500 个汉字以内，只要求加载已选 profile，遵守正确性优先和规则证据；不把所有语言规则塞入提示词。
- [ ] Reviewer 清单要求每项给出 `规则 ID + 文件/行 + 可观察证据 + 影响 + 修复建议`，支持“通过/不通过/不适用”；不得仅因未采用示例写法判错。
- [ ] TS 错误模板保留 `code`、`cause`、安全的 `context`，演示三层因果传递；不在每层重复记录日志。
- [ ] 状态机模板使用判别联合表达合法状态及转换；包括非法转换的显式处理。
- [ ] PR 门禁覆盖需求验收、失败路径、状态、副作用、隐私/日志和 profile 例外记录。
- [ ] 验收：模板可被独立复制使用，引用的规则 ID 均存在于 `rules.json`。

## 阶段 4：联调与真实任务验证

### 任务 8：接入 cqing-better-code 模板

**文件：** 修改 `C:/Users/Administrator/orca/workspaces/cqing-better-code/fluke/templates/CLAUDE-template.md`；必要时在该仓库增加接入说明。

- [ ] 在开工流程中加入“识别语言/框架 → 选择 whitebox profile → 读取返回清单”的步骤。
- [ ] 在完成定义中加入代码白盒审查证据；沿用 `cqing-better-code` 既有的授权、范围和 VVC 门控，不重复定义第二套审批流程。
- [ ] 采用可配置的本地仓库路径，避免写死当前机器绝对路径作为业务项目要求。
- [ ] 验收：模板生成的业务项目指令能明确区分两套仓库职责，且没有相互冲突的加载或门禁要求。

### 任务 9：闭环演练与发布检查

**文件：** 新建 `examples/integration-walkthrough.md`、`tests/validate-links.mjs`；更新 `README.md` 和 `ONBOARDING.md`。

- [ ] 选一个小型 TypeScript + React 业务变更，列出需求与边缘用例；按 profile 加载规则，产出实现、评审记录和验证证据。
- [ ] 加入一个 Python 纯语言示例，证明没有前端框架时只加载通用规则与 Python 配置。
- [ ] 链接验证覆盖 Markdown 相对链接、profile 文件路径、规则 ID 引用；运行注册表与 profile 测试。
- [ ] 人工检查两套仓库的指令没有冲突，反例/正例业务行为一致，提示词长度符合限制。
- [ ] 验收：另一位协作者只凭 README、profile 和演练记录，能重复按需加载、实现、审查、提交证据的完整流程。

## 扩展策略

Go、Rust、Java 等语言在首批闭环通过后逐一增加。每新增一种语言，必须提供规则映射、语言惯用的失败传递与状态表达、反例/正例、版本或标准来源及至少一个 profile 解析测试。框架版本升级先核验来源和示例，再修改规则映射；通用规则编号保持稳定。

## 完成判定

本计划完成须同时满足：所有首批文件存在且互相链接；规则注册表和 profile 解析测试通过；三个语言和两个框架配置通过人工一致性审查；两个演练可复现；`cqing-better-code` 模板能按需挂载本仓库；未验证项目明确记录而不宣称通过。
