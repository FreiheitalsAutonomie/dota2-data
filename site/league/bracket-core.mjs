 const SEEDS = ['A1','A2','A3','A4','B1','B2','B3','B4'];
 const seed = id => ({seed:id});
 const win = id => ({match:id,outcome:'winner'});
 const lose = id => ({match:id,outcome:'loser'});
 const MATCHES = {
  M1:{sources:[seed('A1'),seed('A2')],stage:'分组 BO1',winTo:'M5',loseTo:'M8'},
  M2:{sources:[seed('A3'),seed('A4')],stage:'分组 BO1',winTo:'M5',loseTo:'M8'},
  M3:{sources:[seed('B1'),seed('B2')],stage:'分组 BO1',winTo:'M6',loseTo:'M9'},
  M4:{sources:[seed('B3'),seed('B4')],stage:'分组 BO1',winTo:'M6',loseTo:'M9'},
  M5:{sources:[win('M1'),win('M2')],stage:'胜者组首轮',winTo:'M7',loseTo:'M11'},
  M6:{sources:[win('M3'),win('M4')],stage:'胜者组首轮',winTo:'M7',loseTo:'M10'},
  M7:{sources:[win('M5'),win('M6')],stage:'胜者组决赛',winTo:'M14',loseTo:'M13'},
  M8:{sources:[lose('M1'),lose('M2')],stage:'败者组第一轮',winTo:'M10'},
  M9:{sources:[lose('M3'),lose('M4')],stage:'败者组第一轮',winTo:'M11'},
  M10:{sources:[lose('M6'),win('M8')],stage:'败者组第二轮',winTo:'M12'},
  M11:{sources:[lose('M5'),win('M9')],stage:'败者组第二轮',winTo:'M12'},
  M12:{sources:[win('M10'),win('M11')],stage:'败者组第三轮',winTo:'M13'},
  M13:{sources:[lose('M7'),win('M12')],stage:'败者组决赛',winTo:'M14'},
  M14:{sources:[win('M7'),win('M13')],stage:'总决赛'}
 };
 const IDS = Object.keys(MATCHES);
 const newId = () => 'awa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 const teamLabel = id => `战队 ${SEEDS.indexOf(id)+1}`;
 const blankState = () => ({schema:'awacup-bracket-v1',workspaceId:newId(),updatedAt:null,teams:Object.fromEntries(SEEDS.map(id=>[id,{name:'',logo:'',captain:'',members:[]}])),assignments:Object.fromEntries(SEEDS.map(id=>[id,null])),matches:{}});
 const sourceLabel = source => source.seed || `${source.match} ${source.outcome==='winner'?'胜者':'负者'}`;
 const isLogo = value => typeof value === 'string' && value.length < 400000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

 function getParticipants(id, s, memo={}) {
  if(memo[id]) return memo[id];
  const pair=MATCHES[id].sources.map(source=>{
   if(source.seed) return s.assignments?.[source.seed]??null;
   const upstream=getParticipants(source.match,s,memo), r=s.matches[source.match];
   if(!r || !r.winnerId || upstream.some(x=>!x) || !upstream.every((x,i)=>x===r.teamIds[i]) || !upstream.includes(r.winnerId)) return null;
   return source.outcome==='winner' ? r.winnerId : upstream.find(x=>x!==r.winnerId);
  });
  return (memo[id]=pair);
 }
 function reconcile(s) {
  const removed=[];
  for(const id of IDS){
   const r=s.matches[id]; if(!r)continue;
   const p=getParticipants(id,s);
   if(p.some(x=>!x) || !p.every((x,i)=>x===r.teamIds[i]) || (r.winnerId && !p.includes(r.winnerId))){delete s.matches[id];removed.push(id);}
  }
  return removed;
 }
 function validateState(raw) {
  if(!raw || raw.schema!=='awacup-bracket-v1' || typeof raw.teams!=='object' || !raw.teams || typeof raw.matches!=='object' || !raw.matches) throw new Error('文件不是此编辑器导出的赛程 JSON。');
  const s=blankState();
  s.workspaceId=typeof raw.workspaceId==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.workspaceId) ? raw.workspaceId:newId();
  s.updatedAt=typeof raw.updatedAt==='string' && Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:null;
  // Older seasons only had slot-bound teams. Preserve played brackets; unplayed rosters become unassigned.
  const assignments=raw.assignments===undefined?Object.fromEntries(SEEDS.map(id=>[id,Object.keys(raw.matches).length?id:null])):raw.assignments;
  if(!assignments||typeof assignments!=='object'||Array.isArray(assignments))throw new Error('对阵安排格式无效。');
  const used=new Set();
  for(const slot of SEEDS){const id=assignments[slot]??null;if(id!==null&&(!SEEDS.includes(id)||used.has(id)))throw new Error('同一战队不能重复安排到多个席位。');if(id)used.add(id);s.assignments[slot]=id;}
  for(const id of SEEDS){
   const t=raw.teams[id];if(!t || typeof t.name!=='string')throw new Error(`缺少 ${id} 的战队数据。`);
   if(Array.from(t.name).length>24)throw new Error(`${id} 的战队名称超过 24 个字符。`);
   if(t.logo && !isLogo(t.logo))throw new Error(`${id} 的队标数据无效；只支持内嵌 PNG、JPG、WebP。`);
   const captain=t.captain??'', members=t.members??[];
   if(typeof captain!=='string'||Array.from(captain).length>40)throw new Error(`${id} 的队长姓名最多 40 个字符。`);
   if(!Array.isArray(members)||members.length>10||members.some(x=>typeof x!=='string'||!x.trim()||Array.from(x).length>40))throw new Error(`${id} 最多填写 10 位队员，每人姓名最多 40 个字符。`);
   s.teams[id]={name:t.name.trim(),logo:t.logo||'',captain:captain.trim(),members:members.map(x=>x.trim())};
  }
  for(const id of IDS){
   const r=raw.matches[id];if(!r)continue;
   if(!Array.isArray(r.teamIds)||r.teamIds.length!==2||r.teamIds.some(x=>!SEEDS.includes(x))||r.teamIds[0]===r.teamIds[1])throw new Error(`${id} 的参赛战队数据无效。`);
   if(!Array.isArray(r.scores)||r.scores.length!==2||r.scores.some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>99)))throw new Error(`${id} 的比分无效。`);
   if(r.winnerId!==null&&!r.teamIds.includes(r.winnerId))throw new Error(`${id} 的胜者无效。`);
   const problem=checkScores(id,r.scores,r.winnerId,r.teamIds); if(problem)throw new Error(`${id}：${problem}`);
   if(r.winnerId || r.scores.some(x=>x!==null))s.matches[id]={teamIds:[...r.teamIds],scores:[...r.scores],winnerId:r.winnerId};
  }
  const removed=reconcile(s);
  if(removed.length)throw new Error(`数据中的 ${removed.join('、')} 与上游赛果不一致，未导入。`);
  return s;
 }
 function checkScores(id,scores,winnerId,teamIds){
  if(scores.some(x=>x!==null&&(!Number.isInteger(x)||x<0||x>99)))return '比分只能为 0–99 的整数，或留空。';
  if((scores[0]===null)!==(scores[1]===null))return '请同时填写双方比分，或将双方比分均留空。';
  const isGroup=Number(id.slice(1))<=4;
  if(isGroup&&scores.some(x=>x!==null&&x>1))return '分组赛为 BO1，单场比分不能超过 1。';
  if(winnerId && scores[0]!==null){
   const i=teamIds.indexOf(winnerId);
   if(scores[i]<=scores[1-i])return '已选择的胜者比分必须高于对手；也可清空比分，仅记录胜负。';
  }
  return '';
 }

export { SEEDS, MATCHES, IDS, blankState, teamLabel, getParticipants, reconcile, validateState, checkScores };
