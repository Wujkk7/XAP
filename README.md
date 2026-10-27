# 地心寻词 · XAP

像素挖宝冒险游戏，英语词汇融入宝箱与探索。设计以 [DESIGN.md](DESIGN.md) 为准。

Safari 私人远程试玩与版本记录见 [PREVIEW.md](PREVIEW.md)。

## Cocos Creator 预览

1. 用 **Creator 3.8.8** 打开 `cocos/`。
2. 在资源面板双击 `assets/scenes/Main.scene`，选择编辑器内或浏览器预览，点击顶部运行。
3. 键盘 WASD/方向键或左下摇杆移动；长按空格/挖掘按钮挖方块；E 下挖或在梅婆婆附近交谈，Q 在井口上梯，I 打开图鉴。
4. 宝箱答题用按钮或数字 1–4。进度与角色位置自动保存到当前设备/站点。

选中 Main 场景的 `GameRoot` 节点，在 **GameTuning** 中调整移动速度、加速度、挖掘时长、镜头速度、地块宽度、前上方镜头俯角、角色脚底位置；保存场景后重新预览。
已接入原版 31 张原创精灵、地形/矿工/村庄、遮挡渐隐、移动碰撞、挖掘碎屑、井口自动下潜、梅婆婆双语对话、宝箱/顽固石答题、词卡掉落拾取、图鉴和存档。
视角纠正：从角色前上方低角度观察，默认俯角 25°，地面方向不旋转。48 像素地块宽度对应约 20.3 像素投影行高；人物与物件高度使用同一俯角投影。镜头锚点为画面高度 52%，低角度遮挡按完整精灵范围处理。Cocos 与旧 Web 共用投影计算。
现有 PNG 已自带绘制透视，当前以直立平面近似；要进一步减少屋顶/帽子顶面，须替换为对应低俯角素材。
角色原素材每方向只有一帧，跑动用步频起伏与轻微摆动表现；未新增逐帧动画。

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

本轮验证：26 组核心/数据/资源/投影检查、Cocos TypeScript 检查、Web Mobile 构建、浏览器正面精灵投影比例/键盘/触屏/对话/开箱/图鉴/续档；Web 原型冒烟与移动 fuzz 检查。
尚未验证手机实机、原生与小游戏打包。未拾取词卡仍与原 Web 一样只保留在当前游玩会话中。
