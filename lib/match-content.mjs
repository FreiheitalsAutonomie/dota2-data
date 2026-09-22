// Versioned, optional modules: adding a module never changes the match/MMR schema.
export const CONTENT_SCHEMA_VERSION = 1;
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}为空或过长。`);
  return value.trim();
}
function evidence(value) {
  if (!Array.isArray(value) || value.length > 30 || value.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(id))) throw new Error('事件证据编号无效。');
  return [...new Set(value)];
}
export function validateBrief(value, matchId) {
  if (!value || String(value.matchId) !== String(matchId)) throw new Error('快报与比赛 ID 不一致。');
  const items = (input, inference = false) => {
    if (!Array.isArray(input) || input.length > 12) throw new Error('快报条目数量无效。');
    return input.map(item => ({text: text(item.text, 1600, '快报条目'), evidenceIds: evidence(item.evidenceIds ?? []), ...(inference ? {isInference: true} : {})}));
  };
  if (!Array.isArray(value.limitations) || value.limitations.length > 10) throw new Error('数据说明格式无效。');
  const sourceUrl = text(value.sourceUrl, 300, '数据来源');
  if (sourceUrl !== `https://api.opendota.com/api/matches/${matchId}`) throw new Error('数据来源须为本场 OpenDota 接口。');
  if (!Number.isFinite(Date.parse(value.generatedAt))) throw new Error('生成时间无效。');
  return {matchId: String(matchId), generatedAt: value.generatedAt, title: text(value.title, 160, '标题'), summary: text(value.summary, 2500, '概述'), summaryEvidenceIds: evidence(value.summaryEvidenceIds ?? []), highlights: items(value.highlights), analysis: items(value.analysis, true), limitations: value.limitations.map(v => text(v, 1200, '数据说明')), sourceUrl};
}
export async function matchFingerprint(match, games) {
  // Identity merges, nicknames and display order do not invalidate the analysis.
  const value = [match.id, match.played_on, match.duration, match.radiant_score, match.dire_score, match.winner,
    [...games].sort((a,b) => a.slot-b.slot).map(p => [p.slot,p.hero_slug,p.side,p.kills,p.deaths,p.assists,p.networth,p.last_hits ?? null,p.denies ?? null,p.gpm ?? null])];
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2,'0')).join('');
}
export function changeBrief(state, action, brief, fingerprint, now = new Date().toISOString()) {
  const version = state.version + 1;
  if (action === 'unpublish') return {...state, version, published: null};
  if (!['draft','publish'].includes(action)) throw new Error('未知编辑操作。');
  const content = validateBrief(brief, state.matchId);
  const draft = {schemaVersion: 1, content, sourceFingerprint: fingerprint, savedAt: now};
  return {matchId: state.matchId, version, draft, published: action === 'publish' ? {...draft, version, publishedAt: now} : state.published};
}
export function publicContent(matchId, published, fingerprint) {
  return {schemaVersion: CONTENT_SCHEMA_VERSION, matchId, modules: published ? {aiBrief: {schemaVersion: 1, version: published.version, publishedAt: published.publishedAt, stale: published.sourceFingerprint !== fingerprint, content: validateBrief(published.content, matchId)}} : {}};
}
export function validatePublicContent(value, matchId) {
  if (value?.schemaVersion !== 1 || value.matchId !== matchId || !value.modules || typeof value.modules !== 'object') throw new Error('比赛扩展数据版本无效。');
  if (Object.keys(value.modules).some(key => key !== 'aiBrief')) throw new Error('发现尚未支持的比赛模块，请更新镜像代码。');
  const b = value.modules.aiBrief;
  if (!b) return {schemaVersion: 1, matchId, modules: {}};
  if (b.schemaVersion !== 1 || !Number.isInteger(b.version) || b.version < 1 || !Number.isFinite(Date.parse(b.publishedAt)) || typeof b.stale !== 'boolean') throw new Error('快报版本信息无效。');
  return {schemaVersion: 1, matchId, modules: {aiBrief: {schemaVersion: 1, version:b.version, publishedAt:b.publishedAt, stale:b.stale, content:validateBrief(b.content, matchId)}}};
}
