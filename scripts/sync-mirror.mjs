import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { validateSnapshot } from "../lib/mirror-snapshot.mjs";

export async function synchronize({ source = "https://dota2-data.death1never1die.chatgpt.site/api/public-snapshot", directory = "site/data", fetcher = fetch, token = process.env.SITES_SYNC_TOKEN } = {}) {
  if (!token?.trim()) throw new Error("缺少 SITES_SYNC_TOKEN，请先配置 GitHub Actions 同步凭证；保留已发布数据。");
  const sourceUrl = new URL(source);
  if (sourceUrl.origin !== "https://dota2-data.death1never1die.chatgpt.site" || sourceUrl.pathname !== "/api/public-snapshot" || sourceUrl.username || sourceUrl.password) throw new Error("同步凭证仅允许发送给原站的数据导出接口。");
  const response = await fetcher(sourceUrl.href, { headers: { Accept: "application/json", "OAI-Sites-Authorization": `Bearer ${token.trim()}` }, signal: AbortSignal.timeout(60000), redirect: "error" });
  if (!response.ok) throw new Error(`原站导出失败（${response.status}），保留已发布数据。`);
  const snapshot = validateSnapshot(await response.json());
  const target = resolve(directory);
  await mkdir(target, { recursive: true });
  snapshot.contentIndex = {};
  await mkdir(join(target, 'matches'), {recursive:true});
  for(const [id,content] of Object.entries(snapshot.matchContents ?? {})) {
    const body = JSON.stringify(content);
    const file = `${createHash('sha256').update(body).digest('hex')}.json`;
    await writeFile(join(target,'matches',file),body);
    snapshot.contentIndex[id] = {file};
  }
  delete snapshot.matchContents;
  // A single atomic file keeps games, merges and Base MMR on the same revision.
  // Immutable module files are written first; publish the index only after all succeed.
  await writeFile(join(target, "snapshot.json.tmp"), JSON.stringify(snapshot));
  await rename(join(target, "snapshot.json.tmp"), join(target, "snapshot.json"));
  console.log(`同步完成：${snapshot.matches.length} 场比赛，${snapshot.players.length} 个游戏身份，${snapshot.exportedAt}`);
  return snapshot;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await synchronize({ directory: process.argv[2] ?? "site/data" });
}
