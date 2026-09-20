import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateSnapshot } from "../lib/mirror-snapshot.mjs";

export async function synchronize({ source = "https://dota2-data.death1never1die.chatgpt.site/api/public-snapshot", directory = "site/data", fetcher = fetch } = {}) {
  const response = await fetcher(source, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(60000), redirect: "error" });
  if (!response.ok) throw new Error(`原站导出失败（${response.status}），保留已发布数据。`);
  const snapshot = validateSnapshot(await response.json());
  const target = resolve(directory);
  await mkdir(target, { recursive: true });
  // A single atomic file keeps games, merges and Base MMR on the same revision.
  await writeFile(join(target, "snapshot.json.tmp"), JSON.stringify(snapshot));
  await rename(join(target, "snapshot.json.tmp"), join(target, "snapshot.json"));
  console.log(`同步完成：${snapshot.matches.length} 场比赛，${snapshot.players.length} 个游戏身份，${snapshot.exportedAt}`);
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await synchronize({ directory: process.argv[2] ?? "site/data" });
}
