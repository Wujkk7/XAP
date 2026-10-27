# Safari 远程试玩

试玩地址：[地心寻词 · Cocos 试玩](https://xap-digging-preview-wujkk7.sugaryharp130.chatgpt.site)。

当前为仅站点所有者可访问的私人预览。若浏览器提示登录，使用创建此预览的同一 ChatGPT 账号。
这是一份独立托管的 HTTPS 构建，不依赖开发电脑的本地预览服务器。

## 当前版本

- 游戏源码：`Wujkk7/XAP`，提交 `93ffa453a5468fa557316003d3cdb5ea278b0ab8`。
- 第一次视角更新：48×32 斜俯视地面、约 15 格横向视野、满画布地图与边缘浮层；沿用原创素材，暂保留竖屏，旧存档兼容。
- 运行内容：Creator 3.8.8 的 Web Mobile 构建，与本地验证版本相同。
- 站点 ID：`appgprj_6ae05ff3aefc8191839dcfc092c6aa7f`。
- 发布版本：`appgprj_6ae05ff3aefc8191839dcfc092c6aa7f~appgver_22dde159f62c81919f662fd5ffc8ae79`。
- Site 本地工作目录：`.local-sites/xap-preview/`，其 `.openai/hosting.json` 保存站点身份；该目录不进入游戏源码仓库。
- 部署状态：已成功发布；构建内 `source-version.json` 记录对应的游戏源码提交。

远程链接是固定发布快照，推送 GitHub 不会自动更新试玩；游戏改动后须重新构建和发布。
首次加载会下载游戏引擎与图片。游戏进度保存在各浏览器/站点自己的存储中，暂不提供云存档；
Safari 试玩与 Creator 本地预览不会自动交换存档。

## 后续更新

继续复用上述站点 ID，不要为每次迭代新建站点。用 Sites 读取站点当前状态和访问范围，
获取同一站点的新源码写入凭据，通过 Sites 的 source helper 打开原工作目录，
将最新 `cocos/build/web-mobile/` 同步到站点的 `dist/`，保存源码、打包并部署对应版本。
凭据仅通过隐藏标准输入传递，不写入本文件、源码或 Git 配置。

已验证本地浏览器的键盘/触屏、对话、开箱、图鉴与续档，托管服务返回部署成功。
尚未在 iPhone Safari 实机验证；若有 Safari 特有的布局或触控问题，再按实机反馈调整。
