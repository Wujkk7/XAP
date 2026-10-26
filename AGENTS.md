# AGENTS.md — 给 Codex 及其他 AI 协作者的交接说明

## 先读什么

1. `DESIGN.md` 是唯一设计源头（定位、地层、宝箱、总原则、三系混合路线）。
   **改设计先改 DESIGN.md 并在提交里说明，再改代码。**
2. 本文件只讲工程约束与当前进度，不重复设计内容。

## 项目一句话

XAP：像素风、无限程序化生成的挖宝游戏（竖屏、斜后方俯瞰），
英语学习无感嵌入（游戏优先原则见 DESIGN.md）。
目标平台：iOS/Android 原生、微信小游戏、抖音小游戏，一套代码。

## 架构铁律

- `core/` 是不依赖任何引擎的纯 TypeScript：世界生成、词汇、答题、掌握度、存档。
  **core 里禁止 import 引擎 API（cc、wx、tt 等）**，禁止用 `Math.random()` 和当前时间
  做世界生成——世界必须是 `(seed, x, y, z)` 的纯函数，全设备一致。
- core 只用可擦除的 TS 语法（不用 enum 值、不用参数属性），
  这样 Node 24 可以直接跑 `.ts` 做测试，零依赖。
- 引擎层（Cocos Creator 场景/渲染/输入/平台 API）只调用 core，不复制 core 的逻辑。
- 存档格式见 `core/save.ts`：只存种子 + 差异 + 学习进度，字段一旦发布不许改名；
  要改先升 `version` 并写迁移。

## 怎么验证

```bash
npm test        # 13 组核心测试，必须全绿才能提交
npm run demo    # ASCII 地图 + 示例题目，肉眼检查生成
```

## 当前进度（2026-10-27）

- [x] 设计文档 DESIGN.md v0.4
- [x] core 五件套：`rng.ts`（确定性哈希）、`strata.ts`（五地层）、
  `worldgen.ts`（区块生成、宝箱保底、矿脉、洞穴、地表切片）、
  `vocab.ts`（L1 20 词，含手工干扰项与例句）、`quiz.ts`（宝箱答题与奖励递减）、
  `mastery.ts`（掌握度、间隔重复、顽固石、70/20/10 选词）、`save.ts`（差异存档）
- [x] 自动化测试 13 组全绿；ASCII demo 可跑
- [x] Web 可玩原型（`web/`）：竖屏斜俯瞰 Canvas 渲染、摇杆移动、挖掘/下挖/上梯、
  宝箱与顽固石答题、村庄样本（2 栋房 + NPC Tom 双语对话）、HUD、localStorage 存档。
  构建：`npm run build:web`（esbuild 把 web/src/main.ts + core 打成 web/game.js）；
  预览：`npm run serve:web`。无头 DOM 冒烟已过，真机手感未验证。
- [x] 美术换装（按 `assets/reference/` 五张参考图）：`tools/slice_assets.py` 切出
  29 张精灵到 `web/assets/`（构建时生成 `web/src/sprites.ts` 内联，勿手改）；
  渲染层已用真贴图：草地混铺/沙路/耕地、矿石节点、矿工三向、Tom、房屋、三种树
  注：快照同步工具只能传 UTF-8 文本，`assets/reference/*.jpg` 与 `web/assets/*.png`
  等二进制文件不在仓库里；完整美术已内联在 `web/xap-standalone.html`（自包含），
  精灵可由 `tools/slice_assets.py` 从参考图重新切出（参考图在项目工作区，向 gami 索取）
- [ ] 下一步：真机试玩反馈后调手感数值（移动速度、挖掘时长、镜头），再搭 Cocos
  工程骨架，把 web 原型的视图层移植过去（core 不动；精灵改走图集，不再 base64）
- [ ] 词库扩充：tier2+ 数据文件（格式同 `core/vocab.ts` 的 WordEntry）

## 协作约定

- 每个 PR/提交要回答：做了什么、怎么验证的（贴测试结果）、还有什么没做。
- 不要动 `PAX` 仓库；本项目只有 `Wujkk7/XAP`。
- 数值（概率、深度、奖励）都集中在 core 的常量里，调数值只改常量并在提交里写明。
