# cqing-whitebox-code: 白盒编码规范库

一套可按业务项目的语言、框架按需加载的白盒代码规范与因果追溯资产库。

## 定位与规范边界

在工程体系中，**`cqing-better-code`** 与 **`cqing-whitebox-code`** 职责清晰分离、协同工作：

| 维度 | `cqing-better-code` (治理与门控) | `cqing-whitebox-code` (代码表达与白盒) |
|---|---|---|
| **核心职责** | 负责任务范围、授权门控、进度管理、人工审核点、VVC 验证证据 | 负责代码表达规范、失败因果保留、状态显式建模、运行时边界契约 |
| **工作阶段** | 开工授权、任务隔离、功能流转状态机、收尾检查 | 编码实现、单元设计、代码重构、白盒审查 (Whitebox Review) |
| **关注点** | "做没做对、改没改超范围、是否有验证证据" | "执行路径能否推演、状态变化能否定位、失败因果能否追溯" |

> **关键原则**：业务需求完整性优先。白盒规范绝不以删减已确认的业务逻辑或边缘用例为代价换取所谓的“代码简洁”。正例与反例必须严格保持相同业务行为。

## 白盒可检查的三个结果

本规范库所指的“白盒代码”，要求代码在不借助黑盒反推的前提下，具备以下三项可直接观察并证明的质量目标：

1. **执行路径可推演 (Deducible Execution Paths)**
   - 控制流扁平清晰，消除无边界职责的幽灵抽象与多层无谓包装。
   - 依赖卫语句与提早返回，正常主干业务流与错误分支一目了然。
   - 嵌套层级 $>3$ 视为审查信号，优先重构分支结构。
2. **状态变化可定位 (Locatable State Mutations)**
   - 消除隐式副作用与未声明的共享数据就地修改。
   - 状态使用判别联合或显式状态机建模，杜绝布尔地狱与非法中间状态。
   - 行为与状态就近编排，读操作与写操作在命名与契约上严格一致。
3. **失败原因可追溯 (Traceable Failure Causality)**
   - 绝对禁止无声丢失失败（P0）。
   - 清晰区分外部输入校验失败、预期业务失败与内部不变式破坏。
   - 错误在跨层传递时必须保留因果链（`cause` / `raise ... from`），并仅在处置边界记录一次日志，保留定位故障所需的最小必要上下文。

## 目录导航

```text
cqing-whitebox-code/
├── README.md                      # 仓库定位、边界、入口与架构导航
├── ONBOARDING.md                  # 业务项目接入与按需加载协议
├── rules.json                     # 跨语言规则机器注册表 (W01 - W12)
├── foundations/                   # 核心基础概念
│   ├── cognitive-ergonomics.md   # 认知工效：可推演路径、行为就近与消除幽灵抽象
│   └── causal-traceability.md    # 因果追溯：失败三分类、错误链保留与单点记录
├── patterns/                      # 五项通用白盒模式 (正反例对比)
│   ├── 01-explicit-control-flow.md
│   ├── 02-runtime-invariants.md
│   ├── 03-causal-error-handling.md
│   ├── 04-correlated-logging.md
│   └── 05-behavior-colocation.md
├── anti-patterns/                 # 四项黑盒反模式与判定边界
│   ├── AP01-silent-swallowing.md
│   ├── AP02-ghost-abstraction.md
│   ├── AP03-implicit-mutation.md
│   └── AP04-nested-boolean-hell.md
├── languages/                     # 语言特有适配与示例
│   ├── javascript/                # JS 适配与运行时契约
│   ├── typescript/                # TS 判别联合与输入收窄
│   └── python/                    # Python 异常链与契约
├── frameworks/                    # 框架特有适配与示例 (标注权威版本与来源)
│   ├── react/                     # React 异步状态、Effect 副作用与错误边界
│   └── vue/                       # Vue 响应式边界、组合式逻辑与生命周期错误
├── profiles/                      # 组合配置与按需加载声明
│   ├── manifest.json              # 语言/框架组合规则与文件映射
│   ├── typescript-react.md        # TS + React 组合加载入口
│   ├── typescript-vue.md          # TS + Vue 组合加载入口
│   ├── javascript-react.md        # JS + React 组合加载入口
│   └── javascript-vue.md          # JS + Vue 组合加载入口
├── scripts/                       # 自动化辅助脚本 (零第三方依赖)
│   └── resolve-profile.mjs        # Profile 解析器
├── templates/                     # 提示词、审查清单与代码模板
│   ├── system-prompt-snippet.md   # <500字 Agent 系统提示词片段
│   ├── whitebox-review-checklist.md # 逐项附带规则 ID 与证据的审查清单
│   ├── typed-error-template.ts    # 三层因果传递的强类型错误模板
│   └── state-machine-template.ts  # 判别联合状态机模板
├── checklists/                    # PR 门禁清单
│   └── pr-whitebox-gate.md        # PR 白盒合并检查门禁
├── examples/                      # 真实端到端演练案例
│   └── integration-walkthrough.md # TS+React 与 Python 演练记录
└── tests/                         # 自动化测试套件
    ├── validate-rules.mjs         # 规则注册表结构校验
    ├── resolve-profile.test.mjs   # Profile 解析器集成测试
    └── validate-links.mjs         # 引用与链接完整性测试
```

## 按需加载与快速开始

业务项目接入时，**不应把全库文档一次性塞入 AI 上下文**。请使用 `scripts/resolve-profile.mjs` 获取当前项目所需的最小加载清单：

```bash
# 生成 TypeScript + React 项目的规范加载清单
node scripts/resolve-profile.mjs --language typescript --framework react

# 输出 JSON 格式清单
node scripts/resolve-profile.mjs -l python --json
```

详细接入流程与冲突处理原则请参见 [ONBOARDING.md](./ONBOARDING.md)。
