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

- `cocos/assets/core/` 是不依赖任何引擎的纯 TypeScript：世界生成、词汇、答题、掌握度、探险控制。
  五类数据归 `cocos/assets/data/{constants,exposed-variables,resource-config,external-files,player-data}/`，详见其中 README。
  Web 和 Node 测试直接引用这些文件，不另拷一份 core。
  **core 里禁止 import 引擎 API（cc、wx、tt 等）**，禁止用 `Math.random()` 和当前时间
  做世界生成——世界必须是 `(seed, x, y, z)` 的纯函数，全设备一致。
- core 只用可擦除的 TS 语法（不用 enum 值、不用参数属性），
  这样 Node 24 可以直接跑 `.ts` 做测试，零依赖。
- 引擎层（Cocos Creator 场景/渲染/输入/平台 API）只调用 core，不复制 core 的逻辑。
- 存档格式见 `cocos/assets/data/player-data/save.ts`：只存种子 + 差异 + 学习进度，字段一旦发布不许改名；
  要改先升 `version` 并写迁移。
  Cocos 的 PlayerStore v1 容器附带角色位置；真实数据写设备存储，不进 Git。

## 怎么验证

```bash
npm test        # 24 组核心、数据与资源测试，必须全绿才能提交；也可 node test/run_tests.ts
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
- [x] 学习存在感强化：单词图鉴面板＋seenWords 存档、挖矿 16% 掉词卡
  拾取、每 10m 深度单词播报；实体贴图统一 behindAlpha 渐隐＋节点缩小；
  hint 左上角小字短句
- [x] 试玩三轮修复：drawParticles 的 `view` 未定义变量（报错＋卡顿主因）；
  跑动动作（倾斜摆动＋扬尘）；树/房渐隐改连续过渡；HUD 节流；hint 移右上；
  地表开阔平原化（树林成簇＋清空出生/村庄＋草地统一打底贴花）；
  竖井 shaft 双端标记＋头顶坑口爬升（兼容旧存档）
- [ ] 下一步：在 Cocos 内/真机试玩调手感（移动速度、挖掘时长、镜头），验证原生/小游戏端与资源打包性能；再按三系混合路线逐步增加内容。
- [ ] 词库扩充：tier2+ 数据文件（格式同 `core/vocab.ts` 的 WordEntry）

### Cocos 首轮接入（2026-10-27）

- Creator 3.8.8 工程位于 `cocos/`；打开 `assets/scenes/Main.scene` 后预览。
- 核心代码移动至 `cocos/assets/core/`，存档代码归五类数据的 player-data；旧 Web/Node 引用已更新。
- 固定数值归 constants，地层表与词表各保留唯一数据来源；手感由 GameRoot 上的 GameTuning 暴露到检查器。
- 独立开局 JSON 通过场景里的 JsonAsset 引用读取；玩家数据校验失败不自动覆盖，保存异常有提示。
- 基础接入：配置色地图、摇杆/键盘、碰撞/拐角助滑、挖掘、下挖/上梯、宝箱与顽固石答题、图鉴、自动存档与位置续玩。
- 未迁移：原创精灵、村庄/NPC、碎屑与词卡、自动踏入坑洞下潜；尚未验证手机手感或原生/小游戏构建。
- `web/assets` 的原始 PNG 不在原仓库中；已提交 Web 产物能保留，源代码重建仍须恢复 PNG。
- 已验证：19 组核心与数据测试、Cocos 严格 TypeScript 检查、Creator Web Mobile 构建（退出码 36）；独立 Edge 浏览器中验证启动、键盘/触屏摇杆、下挖、长按挖掘、刷新续档，无运行异常。手机与原生端待验证。
- 空 Cocos 模板自带的无提交 `.git` 已备份到根目录忽略项 `.local-backups/cocos-git`，工程由外层 XAP 仓库统一管理。

### Cocos 原创美术与玩法恢复（2026-10-27，接续上节）

- 已检查 origin/main，仍为 cc037d2。原 PNG 未单独提交，但已从 web/game.js 的定稿精灵表无损恢复 31 张至 `cocos/assets/resources/art/`；来源与恢复方式见 resource-config/ART_SOURCE.md。
- WorldView 使用 Cocos SpriteFrame、有限节点复用、前后排序、遮挡渐隐与 nearest 过滤；地块按 720 设计分辨率设 72×62，与原 360 视口下 36×31 比例一致。
- 已恢复村庄两栋房、道路/耕地、梅婆婆双语对话与碰撞，近旁 E 键改为交谈；布局台词在 external-files/Village.ts，Web 也改为共用。
- 已恢复挖掘/碎裂/开箱粒子、步频摆动与扬尘、井口走入下潜及上梯保护、16% 词卡掉落与拾取、每 10m 深度单词提示、完整 20 词图鉴条目。
- 常量新增在 GameRules.ts；资源映射在 ArtCatalog.ts；GameSave v1 不变，新增瞬时粒子/词卡不写存档。旧位置若落在新恢复的房屋内会推离，已有背包与差异不变。
- Web 构建与 v2 切图工具改用共用 PNG 目录；Web 产物已重建，原美术缺失导致不能重建的问题已解决。早期非原创参考切片工具仍只作研究，不应输出覆盖正式素材。
- 已验证：24 组核心/数据/资源测试、严格 TS 检查、Creator Web Mobile 构建（退出码 36）、独立浏览器的精灵加载、键盘/触屏、对话暂停、触屏开箱、图鉴与刷新续档；Web 原有冒烟与移动 fuzz 通过。
- 尚未验证：手机手感、原生与小游戏构建、编辑器内交互实测；尚无角色逐帧动画、音效或 tier2+ 内容。

## 协作约定

### 第一次视角更新（2026-10-27）

- DESIGN v0.5：沿用原创素材，开阔斜俯视；暂保留竖屏入口。GameTuning 与 Main.scene 同步为 48×32，cameraAnchor=0.56；世界铺满画布，HUD/操作浮层。
- WorldView 按新镜头偏移与高树留白扩大可见范围；树型/尺寸变化与树影仅影响显示。保存/坐标/碰撞规则不变，原 PNG 未修改。旧 Web 同步镜头比例并重建。
- 已通过 24 组核心检查、严格 TS、Creator Web Mobile 构建与浏览器操作/对话/开箱/图鉴/续档；实测地下 21 次 draw call，无运行异常。手机实机性能尚未验证。

- GitHub main 已包含 Cocos 当前版本；远程试玩见 PREVIEW.md。后续发布复用其中的 Sites 站点 ID 与 `.local-sites/xap-preview/` 工作目录，不重复创建站点；保持现有访问范围。

- 每个 PR/提交要回答：做了什么、怎么验证的（贴测试结果）、还有什么没做。
- 不要动 `PAX` 仓库；本项目只有 `Wujkk7/XAP`。
- 数值（概率、深度、奖励）都集中在 core 的常量里，调数值只改常量并在提交里写明。
- ✅ 移动里程碑：加减速速度模型＋平滑镜头＋拐角助滑＋步频动画＋落点居中/resolveEmbed 脱困；tools/smoke_drive.mjs 驾驶 fuzz 全过；main.ts 末尾 __xap 是测试钩子，勿删。
- 正式名：《地心寻词》（2026-10-27 定名）；XAP 仍是仓库名与代码代号，不要把仓库改名。
