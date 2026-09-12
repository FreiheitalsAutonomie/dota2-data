import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { validateSnapshot } from "../lib/mirror-snapshot.mjs";
const site=resolve(process.argv[2]??"site");
const snapshot=validateSnapshot(JSON.parse(await readFile(join(site,"data/snapshot.json"),"utf8")));
const heroes=[...new Set(snapshot.matches.flatMap(m=>m.players.map(p=>p.heroSlug)))];
await mkdir(join(site,"heroes"),{recursive:true});
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
// Match-data names occasionally differ from Valve's internal image names.
const valveNames={lifestealer:"life_stealer",clockwerk:"rattletrap",magnus:"magnataur",windranger:"windrunner",zeus:"zuus",shadow_fiend:"nevermore",wraith_king:"skeleton_king"};
for(let offset=0;offset<heroes.length;offset+=6) {
  await Promise.all(heroes.slice(offset,offset+6).map(async slug=>{
    const destination=join(site,"heroes",`${slug}.png`);
    try { const file=await readFile(destination);if(file.subarray(0,8).equals(signature)) return; } catch {}
    const response=await fetch(`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${valveNames[slug]??slug}.png`,{signal:AbortSignal.timeout(45000)});
    if(!response.ok) throw new Error(`英雄图片下载失败：${slug} (${response.status})`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(!bytes.subarray(0,8).equals(signature)) throw new Error(`英雄图片格式错误：${slug}`);
    await writeFile(destination,bytes);
  }));
}
console.log(`英雄图片齐全：${heroes.length} 个，访客无需访问图片来源站。`);
