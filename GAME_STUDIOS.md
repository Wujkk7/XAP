# Game Studios 接入与当前阶段

2026-10-29 用户要求安装 Game Studios，后续项目工作按其相关流程推进。

## 安装来源

- 原项目：[Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)。
- 当前使用的 Codex 适配：[DocJlm/Codex-Game-Studios](https://github.com/DocJlm/Codex-Game-Studios)，固定提交 `c29d290799ff209ca41d8bce381b2204338e0615`。
- 通过 skill-installer 安装该提交 `plugins/codex-game-studios/skills/` 下全部 73 项 `cgs-*` 技能，位置为用户目录 `.codex/skills/`。不覆盖此前 game-engine、grill-me 等技能。
- 当前机器的完整参考副本位于 `.local-backups/codex-game-studios-reference/`，不进 Git；技能中的 `plugins/codex-game-studios/references/`、`assets/` 等路径从该副本解析。副本缺失时按上述仓库与固定提交恢复，不凭空补造角色卡或模板。
- 安装的是 Codex 技能集，不声称已在桌面插件 UI 注册插件，也不启用 Claude 的运行钩子。参考角色默认在同一会话串行应用，不自行启动代理团队。

## 在本项目中怎样使用

1. 现有项目先用 `cgs-project-stage-detect` 检查状态，不能把有代码等同于完成玩法设计。
2. 用 `cgs-map-systems` 梳理已确认范围与依赖；用 `cgs-design-system` 一次细化一个系统，缺失的产品决策先问用户。
3. 设计确认后用 `cgs-create-stories` 拆最小任务，随后 `cgs-dev-story` 实现、`cgs-code-review` / `cgs-story-done` 验证交付，发布参考 `cgs-release-checklist`。按任务选用相关技能，不机械执行全部 73 项。
4. `DESIGN.md` 仍是唯一设计源头；`PLAN.md` 管进度，`AGENTS.md` 管工程约束。模板中的 concept / systems-index 先映射现有设计章节与计划；确有必要增建标准文件时只做索引或引用，不产生相互矛盾的第二套设计。
5. 保留 Cocos Creator 3.8.8、纯 TS core、五类数据目录、正式与实验存档隔离及当前仓库。模板内 Godot/Unity/Unreal 参考不能被当作切换引擎的授权。
6. 使用本项目 46 组 Node 测试、Cocos 严格 TS、Creator 构建、浏览器与真机证据；模板结构检查与游戏验收各自报告，不能以模板检查替代运行验证。

## cgs-project-stage-detect 首轮报告

**判定：INCONSISTENT（已有可玩技术原型，核心游戏循环仍在系统设计阶段）。** 不是空项目，也不能称完整玩法已进入正式生产。

证据：

- `cocos/package.json` 固定 Creator 3.8.8；`cocos/assets/` 有 33 个 TS 源文件，core 与引擎职责已分开。
- `DESIGN.md` 记录概念、优先级与访谈，`PLAN.md` 记录计划；尚无 CGS 标准的 `design/gdd/` 系统集、ADR、epic/story 文件。
- `Isometric.scene` 可运行；main 已包含多层与字母通道，黑暗视野与碑文修正代码提交 `30f0179`。
- `test/run_tests.ts` 共 46 组通过；严格 TS、Creator Web Mobile 构建（36）、三套浏览器检查通过。发布证据在 `PREVIEW.md`。
- 已有移动、碰撞、普通砸地下潜、上下通道、字母奖励与独立续档；尚无营地鉴定/交易/修复和相应工具成长闭环，生成内容仍是有限主题的验证地图。
- 未按 CGS 模板目录组织的文档不等于没有设计；需要最小适配，不重新搭建工程或覆盖已有说明。

## 已确认的核心方向

无限世界即时生成式挖宝。单层范围适中，向下持续生成，地形、藏处与宝物有变化，探索足够后能继续深入。稀有收获带回营地鉴定、交易或修复，转化为工具和探宝能力，为下一趟准备。英语仅为可选加分；移除它后仍须可玩、可循环。美术资源后期完善。

以下仍未定：撤离与重返规则、鉴定/交易/修复的具体分工、首轮成长能力、宝藏生成与发现方式、回报节奏。不得把讨论选项直接当作实现要求。

## 接下来三步

1. `cgs-map-systems`：围绕“生成探索 → 挖宝携回 → 营地处理 → 探宝成长”确定最小系统与依赖；优先补齐非英语循环。
2. `cgs-design-system`：细化一个“探宝与营地成长”系统，先讨论一趟探索怎样结束、如何回营和重返地下，再确定宝物用途与最小升级。
3. `cgs-create-stories`：设计确认后拆一条可试玩的非英语循环，验收要求关闭英语互动仍能获取收获、回营使用并开始下一趟。不得提前宣称该循环已经实现。
