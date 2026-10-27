import { _decorator, Component, JsonAsset } from "cc";
const { ccclass, property } = _decorator;

@ccclass("GameTuning")
export class GameTuning extends Component {
  @property({ displayName: "移动速度（格/秒）", min: 0.5, max: 12, step: 0.1 })
  moveSpeed = 4;

  @property({ displayName: "移动加速度", min: 1, max: 30, step: 1 })
  acceleration = 11;

  @property({ displayName: "每硬度挖掘秒数", min: 0.1, max: 3, step: 0.05 })
  digSeconds = 0.42;

  @property({ displayName: "镜头跟随速度", min: 1, max: 20, step: 0.5 })
  cameraFollow = 8;

  @property({ displayName: "地块宽度（设计像素）", min: 36, max: 120, step: 1 })
  tileSize = 72;

  @property({ displayName: "地块行高（设计像素）", min: 31, max: 100, step: 1 })
  rowHeight = 62;

  @property({ type: JsonAsset, displayName: "开局内容文件" })
  worldContent: JsonAsset | null = null;
}
