# 历史案例：AGY ACP 插件从 MIT 公理分析到改造、收口与上线

> **案例范围与时效声明**：本案例完整还原 `plugins/antigravity-acp` 从 MIT 公理体检、两路独立分析与方案合流、4 波分层改造 + 3 项真缺陷修复、同口径复核纠偏、ROI 收口到 `0.1.67` 真实宿主验收上线的全过程（基线 `98594ec5` → 行为候选 `b60ea597` → 发布 `0.1.67`；实测环境 Pi SDK 1.5.2、官方 AGY 1.5.14、Node 24.12.0）。所有测试数与回环请求规模仅属于本案例当时风险面下的实证记录，不作为其他插件或任务的固定门禁；案例本身自足，文末出处仅作原始溯源，不构成可移植使用依赖。

## 阶段 ①–②：定标、初始排查纠偏与源码耦合取证

- **定标**：目标为解耦 `plugins/antigravity-acp`，硬约束是严格保留 `DESIGN.md` 宪法（可纠正工具错误不连坐整轮、六场景投影保真、取消/关闭/空闲/错误迁移隔离、原生 `read_file` 只回放不代理执行）。
- **初扫纠偏（以实际代码与图分析为准）**：早期速扫曾误以为 `bridge.ts` ↔ `tool-result-projection.ts` 存在运行时环且“一半耦合来自黑盒”。通读源码与依赖图后纠正为：**全插件 36 个生产文件（8,288 行）在改造前运行时 `import` 环本来就是 0**，唯一环是含 `import type` 的编译期保守强连通块；核心病灶是 `src/runtime.ts`（2,086 行、扇出 22）把 40 多个私有可变字段同时用作进程生命周期、历史恢复、工具交付、读回放闸门与单轮流控的设计参数。
- **两路深度扫描合流（Sol 与 Opus 5.5 各自独立读码，补充了单轮速扫盲区）**：
  - **关键内部耦合与暗线**：`message-writer.ts` 通过诊断数组传递重试控制流、`runtime.ts` 取第一条匹配决定补发（C3）；`bridge.ts` 与 `runtime.ts` 保留双份工具调用账本（C1/C13）；`tool-result-projection.ts` 靠 `startsWith("[New message from the user,")` 字符串前缀暗语和 `bridge.ts` 各自算半边预算；`index.ts` 单一聚焦 `context` 指针门控历史与来源持久化（C4）；`history.ts` 对已记录 `delivery` 二次投影（C10）；`pi-native-gate.json.<flightId>.error` 从未清理（C15）。
  - **不可拆物理闭环与重构红线**：16 条外部约束（E1–E16，如 60s MCP 响应头期限、PreInvocation 600s 阻塞钩子、Pi `toolUse` 跨请求回传、Windows `session/close` 不等于进程退出）；另识别出这些敏感边界——HTTP pending 与 response in-flight 三态不可混并、`stopNative`/`closeProcess` 须留单一防递归事务、`progress.watch` 与 `audit.close` 准备/关闭等待序首轮不可擅改、测试在运行时直接访问 `runtime.closeProcess/settings/bridge` 等内部成员，以及三套 `stateRoot` 公式不可一刀切改变二进制缓存路径。

## 阶段 ③–④：目标分层与 4 波改造计划

- **目标设计与 ROI 取舍**：放弃“全面无反馈 / 全局事件总线”的过度设计，把外部协议闭环收敛在 `TurnController` 与 `NativeProcessHost` 边界，其余纯契约/纯规划下沉 L0、独立状态服务抽到 L1、宿主装配退回 L4 `index.ts`，兼容门面保留既有导出。
- **前置基线修复（S0）**：发现 `node_modules/@earendil-works/*` 是指向已清理旧槽的死软链，先用 Windows 原生 Directory Junction 重链到现役宿主包，取得 `npm run typecheck` 0 错误基线。
- **4 波推进路线**：
  1. **Wave 1（共享契约与纯函数）**：下沉 `native-status.ts`、`bridge/contract.ts`、`history-envelope.ts`、`globals.ts`、`state-paths.ts`；用结构化 `fitToolResultWithNotice` 剪断字符串暗语；拆分 `session-key.ts` 三策略；`RetryDecision` 显式先写先赢。
  2. **Wave 2（中层服务 + 缺陷 C10/C15）**：抽离 `StopCause`、`ToolCallLedger`、`ReplayCoordinator`、`KeepalivePolicy`、`PromptComposer`、`SessionContinuity`；同步修复 C10 与 C15。
  3. **Wave 3（核心控制与进程宿主）**：抽离纯函数 `TerminalResolver`、保留单一停止事务的 `NativeProcessHost`、联合执行内核 `TurnController`，将 `runtime.ts` 收敛为约 85 行门面。
  4. **Wave 4（宿主隔离 + 缺陷 C4）**：`index.ts` 缩至薄入口，抽离 `host/session-registry.ts` 与 `host/commands.ts`，切换只读 `runtime.audit` 端口，按 `sessionId` 隔离上下文与 `pendingToolSources` 修复 C4。

