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
- [x] 美术试装一轮后被 gami 否决：**不要直接照搬参考图切片贴图**，他会另做
  一版原创美术。当前构建 SPRITES 为空、用原创占位绘制；`tools/slice_assets.py`
  与切好的 PNG 只作研究材料留在工作区，不打包、不进仓库（二进制也过不了
  快照同步的 UTF-8 限制）。原创美术到位后：放 `web/assets/` 并恢复 build.mjs
  的 sprites.ts 生成即可，渲染层的 drawSprite 通路都还在
- [x] 试玩反馈三修：AABB 碰撞防穿模、全页手势锁定防滑出、朝向箭头＋
  挖土目标金框高亮＋自动转向（细节见 DESIGN.md 美术定调段）
- [x] v2 美术定版（gami 亲制，`assets/reference/v2/`）：`tools/slice_assets_v2.py`
  切 31 张精灵（边框中位数取背景色＋最大连通域清理＋个别精灵收紧容差），
  构建重新内联打包；地块调小 TILE=36/ROW_H=31、移速 4.0；NPC 改梅婆婆 May
- [x] 试玩二轮修复：update 脱困推离（防嵌块卡死）、输入闩锁重置＋主循环
  try/catch、树/房贴图收窄＋背后半透明；地表坑洞渲染＋走入下潜；
  Minecraft 式碎屑粒子（挖掘掉渣/挖碎爆发/开箱金屑）
- [x] 试玩三轮修复：drawParticles 的 `view` 未定义变量（报错＋卡顿主因）；
  跑动动作（倾斜摆动＋扬尘）；树/房渐隐改连续过渡；HUD 节流；hint 移右上；
  地表开阔平原化（树林成簇＋清空出生/村庄＋草地统一打底贴花）；
  竖井 shaft 双端标记＋头顶坑口爬升（兼容旧存档）
- [ ] 下一步：真机试玩反馈后调手感数值（移动速度、挖掘时长、镜头），再搭 Cocos
  工程骨架，把 web 原型的视图层移植过去（core 不动；精灵改走图集，不再 base64）
- [ ] 词库扩充：tier2+ 数据文件（格式同 `core/vocab.ts` 的 WordEntry）

## 协作约定

- 每个 PR/提交要回答：做了什么、怎么验证的（贴测试结果）、还有什么没做。
- 不要动 `PAX` 仓库；本项目只有 `Wujkk7/XAP`。
- 数值（概率、深度、奖励）都集中在 core 的常量里，调数值只改常量并在提交里写明。
