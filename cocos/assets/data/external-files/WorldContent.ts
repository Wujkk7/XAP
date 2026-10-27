export interface WorldContent {
  version: 1;
  title: string;
  seedString: string;
  welcome: string;
}

export function readWorldContent(value: unknown): WorldContent {
  const data = value as WorldContent;
  if (!data || data.version !== 1 ||
      ![data.title, data.seedString, data.welcome].every(v => typeof v === "string" && v.length > 0)) {
    throw new Error("开局内容格式错误：检查 world-start.json 的版本、种子与文本");
  }
  return data;
}
