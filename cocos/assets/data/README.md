# 数据管理：五类各有一个来源

| 目录 | 放什么 | 修改入口 |
| --- | --- | --- |
| constants | 世界生成、地层、随机盐值、答题奖励、复习间隔、存档版本等固定规则 | GameRules.ts / Strata.ts；已发布规则改变前评估旧世界兼容 |
| exposed-variables | 移动、挖掘、镜头、地块显示等可调参数 | Main 场景中 GameRoot 节点的 GameTuning 组件；保存场景即保存参数 |
| resource-config | 精灵映射、地层染色、碎屑与界面颜色 | ArtCatalog.ts / TileStyles.ts；素材来源见 ART_SOURCE.md，不放玩法状态 |
| external-files | 独立内容数据与格式校验 | world-start.json 通过 JsonAsset 引用；Tier1Vocabulary.ts / Village.ts 由 Web/Node/Cocos 共用，不复制数据 |
| player-data | 存档结构、序列化、存储适配与读取校验 | save.ts / PlayerStore.ts；真实进度仅写设备存储 |

它们是五类职责，不是依次覆盖的优先级。固定规则不接受存档或内容文件覆盖。
编辑器参数属于开发配置，不写入玩家存档；JsonAsset 引用是内容入口，不是玩家可编辑字段。
渲染和玩法脚本通过导入读取配置，不在各自文件里重复一份数值。

核心规则位于 `assets/core`，不依赖 cc/wx/tt。Web 原型和 Node 测试也引用这里。
`player-data/save.ts` 同样是纯 TypeScript；`PlayerStore.ts` 通过注入存储接口读写。
玩家存档保留现有 GameSave v1 结构；Cocos 存储容器额外记录角色位置，独立版本控制。
原生 PNG 统一放 `assets/resources/art`，两个视图共用一份图片；像素资源过滤设为 nearest。
未拾取词卡和碎屑属于会话临时状态，沿用 Web 原型行为，不写入 v1 存档。
无效存档会阻止自动覆盖并提示错误；写入失败会提示，不会清空旧档。
旧 Web 存档位于浏览器原站点，当前不自动搬到 Cocos 的另一个站点或设备。

所有 Creator 自动生成的 `.meta` 应和资源一起提交，避免场景引用失效。
不提交设备真实存档、账号凭据或编辑器生成的 library/temp。
