# 地心寻词 · XAP

像素挖宝冒险游戏，英语词汇融入宝箱与探索。设计以 [DESIGN.md](DESIGN.md) 为准。

Safari 私人远程试玩与版本记录见 [PREVIEW.md](PREVIEW.md)。

开发顺序、验收标准与勾选进度见 [开发计划 PLAN.md](PLAN.md)。

## 等距菱形视角体验版（仅本分支）

`codex/isometric-view-lab` 为独立视角实验，正式 main 保持原横屏版本。在 Creator 打开 `cocos/assets/scenes/Isometric.scene` 预览：13×13 有限地图、2:1 菱形地面，摇杆/WASD 移动，按钮切换网格、全景/跟随镜头和回到起点；桌面也可按 G/F/R。本场景不读写玩家存档，刷新回到起点，不包含完整挖掘或学习玩法。现有四方向人物与树石只用于视角验证。

构建选择 `Isometric` 启动场景，Web Mobile 输出名设为 `isometric`；构建后运行 `node tools/check_isometric.mjs` 验证移动、排序/遮挡、手机布局及存档隔离。独立远程路径为原私人试玩站点的 `/isometric/`，发布结果见 PREVIEW.md。

## Cocos Creator 预览

1. 用 **Creator 3.8.8** 打开 `cocos/`。
2. 在资源面板双击 `assets/scenes/Main.scene`，选择编辑器内或浏览器预览，点击顶部运行。
3. 键盘 WASD/方向键或左下摇杆移动；长按空格/挖掘按钮挖方块；E 下挖或在梅婆婆附近交谈，Q 在井口上梯，I 打开图鉴，B 打开背包，Esc 关闭面板。
4. 宝箱答题用按钮或数字 1–4。进度与角色位置自动保存到当前设备/站点。

当前源码为 **XPAA 横屏阶段一**：1280×720、2D 3/4 正交视图，使用用户选定的角色四向行走图集、两棵树、石头和草地。建筑、NPC 与地下矿物暂沿用旧素材。界面采用轻量 HUD，右上打开背包和分页图鉴，右下长按挖掘。远程试玩版本以 PREVIEW.md 为准，iPhone 真机验收仍待完成。

选中 Main 场景的 `GameRoot` 节点，在 **GameTuning** 中调整移动速度、加速度、挖掘时长、镜头速度、地块宽度、地面行高、角色脚底位置；保存场景后重新预览。
已接入原版 31 张原创精灵、地形/矿工/村庄、遮挡渐隐、移动碰撞、挖掘碎屑、井口自动下潜、梅婆婆双语对话、宝箱/顽固石答题、词卡掉落拾取、图鉴和存档。
当前地块宽 72、行高 48，人物与物件保持素材自身比例，按脚底位置排序；不再按旧摄像机角度拉伸精灵。旧 Canvas Web 原型仍保留竖屏 25° 投影，`npm run build:web` 不会构建新版 Cocos 试玩。

## 五类数据

目录位于 `cocos/assets/data/`，规则见 [数据管理说明](cocos/assets/data/README.md)。

| 目录 | 内容 |
| --- | --- |
| constants | 固定规则、五地层、世界生成数值、奖励与存档版本 |
| exposed-variables | Creator 检查器中可调的手感与显示参数 |
| resource-config | 原创精灵映射、地层染色、界面颜色、碎屑配色与素材来源 |
| external-files | 开局 JSON、词库、村庄布局与双语台词 |
| player-data | 存档格式、输入校验与设备存储适配 |

玩家的真实进度写到设备存储，不作为文件放在资源目录里；无效存档会提示并保留原值。
Web 原型与 Cocos 预览的站点存储独立，当前没有跨站点/跨设备存档迁移。

## 核心检查

安装 Node.js 24 后，在仓库根目录执行：

```sh
node test/run_tests.ts
node test/demo.ts
```

核心与数据代码只有一份，位于 `cocos/assets/core/` 和 `cocos/assets/data/`；纯逻辑不引入 Cocos API。
`web/` 保留 Canvas 原型，与 Cocos 共用 `cocos/assets/resources/art/*.png`。
安装 package.json 中已声明的 esbuild 开发依赖后，`npm run build:web` 可重新生成 Web 与独立 HTML 产物。
`node tools/recover_art.mjs` 可从已提交的 Web 构建恢复原始 PNG 字节；会拒绝覆盖经过另外编辑的图片。

当前提交检查：28 组核心/数据/资源/投影与 XPAA 图集、行走帧检查，Cocos TypeScript 检查，Creator Web Mobile 构建及新版浏览器 UI 检查。Windows 安装 Edge 后可运行 `node tools/check_cocos_ui.mjs`，检查背包、图鉴分页、面板暂停、双指挖掘、答题、对话、手机比例、旋转、安全区及刷新续档；截图写入忽略目录 `.local-checks/`。此前 Web 冒烟与移动 fuzz 结果属于旧 Canvas 原型。
尚未验证手机实机、原生与小游戏打包。未拾取词卡仍与原 Web 一样只保留在当前游玩会话中。
