import { SEEDS, MATCHES, IDS, blankState, teamLabel, getParticipants as resolveParticipants, reconcile, validateState, checkScores } from './bracket-core.mjs';
'use strict';
/* 阿哇杯本地赛程编辑器。无外部依赖。
 * 修改分组席位名称请使用界面的「战队设置」。
 * SOURCE / MATCHES 为唯一赛制定义；所有后续对阵按席位 ID 推导，不按队名匹配。
 */
(() => {
 const $ = id => document.getElementById(id);
 const LAYOUT = {
  M1:{x:54,y:342,w:280,h:136,type:'group'},M2:{x:54,y:508,w:280,h:136,type:'group'},
  M3:{x:54,y:674,w:280,h:136,type:'group'},M4:{x:54,y:840,w:280,h:136,type:'group'},
  M5:{x:390,y:341,w:246,h:126},M6:{x:390,y:488,w:246,h:126},M7:{x:1018,y:418,w:246,h:126},
  M8:{x:390,y:786,w:246,h:100},M9:{x:390,y:914,w:246,h:100},
  M10:{x:704,y:786,w:246,h:100},M11:{x:704,y:914,w:246,h:100},
  M12:{x:1018,y:850,w:246,h:100},M13:{x:1332,y:850,w:246,h:100},
  M14:{x:1648,y:496,w:218,h:198,type:'final'}
 };
 const ART = JSON.parse($('art-data').textContent);
 const esc = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone = value => JSON.parse(JSON.stringify(value));
 const newId = () => 'awa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 const sourceLabel = source => source.seed || `${source.match} ${source.outcome==='winner'?'胜者':'负者'}`;
 const isLogo = value => typeof value === 'string' && value.length < 400000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
 const font = 'Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
 let canEdit=false, leagueTitle='阿哇杯';
 let state, activeMatch=null, selectedWinner=null, teamDraft=null, uploadSeed=null;
 let presentation=false, toastTimer, confirmResolve=null, logoBusy=false, exportBusy=false;
 let storageHealthy=true, storageWarned=false;
 const measureCanvas=document.createElement('canvas');
 const measure=measureCanvas.getContext('2d');

 function getParticipants(id,s=state,memo={}){return resolveParticipants(id,s,memo);}
 function storageKey(){return 'awacup_bracket_v1_'+state.workspaceId;}
 function setSaveStatus(text,warn=false){$('saveState').classList.toggle('warn',warn);$('saveState').innerHTML='<i class="save-dot"></i><span>'+esc(text)+'</span>';}
 function save(){
  if(!canEdit)return;
  state.updatedAt=new Date().toISOString();
  setSaveStatus('草稿已修改，点击上方「发布赛程」同步给所有人',true);
  window.parent.postMessage({type:'league:changed',state:clone(state)},window.location.origin);
  updateStats();
 }
 function toast(message,duration=3300){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}
 function updateStats(){
  $('teamCount').textContent=SEEDS.filter(x=>state.teams[x].name).length+' / 8';
  $('resultCount').textContent=IDS.filter(x=>state.matches[x]?.winnerId).length+' / 14';
 }
 function displayName(id){return id ? (state.teams[id].name||teamLabel(id)):'';}
 function fitSize(value,maxWidth,start=19,min=16,weight=600){
  for(let size=start;size>=min;size--){measure.font=`${weight} ${size}px ${font}`;if(measure.measureText(value).width<=maxWidth)return size;}return min;
 }
 function fitText(text,maxWidth,size=21,weight=500){
  measure.font=`${weight} ${size}px ${font}`;
  if(measure.measureText(text).width<=maxWidth)return text;
  const chars=Array.from(text);
  while(chars.length && measure.measureText(chars.join('')+'…').width>maxWidth)chars.pop();
  return chars.join('')+'…';
 }
 const text=(x,y,value,size=20,weight=500,fill='#171c24',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(value)}</text>`;
 const rect=(x,y,w,h,fill,stroke='none',radius=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" ${extra}/>`;
 const line=(x1,y1,x2,y2,stroke='#d6dce5',width=1.2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
 function logoSvg(id,x,y,size){
  const team=state.teams[id];
  if(team?.logo)return `<image href="${team.logo}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  const label=team?.name ? Array.from(team.name).slice(0,2).join('') : id;
  return rect(x,y,size,size,'#f0f2f5','none',4)+text(x+size/2,y+size*.66,label,size*.38,700,'#778292','text-anchor="middle"');
 }
 function statusSvg(id,x,y){
  const r=state.matches[id];
  if(r?.winnerId)return text(x,y,'已结束',12,500,'#7a8594','text-anchor="end"');
  if(r?.scores.some(x=>x!==null))return text(x,y,'比分已录',12,500,'#7a8594','text-anchor="end"');
  return `<g class="editor-only edit-hint" opacity="0">${text(x,y,'录入',12,500,'#8992a0','text-anchor="end"')}</g>`;
 }
 function groupCard(id){
  const p=LAYOUT[id],m=MATCHES[id],participants=getParticipants(id),r=state.matches[id];
  let s=`<g class="match-card group-card" data-match="${id}" tabindex="0" role="button" aria-label="${id}，分组赛，点击录入赛果"><title>${id} · ${participants.map(displayName).map(esc).join(' vs ')}；点击席位安排战队，点击场次编号录入赛果</title>`;
  s+=rect(p.x,p.y,p.w,p.h,'#fff','#d5dce6',3,'class="card-outline"');
  s+=rect(p.x+1,p.y+1,p.w-2,31,'#edf0f4');
  s+=text(p.x+16,p.y+23,id,20,700)+statusSvg(id,p.x+p.w-14,p.y+22);
  s+=text(p.x+p.w/2,p.y+79,'VS',15,500,'#9aa3b0','text-anchor="middle"');
  for(let i=0;i<2;i++){
   const tid=participants[i],slot=m.sources[i].seed,t=state.teams[tid],cx=p.x+(i===0?75:205),isWin=tid&&r?.winnerId===tid,isLoss=tid&&r?.winnerId&&r.winnerId!==tid;
   s+=`<g class="team-hit" data-slot="${slot}" tabindex="0" role="button" aria-label="安排 ${slot} 席位"><title>${esc(slot+' · '+(displayName(tid)||'待安排'))}</title>`;
   s+=rect(cx-60,p.y+34,120,72,'transparent','none',2,'class="team-hover"');
   if(t){
    s+=logoSvg(tid,cx-15,p.y+39,30);
    const nameSize=fitSize(displayName(tid),114,19,16,isWin?800:600);
    s+=text(cx,p.y+94,fitText(displayName(tid),114,nameSize,isWin?800:600),nameSize,isWin?800:600,isLoss?'#9da5b0':'#171c24','text-anchor="middle"');
   } else s+=text(cx,p.y+72,slot,24,700,'#7a8698','text-anchor="middle"')+text(cx,p.y+96,'待安排',14,400,'#7a8698','text-anchor="middle"');
   if(isWin)s+=`<path d="m${cx+39} ${p.y+49} 4 4 7-8" fill="none" stroke="#242d39" stroke-width="2"/>`;
   s+='</g>';
  }
  if(r?.scores[0]!==null && r?.scores[0]!==undefined)s+=text(p.x+p.w/2,p.y+101,`${r.scores[0]} : ${r.scores[1]}`,12,700,'#5e6978','text-anchor="middle"');
  s+=rect(p.x+1,p.y+108,p.w-2,27,'#f6f7f9')+line(p.x,p.y+108,p.x+p.w,p.y+108);
  s+=text(p.x+p.w/2,p.y+127,`胜者 → ${m.winTo}  |  负者 → ${m.loseTo}`,13,400,'#7a8698','text-anchor="middle"');
  return s+'</g>';
 }
 function standardCard(id){
  const p=LAYOUT[id],m=MATCHES[id],participants=getParticipants(id),r=state.matches[id],hasFooter=!!m.loseTo;
  let s=`<g class="match-card" data-match="${id}" tabindex="0" role="button" aria-label="${id}，${m.stage}，点击录入赛果"><title>${esc(id+' · '+m.stage+'；'+m.sources.map((source,i)=>participants[i]?displayName(participants[i])+'（'+sourceLabel(source)+'）':sourceLabel(source)).join(' vs '))}</title>`;
  s+=rect(p.x,p.y,p.w,p.h,'#fff','#d5dce6',3,'class="card-outline"')+rect(p.x+1,p.y+1,p.w-2,27,'#edf0f4');
  s+=text(p.x+15,p.y+21,id,20,700)+statusSvg(id,p.x+p.w-12,p.y+20);
  for(let i=0;i<2;i++){
   const tid=participants[i],label=tid?displayName(tid):sourceLabel(m.sources[i]),isWin=tid&&r?.winnerId===tid,isLoss=tid&&r?.winnerId&&r.winnerId!==tid,ry=p.y+28+i*36;
   if(isWin)s+=rect(p.x+1,ry,p.w-2,36,'#f5f6f8');
   const score=r?.scores[i],showScore=score!==null&&score!==undefined;
   if(tid){
    s+=logoSvg(tid,p.x+13,ry+6,24);
    s+=text(p.x+46,ry+24,fitText(label,p.w-83,18,isWin?700:500),18,isWin?700:500,isLoss?'#9aa3b1':'#232a35');
   }else{s+=text(p.x+p.w/2,ry+24,label,20,400,'#414b5a','text-anchor="middle"');}
   if(showScore)s+=text(p.x+p.w-15,ry+24,score,18,isWin?700:500,isLoss?'#a0a8b4':'#2e3745','text-anchor="end"');
   else if(isWin)s+=`<path d="m${p.x+p.w-26} ${ry+18} 4 4 7-8" fill="none" stroke="#26323f" stroke-width="1.8"/>`;
   if(i===0)s+=line(p.x,p.y+64,p.x+p.w,p.y+64);
  }
  if(hasFooter){s+=rect(p.x+1,p.y+100,p.w-2,25,'#f6f7f9')+line(p.x,p.y+100,p.x+p.w,p.y+100)+text(p.x+p.w/2,p.y+118,`负者 → ${m.loseTo}`,13,400,'#7a8698','text-anchor="middle"');}
  return s+'</g>';
 }
 function finalCard(){
  const id='M14',p=LAYOUT[id],m=MATCHES[id],participants=getParticipants(id),r=state.matches[id];
  let s=`<g class="match-card final-card" data-match="M14" tabindex="0" role="button" aria-label="M14 总决赛，点击录入赛果"><title>总决赛 · ${esc(participants.map((t,i)=>t?displayName(t):sourceLabel(m.sources[i])).join(' vs '))}</title>`;
  s+=rect(p.x,p.y,p.w,p.h,'#fff','#cf0c30',3,'class="card-outline" stroke-width="1.5"')+rect(p.x+1,p.y+1,p.w-2,45,'#cf0c30');
  s+=text(p.x+p.w/2,p.y+31,'M14 · 总决赛',23,700,'#fff','text-anchor="middle"');
  for(let i=0;i<2;i++){
   const tid=participants[i],label=tid?displayName(tid):sourceLabel(m.sources[i]),ry=p.y+46+i*76,isWin=tid&&r?.winnerId===tid;
   if(isWin)s+=rect(p.x+1,ry,p.w-2,76,'#fff5f6');
   if(tid){
    s+=logoSvg(tid,p.x+15,ry+14,28);
    s+=text(p.x+51,ry+35,fitText(label,p.w-79,19,isWin?700:600),19,isWin?700:600,'#252c37');
   }else s+=text(p.x+p.w/2,ry+37,label,24,700,'#232a35','text-anchor="middle"');
   const score=r?.scores[i];
   if(score!==null&&score!==undefined)s+=text(p.x+p.w-12,ry+35,score,18,700,'#343f4f','text-anchor="end"');
   else if(isWin)s+=`<path d="m${p.x+p.w-24} ${ry+30} 4 4 7-8" fill="none" stroke="#cf0c30" stroke-width="1.8"/>`;
   s+=text(p.x+p.w/2,ry+61,i===0?'胜者组冠军':'败者组冠军',14,400,'#7d8796','text-anchor="middle"');
  }
  s+=line(p.x,p.y+122,p.x+p.w,p.y+122,'#e2dfe3');
  s+='</g>';
  if(r?.winnerId){
   const cx=p.x+p.w/2;
   s+=text(cx,752,'本 届 冠 军',14,600,'#a2838a','text-anchor="middle"');
   s+=logoSvg(r.winnerId,cx-24,771,48);
   s+=text(cx,854,fitText(displayName(r.winnerId),218,24,700),24,700,'#cf0c30','text-anchor="middle"');
  }
  return s;
 }
 function wire(path){return `<path d="${path}" fill="none" stroke="#2c3541" stroke-width="1.65" stroke-linejoin="round" marker-end="url(#arrow)"/>`;}
 function stageHeader(x,y,num,label,size=31){return text(x,y,num,64,700,'#c0c6d0')+text(x+100,y-4,label,size,700);}
 function roundBar(x,y,label){return rect(x,y,246,30,'#edf0f4')+text(x+123,y+21,label,17,700,'#252d39','text-anchor="middle"');}
 function render(){
  let out=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1920 1080" width="1920" height="1080" role="group" aria-labelledby="svgTitle svgDesc" style="font-family:${esc(font)};background:white"><title id="svgTitle">阿哇杯｜赛制与晋级图</title><desc id="svgDesc">8 支战队，M1 至 M14。分组赛 BO1，胜者组与败者组交叉晋级。所有黑色连线仅表示胜者晋级，负者去向见卡片文字。</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#2c3541"/></marker></defs><style>.match-card{cursor:pointer}.match-card:hover .card-outline{stroke:#939eaf;stroke-width:1.8px}.match-card:hover .edit-hint{opacity:1}.match-card:focus-visible .card-outline{stroke:#cf0c30;stroke-width:2px}.team-hit{cursor:pointer}.team-hit:hover .team-hover{fill:#f4f5f8}.team-hit:focus-visible .team-hover{stroke:#cf0c30;stroke-width:1.4px}.final-card:hover .card-outline{stroke:#ad0b28}.export-mode .editor-only{display:none}</style>`;
  out+=rect(0,0,1920,1080,'#fff');
  out+=`<image href="${ART}" x="1403" y="1" width="464" height="204" preserveAspectRatio="xMaxYMax meet"/>`;
  out+=text(54,111,leagueTitle,Math.min(79,260/Math.max(Array.from(leagueTitle).length,1)),900,'#080b10','letter-spacing="-2"')+line(330,53,330,114,'#222936',2.5)+text(373,111,'赛制与晋级图',74,800,'#080b10','letter-spacing="-1"');
  out+=text(60,155,'DOTA 2 联赛',22,500,'#4d586b','letter-spacing="10"');
  out+=line(54,208,1866,208)+line(362,230,362,1013)+line(1616,230,1616,1013)+line(390,630,1578,630);
  out+=stageHeader(54,274,'01','分组 BO1',30)+text(54,306,'四场比赛，按胜负分流',15,400,'#7d8899');
  out+=stageHeader(390,274,'02','胜者组')+stageHeader(390,694,'03','败者组');
  out+=text(1648,274,'04',64,700,'#c0c6d0')+text(1748,270,'总决赛',29,700);
  out+=roundBar(390,299,'胜者组首轮')+roundBar(1018,299,'胜者组决赛');
  out+=roundBar(390,730,'第一轮')+roundBar(704,730,'第二轮')+roundBar(1018,730,'第三轮')+roundBar(1332,730,'败者组决赛');
  // Only winner-advancement connectors are drawn. Losses use explicit source/destination text.
  out+=wire('M636 405 H849 V464 H1018')+wire('M636 552 H878 V500 H1018');
  out+=wire('M1264 482 H1592 V580 H1648');
  out+=wire('M636 850 H666 V868 H704')+wire('M636 978 H666 V996 H704');
  out+=wire('M950 850 H984 V896 H1018')+wire('M950 978 H984 V932 H1018');
  out+=wire('M1264 914 H1298 V932 H1332')+wire('M1578 914 H1628 V656 H1648');
  for(const id of IDS)out+=LAYOUT[id].type==='group'?groupCard(id):LAYOUT[id].type==='final'?finalCard():standardCard(id);
  out+=line(54,1040,1866,1040)+wire('M60 1066 H101');
  out+=text(116,1072,'连线仅表示胜者晋级；参赛来源与负者去向见各场次卡片。',16,400,'#788497');
  out+=text(1863,1071,'AWA CUP / DOTA 2',13,400,'#98a2b2','text-anchor="end"');
  $('canvas').innerHTML=out+'</svg>';
  updateStats();
 }

 function openAssignments(focusSlot){
  if(!canEdit)return;
  $('assignmentError').hidden=true;
  $('assignmentGrid').innerHTML=['M1','M2','M3','M4'].map(match=>`<section><h3>${match}</h3>${MATCHES[match].sources.map(({seed:slot})=>`<label class="roster-label" for="slot-${slot}">${slot}</label><select id="slot-${slot}" style="width:100%;min-height:42px;font-size:16px"><option value="">待安排</option>${SEEDS.filter(id=>state.teams[id].name||state.assignments[slot]===id).map(id=>`<option value="${id}" ${state.assignments[slot]===id?'selected':''}>${esc(displayName(id))}（${teamLabel(id)}）</option>`).join('')}</select>`).join('')}</section>`).join('');
  $('assignmentDialog').showModal();requestAnimationFrame(()=>$('slot-'+(focusSlot||'A1')).focus());
 }
 $('assignmentForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!canEdit)return;
  const candidate=clone(state);candidate.assignments=Object.fromEntries(SEEDS.map(slot=>[slot,$('slot-'+slot).value||null]));
  const removed=reconcile(candidate);
  try{validateState(candidate);}catch(e){errorIn('assignmentError',e.message);return;}
  if(removed.length&&!await confirmAction('调整对阵会清除相关赛果',`将清除 ${removed.join('、')} 的旧赛果；报名名单保持不变。`,'确认调整'))return;
  state=candidate;save();render();$('assignmentDialog').close();
 });
 function openTeams(focusSeed){
  if(!canEdit)return;
  teamDraft=clone(state.teams);$('teamError').hidden=true;
  const groups=[['报名战队 1–2','A1','A2'],['报名战队 3–4','A3','A4'],['报名战队 5–6','B1','B2'],['报名战队 7–8','B3','B4']];
  $('teamGrid').innerHTML=groups.map(([title,...ids])=>`<section><h3 class="team-group-title">${title}</h3>${ids.map(id=>`<div class="team-row"><button type="button" class="logo-upload" data-upload="${id}" aria-label="上传 ${id} 队标">${teamDraft[id].logo?`<img src="${teamDraft[id].logo}" alt="${id} 队标">`:`<span>${SEEDS.indexOf(id)+1}</span>`}</button><div class="team-field"><div class="field-label"><label for="name-${id}"><b>${teamLabel(id)}</b> 名称</label><button type="button" data-remove-logo="${id}" ${teamDraft[id].logo?'':'hidden'}>移除队标</button></div><input id="name-${id}" name="${id}" type="text" maxlength="48" placeholder="输入战队名称" autocomplete="off" value="${esc(teamDraft[id].name)}"><label class="roster-label" for="captain-${id}">队长</label><input id="captain-${id}" type="text" maxlength="40" placeholder="队长姓名 / 游戏昵称" value="${esc(teamDraft[id].captain||'')}"><label class="roster-label" for="members-${id}">队员（每行一人，不含队长）</label><textarea id="members-${id}" rows="4" placeholder="填写其余队员，可包含替补">${esc((teamDraft[id].members||[]).join('\n'))}</textarea></div></div>`).join('')}</section>`).join('');
  $('teamDialog').showModal();
  requestAnimationFrame(()=>{const el=$('name-'+(focusSeed||'A1'));el.focus();el.select();});
 }
 function errorIn(id,message){$(id).textContent=message;$(id).hidden=false;}
 function updateLogoPreview(id){
  const button=$('teamGrid').querySelector(`[data-upload="${id}"]`);
  button.innerHTML=teamDraft[id].logo?`<img src="${teamDraft[id].logo}" alt="${id} 队标">`:`<span>${id}</span>`;
  $('teamGrid').querySelector(`[data-remove-logo="${id}"]`).hidden=!teamDraft[id].logo;
 }
 async function compressLogo(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  if(file.size>5*1024*1024)throw new Error('单张队标不能超过 5 MB。');
  const url=URL.createObjectURL(file);
  try{
   const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('图片读取失败，请更换图片。'));i.src=url;});
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
   const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
   const scale=Math.min(128/img.naturalWidth,128/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
   ctx.drawImage(img,(128-w)/2,(128-h)/2,w,h);
   return canvas.toDataURL('image/png');
  }finally{URL.revokeObjectURL(url);}
 }
 function openMatch(id){
  activeMatch=id;const m=MATCHES[id],pair=getParticipants(id),r=state.matches[id];selectedWinner=r?.winnerId||null;
  $('matchError').hidden=true;$('matchKicker').textContent='AWA CUP / '+id;
  $('matchTitle').textContent=id+' · '+m.stage;
  $('matchSubtitle').textContent=pair.every(Boolean)?'选择获胜战队；双方比分可选填。':(Number(id.slice(1))<=4?'请先安排首轮参赛战队。':'等待上游赛果，参赛战队尚未全部确定。');
  $('matchSides').innerHTML=pair.map((tid,i)=>`<div class="match-side"><div class="match-logo">${tid&&state.teams[tid].logo?`<img src="${state.teams[tid].logo}" alt="队标">`:`<span>${tid||'—'}</span>`}</div><div class="match-team"><div class="match-team-name">${esc(tid?displayName(tid):sourceLabel(m.sources[i]))}</div><div class="match-team-source">${esc(tid?(m.sources[i].seed?`分组席位 ${m.sources[i].seed}`:`来源：${sourceLabel(m.sources[i])}`):(m.sources[i].seed?`待安排席位 ${m.sources[i].seed}`:`需先完成 ${m.sources[i].match}`))}</div></div><input class="score-input" id="score-${i}" type="number" min="0" max="${Number(id.slice(1))<=4?1:99}" step="1" inputmode="numeric" placeholder="—" aria-label="${esc(tid?displayName(tid):sourceLabel(m.sources[i]))} 比分" value="${r?.scores[i]??''}" ${pair.every(Boolean)?'':'disabled'}><button type="button" class="winner-choice" data-winner="${tid||''}" aria-pressed="${!!tid&&selectedWinner===tid}" ${pair.every(Boolean)?'':'disabled'}>${tid&&selectedWinner===tid?'✓ 胜者':'设为胜者'}</button></div>`).join('');
  $('resultInfo').textContent=pair.every(Boolean)?'点击已选胜者可取消选择。仅填写比分不会自动宣布胜者；确定胜负后，请选择胜者并保存。':(Number(id.slice(1))<=4?'管理员可点击「安排对阵」选择已报名的队伍。':'后续对阵由上游赛果决定，请先录入上游比赛。');
  let route=m.winTo?`胜者 → ${m.winTo}`:'胜者 → 阿哇杯冠军';
  route+=m.loseTo?`　｜　负者 → ${m.loseTo}`:id==='M14'?'　｜　负者 → 亚军':'　｜　负者结束本届比赛';
  if(Number(id.slice(1))<=4)route+='。分组赛为 BO1。';
  $('matchRoute').textContent=route;
  $('saveMatch').disabled=!pair.every(Boolean);$('clearMatch').hidden=!r;
  $('matchDialog').querySelectorAll('input, [data-winner]').forEach(el=>el.disabled=!canEdit||!pair.every(Boolean));
  $('saveMatch').hidden=!canEdit;$('clearMatch').hidden=!canEdit||!r;
  if(!canEdit)$('matchSubtitle').textContent='已发布赛程 · 比分与晋级关系';
  $('matchDialog').showModal();
 }
 function selectWinner(tid){
  if(!canEdit)return;
  selectedWinner=selectedWinner===tid?null:tid;
  $('matchSides').querySelectorAll('[data-winner]').forEach(button=>{const chosen=selectedWinner===button.dataset.winner;button.setAttribute('aria-pressed',String(chosen));button.textContent=chosen?'✓ 胜者':'设为胜者';});
 }
 function confirmAction(title,message,yesText='确认'){
  return new Promise(resolve=>{
   confirmResolve=resolve;$('confirmTitle').textContent=title;$('confirmText').textContent=message;$('confirmYes').textContent=yesText;$('confirmDialog').showModal();$('confirmNo').focus();
  });
 }
 function finishConfirm(answer){$('confirmDialog').close();const resolve=confirmResolve;confirmResolve=null;if(resolve)resolve(answer);}
 async function applyMatch(nextRecord){
  if(!canEdit)return;
  const id=activeMatch,candidate=clone(state);
  if(nextRecord)candidate.matches[id]=nextRecord;else delete candidate.matches[id];
  const removed=reconcile(candidate);
  if(removed.length && !await confirmAction('将同步更新后续对阵',`修改 ${id} 会改变后续参赛来源。为避免旧赛果对应到错误战队，将清除 ${removed.join('、')} 的比分和胜负记录。\n战队名称和队标不会被删除。`,'确认更新'))return;
  state=candidate;save();render();$('matchDialog').close();toast(nextRecord?.winnerId?`${id} 赛果已保存，晋级对阵已更新。`:nextRecord?`${id} 比分已保存，尚未确认胜者。`:`${id} 结果已清除。`);
 }
 function setPresentation(value){presentation=value;document.body.classList.toggle('presentation',value);$('exitPresent').hidden=!value;if(value)window.scrollTo(0,0);}
 function closeMenus(){for(const id of ['export','more']){$(id+'Menu').hidden=true;$(id+'Toggle').setAttribute('aria-expanded','false');}}
 function toggleMenu(name){const next=$(name+'Menu').hidden;closeMenus();$(name+'Menu').hidden=!next;$(name+'Toggle').setAttribute('aria-expanded',String(next));}
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function timestamp(){const d=new Date();return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');}
 function svgForExport(){
  const root=$('canvas').querySelector('svg').cloneNode(true);root.setAttribute('class','export-mode');root.setAttribute('width','1920');root.setAttribute('height','1080');
  root.querySelectorAll('.editor-only').forEach(n=>n.remove());
  root.querySelectorAll('[tabindex]').forEach(n=>{n.removeAttribute('tabindex');n.removeAttribute('role');});
  return new XMLSerializer().serializeToString(root);
 }
 async function exportPng(){
  if(exportBusy)return;exportBusy=true;toast('正在生成 4K 图片…',15000);
  let url;
  try{
   if(document.fonts?.ready)await document.fonts.ready;
   const svg=svgForExport();url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
   const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片渲染失败'));image.src=url;});
   const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,3840,2160);ctx.drawImage(img,0,0,3840,2160);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('无法生成图片');
   download(blob,'阿哇杯_赛制与晋级图_'+timestamp()+'.png');toast('4K PNG 已生成。');
  }catch(e){console.error(e);toast('此浏览器未能生成 PNG，请改用「导出矢量 SVG」，或使用 Chrome / Edge 打开。',6000);}
  finally{if(url)URL.revokeObjectURL(url);exportBusy=false;}
 }
 function exportHTML(){
  const documentCopy=document.documentElement.cloneNode(true),snapshot=clone(state);snapshot.workspaceId=newId();
  documentCopy.querySelector('#initial-data').textContent=JSON.stringify(snapshot).replace(/</g,'\\u003c');
  documentCopy.querySelector('#canvas').innerHTML='';
  documentCopy.querySelector('body').classList.remove('presentation');
  documentCopy.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));
  for(const id of ['exportMenu','moreMenu','toast','exitPresent'])documentCopy.querySelector('#'+id).setAttribute('hidden','');
  for(const id of ['exportToggle','moreToggle'])documentCopy.querySelector('#'+id).setAttribute('aria-expanded','false');
  documentCopy.querySelector('#teamGrid').innerHTML='';documentCopy.querySelector('#matchSides').innerHTML='';
  documentCopy.querySelector('#saveState').innerHTML='<i class="save-dot"></i><span>正在加载</span>';
  download(new Blob(['<!doctype html>\n'+documentCopy.outerHTML],{type:'text/html;charset=utf-8'}),'阿哇杯_可编辑赛程_'+timestamp()+'.html');
  toast('已保存包含当前战队和赛果的 HTML，可分享或继续编辑。',4500);
 }

 // Event bindings: delegated SVG clicks remain valid after every redraw.
 $('canvas').addEventListener('click',event=>{
  if(presentation)return;
  const slot=event.target.closest('[data-slot]');if(slot){openAssignments(slot.dataset.slot);return;}
  const match=event.target.closest('[data-match]');if(match)openMatch(match.dataset.match);
 });
 $('canvas').addEventListener('keydown',event=>{
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-slot],[data-match]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
 });
 $('editTeams').addEventListener('click',()=>openTeams());
 $('teamGrid').addEventListener('click',event=>{
  const upload=event.target.closest('[data-upload]');if(upload){uploadSeed=upload.dataset.upload;$('logoFile').value='';$('logoFile').click();return;}
  const remove=event.target.closest('[data-remove-logo]');if(remove){teamDraft[remove.dataset.removeLogo].logo='';updateLogoPreview(remove.dataset.removeLogo);}
 });
 $('logoFile').addEventListener('change',async()=>{
  const file=$('logoFile').files[0];if(!file||!uploadSeed)return;
  const id=uploadSeed;logoBusy=true;
  try{teamDraft[id].logo=await compressLogo(file);updateLogoPreview(id);$('teamError').hidden=true;}catch(e){errorIn('teamError',e.message);}finally{logoBusy=false;}
 });
 $('teamForm').addEventListener('submit',event=>{
  event.preventDefault();if(!canEdit)return;if(logoBusy){errorIn('teamError','正在处理队标，请稍后保存。');return;}
  for(const id of SEEDS){const name=$('name-'+id).value.trim();if(Array.from(name).length>24){errorIn('teamError',`${id} 的战队名称最多 24 个字符。`);$('name-'+id).focus();return;}teamDraft[id].name=name;}
  for(const id of SEEDS){teamDraft[id].captain=$('captain-'+id).value.trim();teamDraft[id].members=$('members-'+id).value.split('\n').map(x=>x.trim()).filter(Boolean);}
  try{state=validateState({...state,teams:clone(teamDraft)});}catch(e){errorIn('teamError',e.message);return;}
  save();render();$('teamDialog').close();toast('战队名单已加入草稿；点击上方「发布赛程」保存到平台。');
 });
 $('matchSides').addEventListener('click',event=>{const button=event.target.closest('[data-winner]');if(button&&!button.disabled)selectWinner(button.dataset.winner);});
 $('matchForm').addEventListener('submit',async event=>{
  event.preventDefault();const pair=getParticipants(activeMatch);if(!pair.every(Boolean))return;
  const scores=[0,1].map(i=>{const raw=$('score-'+i).value.trim();return raw===''?null:Number(raw);});
  const error=checkScores(activeMatch,scores,selectedWinner,pair);if(error){errorIn('matchError',error);return;}
  await applyMatch(selectedWinner||scores.some(x=>x!==null)?{teamIds:pair,scores,winnerId:selectedWinner}:null);
 });
 $('clearMatch').addEventListener('click',()=>applyMatch(null));
 document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
 $('confirmYes').addEventListener('click',()=>finishConfirm(true));$('confirmNo').addEventListener('click',()=>finishConfirm(false));
 $('confirmDialog').addEventListener('cancel',event=>{event.preventDefault();finishConfirm(false);});
 $('present').addEventListener('click',()=>setPresentation(true));$('exitPresent').addEventListener('click',()=>setPresentation(false));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();if(presentation)setPresentation(false);}});
 $('exportToggle').addEventListener('click',()=>toggleMenu('export'));$('moreToggle').addEventListener('click',()=>toggleMenu('more'));
 document.addEventListener('click',event=>{if(!event.target.closest('.menu-wrap'))closeMenus();});
 for(const menu of ['exportMenu','moreMenu'])$(menu).addEventListener('click',event=>{if(event.target.closest('button'))closeMenus();});
 $('exportHTML').addEventListener('click',exportHTML);
 $('exportPNG').addEventListener('click',exportPng);
 $('exportSVG').addEventListener('click',()=>{download(new Blob([svgForExport()],{type:'image/svg+xml;charset=utf-8'}),'阿哇杯_赛制与晋级图_'+timestamp()+'.svg');toast('矢量 SVG 已生成。');});
 $('exportJSON').addEventListener('click',()=>{download(new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}),'阿哇杯_赛程数据_'+timestamp()+'.json');toast('赛程数据已导出。');});
 $('importJSON').addEventListener('click',()=>{$('jsonFile').value='';$('jsonFile').click();});
 $('jsonFile').addEventListener('change',async()=>{
  const file=$('jsonFile').files[0];if(!file)return;
  try{
   if(file.size>8*1024*1024)throw new Error('JSON 文件过大，请使用此编辑器导出的备份文件。');
   const incoming=validateState(JSON.parse(await file.text()));
   if(!await confirmAction('导入赛程数据','导入后将替换当前的战队名称、队标和赛果。建议先导出当前数据作为备份。','导入并替换'))return;
   incoming.workspaceId=state.workspaceId;state=incoming;save();render();toast('赛程数据已导入。');
  }catch(e){toast('导入失败：'+e.message,6500);}
 });
 $('clearResults').addEventListener('click',async()=>{
  if(!Object.keys(state.matches).length){toast('目前没有已录入的比赛结果。');return;}
  if(await confirmAction('清空比赛结果？','将清除全部比分和胜负记录，但保留 8 支战队的名称和队标。','清空赛果')){state.matches={};save();render();toast('比赛结果已清空，战队信息已保留。');}
 });
 $('resetAll').addEventListener('click',async()=>{
  if(await confirmAction('重置全部内容？','将清空所有战队名称、队标、比分和胜负记录，恢复空白赛程。此操作无法撤销，建议先导出备份。','重置全部')){const id=state.workspaceId;state=blankState();state.workspaceId=id;save();render();toast('已恢复空白赛程。');}
 });
 $('help').addEventListener('click',()=>$('helpDialog').showModal());$('print').addEventListener('click',()=>window.print());
 state=blankState();
 function applyAccess(){
  for(const id of ['editTeams','importJSON','clearResults','resetAll'])$(id).hidden=!canEdit;
  $('exportHTML').hidden=true;
  document.body.classList.toggle('view-only',!canEdit);
  document.querySelector('.hintbar .left span').textContent=canEdit?'报名后点击席位安排对阵；确定参赛双方后可录入赛果。':'点击场次查看比分；胜者与负者按赛制自动晋级。';
 }
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==window.location.origin)return;
  if(event.data?.type==='league:arrange'){if(canEdit)openAssignments();return;}
  if(event.data?.type==='league:edit-team'){if(canEdit&&SEEDS.includes(event.data.seed))openTeams(event.data.seed);return;}
  if(event.data?.type==='league:lock'){canEdit=event.data.canEdit===true;applyAccess();return;}
  if(event.data?.type!=='league:init')return;
  try{
   state=validateState(event.data.state);
   canEdit=event.data.canEdit===true;
   leagueTitle=String(event.data.title||'阿哇杯').slice(0,30);
   applyAccess();render();setSaveStatus('已加载平台发布的赛程');
  }catch(e){toast('赛程加载失败：'+e.message,6000);}
 });
 const dialogObserver=new MutationObserver(()=>window.parent.postMessage({type:'league:dialog',open:!!document.querySelector('dialog[open]')},window.location.origin));
 document.querySelectorAll('dialog').forEach(dialog=>dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']}));
 applyAccess();render();
 if(document.fonts?.ready)document.fonts.ready.then(()=>render());
})();