## 阶段 ⑤：实施、核实缺陷与分账

- **疑似缺陷核实与修复**：按“已确认缺陷不借保持行为留下”原则，逐行核实 S11 三处候选项均属实锤真缺陷，全部并入 Wave 2 / Wave 4 修复并配反例回归（C4 失焦串读与丢原件、C10 二次投影截断破坏历史保真、C15 残留错误回执文件），与纯结构抽离分开记账。
- **回归结果**：`npm run typecheck` 0 错误；41 个离线测试文件 645 pass / 0 fail / 19 原有条件 skip。随后在项目自选的提交复核中，清理了 2 处锁死内部实现细节（`Object.keys(StopCause).length` 与 `ToolCallLedger` 内部标志）的测试断言，改测外部契约后提交 `b60ea597`。

## 阶段 ⑥：同口径前后复核与口径纠偏

交付后按同一组 FR 口径复核 `98594ec5 → b60ea597`，**纠正“17 个上三角格清零”和“已成严格下三角”的乐观表述**：

| 维度 | 基线 `98594ec5` | 候选 `b60ea597` | 真实解读 |
| --- | --- | --- | --- |
| 生产文件 / 总行数 | 36 文件 / 8,288 行 | 53 文件 / 9,133 行（+10.2%） | 明确端口与门面增加了 845 行胶水成本；行数不是 $P$ |
| 最大文件与门面 | `runtime.ts` 2,086 行 | `TurnController` 1,060 行；`runtime.ts` 84 行 | 核心状态从单文件收敛，但 `TurnController` 仍是联合核 |
| 可达运行时依赖扇出 | `profile.ts` 8；`cache-audit.ts` 14 | `profile.ts` 3；`cache-audit.ts` 8 | 配置不再拉整套 bridge，审计不再拉 history builder |
| 运行时 `import` 环 | 0 | 0 | 原本就是 0，不能把 `0 → 0` 宣传为重构收益 |
| 保守强连通块（含 `import type`） | 1（`bridge` ↔ `tool-result-projection`） | 0 | 消除了类型回边，不代表原 17 个责任耦合格清零 |

**结论归类**：
- **达成**：共享基础契约隔离、宿主会话上下文隔离（C4）、历史原件不二次投影（C10）、门控过期回执清理（C15）、配置与审计解绑冗余依赖。
- **部分达成 / 真实剩余耦合**：`plugins/antigravity-acp/src/process-host.ts` 的 `NativeExecutionPort` 仍暴露 **7 个可写字段**（`flight`、`earlySteers`、`handoffPending`、`bufferedUpdates`、`changing`、`closing`、`lastTrajectory`）与 **7 个回调**，`TurnController` 构造器（`plugins/antigravity-acp/src/turn-controller.ts`）通过 getter/setter 直接代理自身状态；`plugins/antigravity-acp/src/replay-coordinator.ts` 的 `ReplayCoordinator.preInvocation` 仍通过 `ReplayPorts` 回调 `record` 与 `finish`。`NativeProcessHost` 保留单一 `stop/close` 事务避免拆坏异步清理时序，但不能宣称全部状态迁移已收敛。
- **待验证（第二公理与性能）**：无代表性负载下的成功概率分布，不量化信息量 $I$ 降幅；无前后延迟或 token 对比实测，不宣称变快或更省。

## 阶段 ⑦–⑧：ROI 收口裁决与 0.1.67 真实宿主上线

- **收口裁决**：停止继续深拆 `TurnController` ↔ `NativeProcessHost`。理由：核心分工与三项真缺陷闭环已拿齐，剩余耦合局限在可枚举的受控端口与单一生命周期事务内且已有 645 项离线回归兜底，继续深拆只换取有限的未来维护便利，却要重碰取消/交接/回放敏感时序。
- **真实宿主验收与激活（0.1.67）**：
  - 版本 `0.1.67` 相对 `b60ea597` 仅递增版本号，53 个生产文件逐一校验同 SHA256，复用已审离线结论；
  - 用真实 Pi SDK + 官方 AGY + 本机回环完成 27（基础六场景与五类工具结果）+ 29（400/503 错误与取消同会话恢复）+ 3（在途 `runtime.dispose()` 约 40 ms 收口并保留历史与原始错误）请求，所有自建进程与回环端口退出；
  - 激活 `0.1.67` 槽并完成资源重载（未重启宿主进程），在真实 Pi Web 新会话选择 `antigravity-acp/gemini-4-hydrogen` 调用一次 `bash`，工具输出与最终答复均为 `AGY_RELEASE_HOST_OK`，默认配置未变并保留 `0.1.66` 回滚槽。

---

*原始溯源（非本技能可移植运行前置）：`notes/explorer/agy-acp-axiomatic-arch-sol.md`、`notes/explorer/agy-acp-axiomatic-arch-opus55.md`、`notes/verify/agy-acp-0167-real-host-acceptance.md`、`notes/verify/agy-acp-decouple-release-20261127.md`、`notes/verify/evidence/agy-acp-decouple-release-20261127/release.json`。*
