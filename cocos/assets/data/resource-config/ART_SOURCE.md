# 原创美术来源

本轮素材来自 `Wujkk7/XAP` 的 `cc037d2250692e1e58327ab28baaa9a4e783d4c9` 提交。
原仓库只在 `web/game.js` 的 SPRITES 表中保留了 31 张 v2 定稿图片的 PNG 字节，未单独提交参考板和原图。
使用 `node tools/recover_art.mjs` 恢复至 `cocos/assets/resources/art/`，不重绘、不缩放、不重新抠图。
脚本先验证完整数量与 PNG 文件头，并拒绝覆盖已经另行编辑的 PNG。

Cocos 用原生 SpriteFrame 读取图片，资源映射在 ArtCatalog.ts；Web 构建复用同一个图片目录。
`tom_front` 是历史资源名，实际图像与游戏角色均为梅婆婆 May，暂保留文件名以兼容已有原型。
方向图每个方向只有一帧，跑动采用位移步频驱动的轻微起伏/摆动，不宣称是逐帧动画。
本轮恢复的是已提交的最终切图，参考板不在仓库中，切图工具仍需要另外提供原参考板后才能重切。
