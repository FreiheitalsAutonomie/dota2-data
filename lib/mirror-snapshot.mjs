import { validateState } from "../public/league/bracket-core.mjs";
import { validatePublicContent } from "./match-content.mjs";
export const MIRROR_SCHEMA_VERSION = 1;
export const MIRROR_FORMULA_VERSION = "mmr-v2";

// Explicit public projection: never serialize whole database rows.
export function publicSnapshot(matches, games, directory, exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: MIRROR_SCHEMA_VERSION,
    formulaVersion: MIRROR_FORMULA_VERSION,
    exportedAt,
    matches: matches.map(m => ({
      id: m.id, displayId: m.display_id, round: m.round, playedOn: m.played_on,
      startedAt: m.started_at ?? undefined, duration: m.duration,
      radiantScore: m.radiant_score, direScore: m.dire_score, winner: m.winner, sortOrder: m.sort_order,
      players: games.filter(p => p.match_id === m.id).map(p => ({
        playerKey: p.player_key, name: p.raw_name, short: p.raw_short,
        hero: p.hero, heroShort: p.hero_short, heroSlug: p.hero_slug, side: p.side,
        kills: p.kills, deaths: p.deaths, assists: p.assists, networth: p.networth,
        lastHits: p.last_hits, denies: p.denies, gpm: p.gpm ?? undefined,
      })),
    })),
    players: directory.map(p => ({
      id: p.id, playerKey: p.player_key, nickname: p.nickname, gameName: p.game_name,
      steamId64: p.steam_id_64 ?? "", aliases: p.aliases, notes: "",
      positionPreferences: safePositions(p.position_preferences),
      baseMmr: p.base_mmr, baseMmrUpdatedAt: null,
      mergedIntoPlayerKey: p.merged_into_player_key, mergedAt: null, mergedBy: null,
      locked: Boolean(p.locked), version: p.version, updatedAt: p.updated_at, updatedBy: null,
    })),
  };
}

function safePositions(value) {
  try {
    const positions = JSON.parse(value ?? "[]");
    return Array.isArray(positions) ? [...new Set(positions.filter(position => Number.isInteger(position) && position >= 1 && position <= 5))].sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

export function validateSnapshot(snapshot) {
  if (snapshot.seasons != null) {
    if (!Array.isArray(snapshot.seasons)) throw new Error("联赛数据格式无效。");
    const seasonIds = new Set();
    for (const season of snapshot.seasons) {
      if (!season.id || seasonIds.has(season.id) || typeof season.title !== "string" || !/^20\d{2}-H[12]$/.test(season.period) || !Number.isInteger(season.version) || season.version < 1) throw new Error("联赛届次无效或重复。");
      seasonIds.add(season.id);
      season.state = validateState(season.state);
    }
  }
  if (snapshot?.schemaVersion !== MIRROR_SCHEMA_VERSION || snapshot.formulaVersion !== MIRROR_FORMULA_VERSION) throw new Error("同步格式或 MMR 版本已变化，请先更新只读站代码。");
  if (!Number.isFinite(Date.parse(snapshot.exportedAt))) throw new Error("同步时间无效。");
  if (!Array.isArray(snapshot.matches) || !snapshot.matches.length || !Array.isArray(snapshot.players) || !snapshot.players.length) throw new Error("原站返回空数据，停止发布。");
  const directory = new Map(snapshot.players.map(p => [p.playerKey, p]));
  if (directory.size !== snapshot.players.length) throw new Error("名册有重复身份。");
  const canonical = key => {
    const seen = new Set();
    while (true) {
      if (seen.has(key)) throw new Error("名册合并关系存在循环。");
      seen.add(key);
      const p = directory.get(key);
      if (!p) throw new Error(`名册缺少身份：${key}`);
      if (!p.mergedIntoPlayerKey) return key;
      key = p.mergedIntoPlayerKey;
    }
  };
  for (const p of snapshot.players) {
    canonical(p.playerKey);
    if (p.notes || p.updatedBy || p.mergedBy) throw new Error("同步数据包含管理信息。");
    if (p.baseMmr != null && (!Number.isInteger(p.baseMmr) || p.baseMmr < 0 || p.baseMmr > 15000)) throw new Error("Base MMR 无效。");
    if (p.positionPreferences != null && (!Array.isArray(p.positionPreferences) || p.positionPreferences.some(position => !Number.isInteger(position) || position < 1 || position > 5))) throw new Error("位置偏好无效。");
  }
  const ids = new Set();
  for (const m of snapshot.matches) {
    if (!m.id || ids.has(m.id)) throw new Error("比赛 ID 缺失或重复。");
    ids.add(m.id);
    if (m.players?.length !== 10 || !["radiant", "dire"].includes(m.winner)) throw new Error(`比赛 ${m.id} 数据不完整。`);
    if (new Set(m.players.map(p => canonical(p.playerKey))).size !== 10) throw new Error(`比赛 ${m.id} 合并后选手重复。`);
    for (const side of ["radiant", "dire"]) if (m.players.filter(p => p.side === side).length !== 5) throw new Error("比赛阵营人数错误。");
    for (const p of m.players) {
      if (!/^[a-z0-9_]+$/.test(p.heroSlug)) throw new Error("英雄图片路径无效。");
      for (const field of ["kills", "deaths", "assists", "networth"]) if (!Number.isFinite(p[field]) || p[field] < 0) throw new Error("比赛统计字段无效。");
    }
  }
  if (snapshot.matchContents != null) {
    if (typeof snapshot.matchContents !== 'object' || Array.isArray(snapshot.matchContents)) throw new Error('比赛模块集合无效。');
    snapshot.matchContents = Object.fromEntries(Object.entries(snapshot.matchContents).map(([id,content]) => {
      if(!ids.has(id)) throw new Error('快报对应的比赛不存在。');
      return [id,validatePublicContent(content,id)];
    }));
  }
  if(snapshot.contentIndex != null) {
    if(typeof snapshot.contentIndex !== 'object' || Array.isArray(snapshot.contentIndex)) throw new Error('比赛模块索引无效。');
    for(const [id,entry] of Object.entries(snapshot.contentIndex)) {
      if(!ids.has(id) || !/^[a-f0-9]{64}\.json$/.test(entry?.file)) throw new Error('比赛模块文件路径无效。');
    }
  }
  return snapshot;
}
