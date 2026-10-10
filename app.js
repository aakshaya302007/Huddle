/* Huddle app logic. Data is stored in the browser (localStorage); there is no backend. */
(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mem={};
const store={
  get(k){try{const v=localStorage.getItem(k);if(v)return JSON.parse(v)}catch(e){}return mem[k]??null},
  set(k,v){mem[k]=v;try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
};
const KEY="quadrangle.v1";
const CATS=["Tech","Cultural","Sports","Workshop","Career","Clubs"];
const HUE={Tech:168,Cultural:335,Sports:24,Workshop:212,Career:268,Clubs:96};

/* ---- password hashing (SHA-256 with per-user salt via WebCrypto) ---- */
async function hashPw(pw,salt){
  try{
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+":"+pw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }catch(e){let h=2166136261;for(const c of salt+pw){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return "f"+(h>>>0).toString(16)}
}
const rid=(n=6)=>Array.from({length:n},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");

/* ---- seed data (dates are relative to first load) ---- */
function at(days,h,m=0){const d=new Date();d.setDate(d.getDate()+days);d.setHours(h,m,0,0);return d.toISOString()}
function seedEvents(){
  const E=(id,title,category,days,sh,eh,venue,organizer,capacity,taken,desc,agenda,status="open",sm=0,em=0)=>
   ({id,title,category,start:at(days,sh,sm),end:at(days,eh,em),venue,organizer,capacity,taken,desc,agenda,status});
  return [
   E("e1","HackSprint 24","Tech",3,9,21,"Tech Park Auditorium","Coding Club",120,96,"A twelve hour build sprint for teams of up to four. Pick a problem statement at the start, ship a working prototype by evening and demo to a panel of faculty and alumni.",[["09:00","Check in and team formation"],["10:00","Problem statements released"],["20:00","Demos and judging"]]),
   E("e2","Rangoli and Rhythms","Cultural",5,17,21,"Open Air Theatre","Fine Arts Society",400,212,"An evening of floor art, live percussion and dance performances from across departments. Bring friends, come hungry and stay for the finale.",[["17:00","Rangoli showcase opens"],["18:30","Percussion ensemble"],["20:00","Dance finale"]]),
   E("e3","Inter Department Football Finals","Sports",6,16,18,"Main Ground","Sports Council",300,140,"The two unbeaten departments meet for the trophy. Free entry for students, with food stalls along the east stand.",[["16:00","Teams warm up"],["16:30","Kick off"],["18:00","Trophy presentation"]],"open",0,30),
   E("e4","Resume Clinic with Alumni","Career",2,14,16,"Seminar Hall 2","Placement Cell",60,60,"Bring a printed resume and get ten minutes of direct feedback from alumni working in product, data and core engineering roles.",[["14:00","What recruiters scan first"],["14:30","One to one reviews"],["15:45","Open questions"]]),
   E("e5","Docker in One Afternoon","Workshop",8,14,17,"Lab 305","DevOps Guild",40,28,"Go from zero to running your own containers. Laptops required, with Docker Desktop installed beforehand.",[["14:00","Images and containers"],["15:15","Volumes and networking"],["16:15","Compose a small stack"]]),
   E("e6","Sunrise Photography Walk","Clubs",9,7,9,"Meet at the Main Gate","Lens Club",25,11,"A slow walk across campus during golden hour, with short tips on framing and light. Phone cameras are welcome.",[["07:00","Meet and brief"],["07:20","Guided walk"],["09:00","Photo swap and chai"]],"open",0,30),
   E("e7","Startup Pitch Night","Career",12,18,20,"Incubation Centre","E-Cell",150,87,"Five student teams pitch to a panel of founders and investors. Audience votes decide the crowd favourite.",[["18:00","Welcome and rules"],["18:20","Five pitches"],["19:45","Results"]],"open",0,30),
   E("e8","Open Mic Evening","Cultural",1,18,20,"Student Plaza","Music Club",80,41,"Songs, poems, stand up or anything in between. Sign up on the spot with a three minute slot.",[["18:00","Sign ups open"],["18:20","Performances"],["19:40","Final acts"]]),
   E("e9","Machine Learning Study Jam","Tech",15,15,18,"Lab 210","AI Club",50,19,"Work through a classification notebook in pairs, then compare models and share what broke along the way.",[["15:00","Setup and data tour"],["16:00","Pair build"],["17:15","Compare and discuss"]]),
   E("e10","Chess Rapid Tournament","Sports",20,10,16,"Indoor Games Hall","Chess Club",64,40,"Seven rounds of rapid chess, ten minutes per player. Boards and clocks are provided.",[["10:00","Registration desk"],["10:30","Rounds 1 to 4"],["14:00","Rounds 5 to 7"]]),
   E("e11","Figma for Beginners","Workshop",4,11,13,"Design Studio","UX Circle",35,33,"Learn frames, auto layout and components by redesigning a campus app screen together.",[["11:00","Interface tour"],["11:40","Auto layout"],["12:20","Share your frame"]]),
   E("e12","Tree Plantation Drive","Clubs",25,7,10,"North Campus Gate","NSS Unit",200,64,"Plant and tag saplings along the north boundary. Gloves, saplings and breakfast are provided.",[["07:30","Assemble and brief"],["08:00","Planting"],["09:15","Breakfast"]],"open",30,0),
   E("e13","Freshers Orientation Mixer","Cultural",-6,17,20,"Student Plaza","Student Council",500,480,"A welcome evening for the new batch with games, club stalls and live music.",[["17:00","Club stalls"],["18:00","Games"],["19:00","Live music"]]),
   E("e14","Rainy Day Cricket Cup","Sports",7,15,18,"Cricket Nets","Sports Council",44,22,"Postponed because of the forecast. A new date will be announced on the notice board.",[["15:00","Toss"],["15:15","Round robin"],["17:30","Final"]],"cancelled")
  ];
}
let DB=store.get(KEY);
const seedUser=async()=>{const salt=rid(8);return{id:"u1",name:"Test Student",email:"student@quadrangle.test",salt,hash:await hashPw("Student@123",salt)}};

/* ---- derived state ---- */
const now=()=>new Date();
const evStatus=e=>e.status==="cancelled"?"cancelled":(new Date(e.end)<now()?"completed":"open");
const activeRegs=id=>DB.regs.filter(r=>r.eventId===id&&r.status==="active").length;
const taken=e=>e.taken+activeRegs(e.id);
const left=e=>Math.max(0,e.capacity-taken(e));
const me=()=>DB.session?DB.users.find(u=>u.id===DB.session):null;
const myReg=(eid)=>{const u=me();return u?DB.regs.find(r=>r.userId===u.id&&r.eventId===eid&&r.status==="active"):null};
const save=()=>store.set(KEY,DB);
const fmtDate=(iso,o={weekday:"short",day:"numeric",month:"short"})=>new Intl.DateTimeFormat("en-IN",o).format(new Date(iso));
const fmtTime=iso=>new Intl.DateTimeFormat("en-IN",{hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(iso)).toUpperCase();
const range=e=>fmtTime(e.start)+" to "+fmtTime(e.end);
const daysUntil=iso=>Math.ceil((new Date(iso)-now())/864e5);

/* ---- generated banners (deterministic SVG, no external images) ---- */
function banner(e){
  const h=HUE[e.category]||160;let s=0;for(const c of e.id+e.title)s=(s*31+c.charCodeAt(0))>>>0;
  const r=n=>{s=(s*1664525+1013904223)>>>0;return s/4294967296*n};
  let sh="";
  for(let i=0;i<7;i++){const x=r(400),y=r(160),z=20+r(70),o=.10+r(.2);
    sh+=i%3===0?`<circle cx="${x|0}" cy="${y|0}" r="${z|0}" fill="#fff" opacity="${o.toFixed(2)}"/>`:
    i%3===1?`<rect x="${x|0}" y="${y|0}" width="${z|0}" height="${(z*.55)|0}" rx="8" fill="#fff" opacity="${o.toFixed(2)}" transform="rotate(${(r(40)-20)|0} ${x|0} ${y|0})"/>`:
    `<path d="M${x|0} ${y|0}q${z|0} -${z|0} ${(z*2)|0} 0" stroke="#fff" stroke-width="5" fill="none" opacity="${(o+.1).toFixed(2)}" stroke-linecap="round"/>`}
  const g="g"+e.id;
  return `<svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="${esc(e.category)} event banner"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 62% 28%)"/><stop offset="1" stop-color="hsl(${(h+34)%360} 70% 46%)"/></linearGradient></defs><rect width="400" height="160" fill="url(#${g})"/>${sh}</svg>`;
}
/* decorative pattern derived from the registration ID (not a scannable QR code) */
function pattern(id){
  let s=0;for(const c of id)s=(s*33+c.charCodeAt(0))>>>0;let o="";
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
    const corner=(x<3&&y<3)||(x>5&&y<3)||(x<3&&y>5);
    s=(s*1103515245+12345)>>>0;
    const lx=x%6,ly=y%6;
    const on=corner?(lx===0||lx===2||ly===0||ly===2||(lx===1&&ly===1)):((s>>16)%2===1);
    if(on) o+=`<rect x="${x*10+5}" y="${y*10+5}" width="9" height="9" rx="1.5"/>`}
  return `<svg viewBox="0 0 100 100" width="104" height="104" fill="currentColor" role="img" aria-label="Pass pattern for ${esc(id)}">${o}</svg>`;
}
const capBar=e=>{const t=taken(e),p=Math.min(100,Math.round(t/e.capacity*100));const c=p>=100?"full":p>=80?"hot":"";
  return `<div class="bar ${c}" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100" aria-label="Seats filled"><i style="width:${p}%"></i></div>`};
function statePill(e){
  const st=evStatus(e);
  if(st==="cancelled")return `<span class="pill bad">Cancelled</span>`;
  if(st==="completed")return `<span class="pill mute">Completed</span>`;
  const l=left(e);
  if(l===0)return `<span class="pill bad">Full</span>`;
  if(l<=10)return `<span class="pill warn">${l} seats left</span>`;
  return `<span class="pill ok">${l} seats left</span>`;
}
function toast(msg,kind="ok"){
  const t=document.createElement("div");t.className="toast "+kind;t.textContent=msg;$("#toasts").append(t);
  setTimeout(()=>t.remove(),4200);
}

/* ---- app state and routing ---- */
const S={view:"home",eventId:null,q:"",cat:"All",when:"any",avail:"any",page:1,mode:"list",month:new Date(),tab:"upcoming",authMode:"login",after:null,loading:false,editId:null};
const PER=6;
const app=$("#app");
function go(view,extra={}){
  Object.assign(S,{view},extra);
  render();window.scrollTo({top:0,behavior:"smooth"});
  try{if(["home","events","dashboard","login"].includes(view))history.replaceState(null,"","#"+view)}catch(e){}
}
function filtered(){
  const q=S.q.trim().toLowerCase();const n=now();
  const lim={week:7,month:30}[S.when];
  return DB.events.filter(e=>{
    if(S.cat!=="All"&&e.category!==S.cat)return false;
    if(q&&!(e.title+" "+e.venue+" "+e.organizer+" "+e.category).toLowerCase().includes(q))return false;
    if(lim){const d=(new Date(e.start)-n)/864e5;if(d<0||d>lim)return false}
    if(S.avail==="seats"&&(left(e)===0||evStatus(e)!=="open"))return false;
    return true;
  }).sort((a,b)=>new Date(a.start)-new Date(b.start));
}
const upcoming=()=>DB.events.filter(e=>evStatus(e)==="open").sort((a,b)=>new Date(a.start)-new Date(b.start));

/* ---- card ---- */
const card=e=>`<button class="card" data-act="open" data-id="${e.id}" aria-label="${esc(e.title)}, ${fmtDate(e.start)}">
  <div class="banner">${banner(e)}<div class="date-badge"><b>${fmtDate(e.start,{day:"numeric"})}</b><span>${fmtDate(e.start,{month:"short"})}</span></div><span class="cat">${esc(e.category)}</span></div>
  <div class="cb"><h3>${esc(e.title)}</h3>
    <div class="meta"><span>${fmtDate(e.start)} · ${range(e)}</span><span>${esc(e.venue)}</span></div>
    <div class="cap">${capBar(e)}<div class="cap-row"><span>${taken(e)} of ${e.capacity} registered</span>${statePill(e)}</div></div></div></button>`;

/* ---- views ---- */
function home(){
  const up=upcoming();
  const feat=up.filter(e=>left(e)>0).sort((a,b)=>taken(b)/b.capacity-taken(a)/a.capacity)[0]||up[0];
  const seats=DB.events.reduce((n,e)=>n+taken(e),0);
  return `<section class="hero"><div>
    <div class="eyebrow">Campus events · ${fmtDate(new Date().toISOString(),{month:"long",year:"numeric"})}</div>
    <h1 style="margin-top:12px">Find your next <em>reason</em> to be on campus.</h1>
    <p class="lead">Hackathons, open mics, workshops and finals in one place. Pick an event, grab a seat and keep every pass in your dashboard.</p>
    <div class="hero-cta"><button class="btn" data-go="events">Browse events</button><button class="btn ghost" data-go="dashboard">My registrations</button></div>
    <div class="stats"><div class="stat"><b class="mono">${up.length}</b><span>upcoming events</span></div><div class="stat"><b class="mono">${seats.toLocaleString("en-IN")}</b><span>seats taken so far</span></div><div class="stat"><b class="mono">${CATS.length}</b><span>categories</span></div></div>
  </div>
  ${feat?`<article class="ticket" data-act="open" data-id="${feat.id}" tabindex="0" role="button" aria-label="Featured: ${esc(feat.title)}">
    <div class="banner">${banner(feat)}</div>
    <div class="tb"><div class="eyebrow">Most in demand · ${esc(feat.category)}</div><h3>${esc(feat.title)}</h3>
    <div class="meta"><span>${fmtDate(feat.start,{weekday:"long",day:"numeric",month:"long"})} · ${range(feat)}</span><span>${esc(feat.venue)}</span></div>
    <div style="margin-top:12px">${capBar(feat)}<div class="cap-row"><span>${taken(feat)} of ${feat.capacity} registered</span>${statePill(feat)}</div></div></div></article>`:""}
  </section>
  <section class="sec"><div class="sec-h"><div><div class="eyebrow">Coming up</div><h2>Next on the calendar</h2></div><button class="btn ghost sm" data-go="events">See all events</button></div>
    <div class="grid">${up.slice(0,6).map(card).join("")}</div></section>
  <section class="sec"><div class="sec-h"><h2>Browse by category</h2></div>
    <div class="chips">${CATS.map(c=>`<button class="chip" data-act="cat" data-cat="${c}" aria-pressed="false">${c} · ${DB.events.filter(e=>e.category===c&&evStatus(e)==="open").length}</button>`).join("")}</div></section>`;
}
function events(){
  const list=filtered();const pages=Math.max(1,Math.ceil(list.length/PER));if(S.page>pages)S.page=pages;
  const view=list.slice((S.page-1)*PER,S.page*PER);
  return `<div class="sec-h" style="padding-top:30px"><div><div class="eyebrow">All events</div><h2>What's happening</h2></div>
    <div class="seg" role="group" aria-label="View mode"><button data-act="mode" data-m="list" aria-pressed="${S.mode==="list"}">List</button><button data-act="mode" data-m="cal" aria-pressed="${S.mode==="cal"}">Calendar</button></div></div>
  <form class="filters" id="filters" onsubmit="return false">
    <div class="field"><label for="f-q">Search</label><input class="inp" id="f-q" type="search" placeholder="Title, venue or organizer" value="${esc(S.q)}"></div>
    <div class="field"><label for="f-w">Date</label><select class="inp" id="f-w"><option value="any"${S.when==="any"?" selected":""}>Any date</option><option value="week"${S.when==="week"?" selected":""}>Next 7 days</option><option value="month"${S.when==="month"?" selected":""}>Next 30 days</option></select></div>
    <div class="field"><label for="f-a">Availability</label><select class="inp" id="f-a"><option value="any"${S.avail==="any"?" selected":""}>All events</option><option value="seats"${S.avail==="seats"?" selected":""}>Seats available</option></select></div>
    <div class="field"><label>&nbsp;</label><button type="button" class="btn ghost" data-act="clear">Clear</button></div></form>
  <div class="chips" role="group" aria-label="Category">${["All",...CATS].map(c=>`<button class="chip" data-act="cat" data-cat="${c}" aria-pressed="${S.cat===c}">${c}</button>`).join("")}</div>
  <div id="results" aria-live="polite">${S.loading?`<div class="grid">${"<div class='skel'></div>".repeat(6)}</div>`:
    S.mode==="cal"?calendar(list):
    list.length?`<p class="note" style="margin-bottom:14px">${list.length} event${list.length===1?"":"s"} found</p><div class="grid">${view.map(card).join("")}</div>${pages>1?`<nav class="pager" aria-label="Pages">${Array.from({length:pages},(_,i)=>`<button data-act="page" data-p="${i+1}" ${i+1===S.page?'aria-current="true"':""}>${i+1}</button>`).join("")}</nav>`:""}`:
    `<div class="empty"><h3>No events match</h3><p>Try a different date range or clear the filters.</p><p style="margin-top:14px"><button class="btn" data-act="clear">Clear filters</button></p></div>`}</div>`;
}
function calendar(list){
  const m=new Date(S.month.getFullYear(),S.month.getMonth(),1);const first=m.getDay();const days=new Date(m.getFullYear(),m.getMonth()+1,0).getDate();
  let cells="";for(let i=0;i<first;i++)cells+=`<div></div>`;
  const t=now();
  for(let d=1;d<=days;d++){
    const evs=list.filter(e=>{const x=new Date(e.start);return x.getFullYear()===m.getFullYear()&&x.getMonth()===m.getMonth()&&x.getDate()===d});
    const today=t.getFullYear()===m.getFullYear()&&t.getMonth()===m.getMonth()&&t.getDate()===d;
    cells+=`<div class="cal-d${today?" today":""}"><span>${d}</span>${evs.map(e=>`<button class="cal-e" data-act="open" data-id="${e.id}" title="${esc(e.title)}">${esc(e.title)}</button>`).join("")}</div>`;
  }
  return `<div class="cal"><div class="cal-h"><button class="btn ghost sm" data-act="month" data-d="-1" aria-label="Previous month">Prev</button><h3>${fmtDate(m.toISOString(),{month:"long",year:"numeric"})}</h3><button class="btn ghost sm" data-act="month" data-d="1" aria-label="Next month">Next</button></div>
  <div class="cal-g">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(w=>`<div class="cal-w">${w}</div>`).join("")}${cells}</div></div>`;
}
function detail(){
  const e=DB.events.find(x=>x.id===S.eventId);
  if(!e)return `<div class="empty" style="margin-top:40px"><h3>Event not found</h3><button class="btn" data-go="events">Back to events</button></div>`;
  const st=evStatus(e),reg=myReg(e.id),l=left(e),u=me();
  let btn,msg="";
  if(st==="cancelled"){btn=`<button class="btn" disabled>Event cancelled</button>`;msg="The organizer cancelled this event. Registrations are closed."}
  else if(st==="completed"){btn=`<button class="btn" disabled>Event completed</button>`;msg="This event has already taken place."}
  else if(reg){btn=`<button class="btn" disabled>You are registered</button><button class="btn danger" data-act="ask-cancel" data-id="${e.id}">Cancel registration</button>`;msg=`Your registration ID is <b class="mono">${reg.code}</b>. Find the pass in your dashboard.`}
  else if(l===0){btn=`<button class="btn" disabled>Event is full</button>`;msg="All seats are taken. Check back in case someone cancels."}
  else if(!u){btn=`<button class="btn" data-act="register" data-id="${e.id}">Log in to register</button>`;msg="You need a free account to reserve a seat."}
  else{btn=`<button class="btn" data-act="register" data-id="${e.id}">Register for this event</button>`;msg=`Signed in as ${esc(u.name)}. You can cancel any time before it starts.`}
  return `<button class="back" data-act="back">← All events</button>
  <div class="d-banner">${banner(e)}</div>
  <div class="d-grid"><div class="d-main">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill mute">${esc(e.category)}</span>${statePill(e)}</div>
    <h1>${esc(e.title)}</h1><p style="font-size:17px;color:var(--muted);max-width:62ch">${esc(e.desc)}</p>
    <div class="facts"><div class="fact"><span>Date</span><b>${fmtDate(e.start,{weekday:"long",day:"numeric",month:"long"})}</b></div><div class="fact"><span>Time</span><b>${range(e)}</b></div><div class="fact"><span>Venue</span><b>${esc(e.venue)}</b></div><div class="fact"><span>Organizer</span><b>${esc(e.organizer)}</b></div><div class="fact"><span>Capacity</span><b class="mono">${e.capacity} seats</b></div></div>
    <h2 style="font-size:24px;margin-top:26px">Schedule</h2>
    <ul class="agenda">${e.agenda.map(a=>`<li><span class="mono">${a[0]}</span><span>${esc(a[1])}</span></li>`).join("")}</ul></div>
  <aside class="panel" aria-label="Registration"><div><div class="eyebrow">Seats remaining</div><div class="big mono">${st==="open"?l:"0"}<span style="font-size:18px;color:var(--muted)"> / ${e.capacity}</span></div></div>
    ${capBar(e)}${btn}<p class="note" id="reg-msg" role="status">${msg}</p>${u&&e.ownerId===u.id?`<div style="border-top:1px solid var(--line);padding-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-act="people" data-id="${e.id}">Participants</button><button class="btn ghost sm" data-act="edit" data-id="${e.id}">Edit event</button>${st==="open"?`<button class="btn ghost sm" data-act="ask-cancel-event" data-id="${e.id}">Cancel event</button>`:""}<button class="btn danger sm" data-act="ask-delete" data-id="${e.id}">Delete event</button></div>`:""}</aside></div>`;
}
function dashboard(){
  const u=me();
  if(!u)return `<div class="empty" style="margin-top:40px"><h3>Log in to see your registrations</h3><p>Your passes and upcoming events live here.</p><p style="margin-top:14px"><button class="btn" data-act="need-login">Log in</button></p></div>`;
  const mine=DB.regs.filter(r=>r.userId===u.id).map(r=>({r,e:DB.events.find(x=>x.id===r.eventId)})).filter(x=>x.e);
  const isUp=x=>x.r.status==="active"&&evStatus(x.e)==="open";
  const up=mine.filter(isUp).sort((a,b)=>new Date(a.e.start)-new Date(b.e.start));
  const past=mine.filter(x=>x.r.status==="active"&&!isUp(x));
  const canc=mine.filter(x=>x.r.status==="cancelled");
  const hosting=DB.events.filter(e=>e.ownerId===u.id).sort((a,b)=>new Date(b.start)-new Date(a.start));
  const sets={upcoming:up,past,cancelled:canc,hosting};const cur=sets[S.tab]||up;
  const hostRow=e=>`<div class="reg"><div class="banner">${banner(e)}</div><div style="min-width:0"><h3>${esc(e.title)}</h3>
    <div class="meta"><span>${fmtDate(e.start,{weekday:"short",day:"numeric",month:"short"})} · ${range(e)}</span><span>${esc(e.venue)}</span></div>
    <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${statePill(e)}<span class="mono" style="font-size:13px">${taken(e)}/${e.capacity} registered</span></div></div>
    <div class="acts"><button class="btn sm" data-act="people" data-id="${e.id}">Participants</button><button class="btn ghost sm" data-act="edit" data-id="${e.id}">Edit</button>${evStatus(e)==="open"?`<button class="btn ghost sm" data-act="ask-cancel-event" data-id="${e.id}">Cancel event</button>`:""}<button class="btn danger sm" data-act="ask-delete" data-id="${e.id}">Delete</button></div></div>`;
  const nx=up[0];
  const row=({r,e})=>`<div class="reg"><div class="banner">${banner(e)}</div><div style="min-width:0"><h3>${esc(e.title)}</h3>
    <div class="meta"><span>${fmtDate(e.start,{weekday:"short",day:"numeric",month:"short"})} · ${range(e)}</span><span>${esc(e.venue)}</span></div>
    <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="mono" style="font-size:13px">${r.code}</span>${r.status==="cancelled"?`<span class="pill bad">Cancelled</span>`:evStatus(e)==="cancelled"?`<span class="pill bad">Event cancelled</span>`:evStatus(e)==="completed"?`<span class="pill mute">Attended window over</span>`:`<span class="pill ok">Confirmed</span>`}</div></div>
    <div class="acts">${r.status==="active"?`<button class="btn sm" data-act="pass" data-id="${r.id}">View pass</button>`:""}<button class="btn ghost sm" data-act="open" data-id="${e.id}">Details</button>${isUp({r,e})?`<button class="btn danger sm" data-act="ask-cancel" data-id="${e.id}">Cancel</button>`:""}</div></div>`;
  return `<div class="sec-h" style="padding-top:30px"><div><div class="eyebrow">Dashboard</div><h2>Hi ${esc(u.name.split(" ")[0])}, here are your events</h2></div></div>
  <div class="dash-top"><div class="kpi"><b class="mono">${up.length}</b><span>upcoming</span></div><div class="kpi"><b class="mono">${past.length}</b><span>past</span></div><div class="kpi"><b class="mono">${nx?Math.max(0,daysUntil(nx.e.start)):"None"}</b><span>${nx?"days to your next event":"no event booked"}</span></div></div>
  <div class="tabs" role="tablist">${[["upcoming","Registered",up.length],["past","Past",past.length],["cancelled","Cancelled",canc.length],["hosting","Hosting",hosting.length]].map(t=>`<button class="chip" role="tab" data-act="tab" data-t="${t[0]}" aria-pressed="${S.tab===t[0]}">${t[1]} · ${t[2]}</button>`).join("")}</div>
  ${cur.length?cur.map(S.tab==="hosting"?hostRow:row).join(""):`<div class="empty"><h3>Nothing here yet</h3><p>${S.tab==="upcoming"?"Register for an event and it will show up here.":S.tab==="hosting"?"Events you create appear here, with participants and controls.":"No events in this list."}</p>${S.tab==="upcoming"?`<p style="margin-top:14px"><button class="btn" data-go="events">Find an event</button></p>`:S.tab==="hosting"?`<p style="margin-top:14px"><button class="btn" data-act="host">Host an event</button></p>`:""}</div>`}`;
}
function formView(){
  const u=me();
  if(!u)return `<div class="empty" style="margin-top:40px"><h3>Log in to host an event</h3><p style="margin-top:14px"><button class="btn" data-act="need-login">Log in</button></p></div>`;
  const ex=S.editId?DB.events.find(x=>x.id===S.editId&&x.ownerId===u.id):null;
  if(S.editId&&!ex)return `<div class="empty" style="margin-top:40px"><h3>You can only edit events you created</h3><p style="margin-top:14px"><button class="btn" data-go="dashboard">Back to dashboard</button></p></div>`;
  const pad=n=>String(n).padStart(2,"0");
  const dv=iso=>{const d=new Date(iso);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
  const tv=iso=>{const d=new Date(iso);return pad(d.getHours())+":"+pad(d.getMinutes())};
  const v=ex||{title:"",category:"Tech",start:at(7,10),end:at(7,12),venue:"",organizer:u.name,capacity:50,desc:"",agenda:[]};
  return `<form class="auth" id="eventform" style="max-width:720px" novalidate>
    <div><div class="eyebrow">${ex?"Edit event":"New event"}</div><h2>${ex?"Update your event":"Host an event"}</h2></div>
    <div class="errbox" id="ef-err" role="alert"></div>
    <div class="field"><label for="ef-title">Event name</label><input class="inp" id="ef-title" maxlength="80" value="${esc(v.title)}" placeholder="Intro to Git and GitHub"></div>
    <div class="filters" style="grid-template-columns:1fr 1fr 1fr;margin:0">
      <div class="field"><label for="ef-cat">Category</label><select class="inp" id="ef-cat">${CATS.map(c=>`<option${c===v.category?" selected":""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="ef-cap">Capacity</label><input class="inp" id="ef-cap" type="number" min="1" max="5000" value="${v.capacity}"></div>
      <div class="field"><label for="ef-date">Date</label><input class="inp" id="ef-date" type="date" min="${dv(now().toISOString())}" value="${dv(v.start)}"></div>
      <div class="field"><label for="ef-start">Starts</label><input class="inp" id="ef-start" type="time" value="${tv(v.start)}"></div>
      <div class="field"><label for="ef-end">Ends</label><input class="inp" id="ef-end" type="time" value="${tv(v.end)}"></div>
      <div class="field"><label for="ef-org">Organizer</label><input class="inp" id="ef-org" maxlength="60" value="${esc(v.organizer)}"></div></div>
    <div class="field"><label for="ef-venue">Venue</label><input class="inp" id="ef-venue" maxlength="80" value="${esc(v.venue)}" placeholder="Seminar Hall 1"></div>
    <div class="field"><label for="ef-desc">Description</label><textarea class="inp" id="ef-desc" rows="4" maxlength="600" placeholder="What will happen, who it is for, what to bring.">${esc(v.desc)}</textarea></div>
    <div class="field"><label for="ef-agenda">Schedule (optional, one line each)</label><textarea class="inp" id="ef-agenda" rows="3" placeholder="10:00 Welcome&#10;10:30 Hands on session">${esc(v.agenda.map(a=>a[0]+" "+a[1]).join("\n"))}</textarea></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="submit">${ex?"Save changes":"Publish event"}</button><button class="btn ghost" type="button" data-act="back-dash">Cancel</button></div></form>`;
}
function authView(){
  const reg=S.authMode==="register";
  return `<form class="auth" id="authform" novalidate><h2>${reg?"Create account":"Welcome back"}</h2>
    <p class="note">${reg?"Takes ten seconds. Use any email you like.":"Log in to register for events and manage your passes."}</p>
    ${reg?`<div class="field"><label for="a-n">Full name</label><input class="inp" id="a-n" autocomplete="name"></div>`:""}
    <div class="field"><label for="a-e">Email</label><input class="inp" id="a-e" type="email" autocomplete="email" value="${reg?"":"student@quadrangle.test"}"></div>
    <div class="field"><label for="a-p">Password</label><input class="inp" id="a-p" type="password" autocomplete="${reg?"new-password":"current-password"}" ${reg?'placeholder="8+ characters with a number"':'value="Student@123"'}></div>
    <div class="err" id="a-err" role="alert"></div>
    <button class="btn" type="submit">${reg?"Create account":"Log in"}</button>
    <button class="lnk" type="button" data-act="switch">${reg?"Have an account? Log in":"New here? Create an account"}</button>
    ${reg?"":`<div class="demo"><b>Test login</b> (prefilled)<br><code>student@quadrangle.test</code><br><code>Student@123</code></div>`}</form>`;
}
function render(){
  const v={home,events,event:detail,dashboard,login:authView,form:formView}[S.view]||home;
  app.innerHTML=v();app.classList.remove("view");void app.offsetWidth;app.classList.add("view");
  document.querySelectorAll(".lnk[data-go]").forEach(b=>{const on=b.dataset.go===S.view||(S.view==="event"&&b.dataset.go==="events");on?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current")});
  const u=me();
  $("#authslot").innerHTML=u?`<button class="btn ghost sm" data-act="logout" title="${esc(u.email)}">Log out</button>`:`<button class="btn sm" data-act="need-login">Log in</button>`;
}

/* ---- actions ---- */
const origGo=go;
function nav(view,extra){
  if(view==="events"&&S.view!=="events"){S.loading=true;origGo(view,extra);setTimeout(()=>{S.loading=false;if(S.view==="events")render()},350)}
  else origGo(view,extra);
}
function modal(html){const m=$("#modal");m.innerHTML=`<div class="modal-bg" data-act="close"><div class="modal" role="dialog" aria-modal="true" data-stop="1">${html}</div></div>`;const b=m.querySelector("button");if(b)b.focus()}
const closeModal=()=>{$("#modal").innerHTML=""};

function doRegister(id){
  const e=DB.events.find(x=>x.id===id),u=me();
  if(!e)return toast("That event no longer exists.","bad");
  if(!u){S.after={id};return nav("login")}
  const st=evStatus(e);
  if(st==="cancelled")return toast("Registration is closed because this event was cancelled.","bad");
  if(st==="completed")return toast("This event has already finished.","bad");
  if(myReg(id))return toast("You are already registered for this event.","warn");
  if(left(e)<=0)return toast("Sorry, this event is full.","bad");
  const code="QG-"+rid(6);
  DB.regs.push({id:"r"+Date.now().toString(36)+rid(3),userId:u.id,eventId:id,code,status:"active",at:new Date().toISOString()});
  save();render();toast("You are in! Registration ID "+code,"ok");
}
function askCancel(id){
  const e=DB.events.find(x=>x.id===id);if(!e)return;
  modal(`<h3 style="font-size:24px">Cancel registration?</h3><p class="note">${esc(e.title)} on ${fmtDate(e.start)}. Your seat goes back to the pool and anyone can take it.</p><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost" data-act="close">Keep my seat</button><button class="btn danger" data-act="do-cancel" data-id="${id}">Cancel registration</button></div>`);
}
function doCancel(id){
  const r=myReg(id),e=DB.events.find(x=>x.id===id);
  closeModal();
  if(!r||!e)return toast("No active registration found.","bad");
  if(new Date(e.start)<=now())return toast("This event has started, so it can no longer be cancelled.","bad");
  r.status="cancelled";r.cancelledAt=new Date().toISOString();save();render();toast("Registration cancelled.","warn");
}
function showPass(rid_){
  const r=DB.regs.find(x=>x.id===rid_),e=r&&DB.events.find(x=>x.id===r.eventId),u=me();if(!r||!e)return;
  modal(`<div class="pass"><div class="pass-l"><div class="eyebrow">Check in pass · ${esc(e.category)}</div><h3>${esc(e.title)}</h3><div class="meta"><span>${fmtDate(e.start,{weekday:"long",day:"numeric",month:"long"})}</span><span>${range(e)}</span><span>${esc(e.venue)}</span><span>${esc(u.name)}</span></div></div>
  <div class="pass-r">${pattern(r.code)}<b class="mono">${r.code}</b></div></div><p class="note">Show this ID at the entrance. The pattern is a visual of your ID, not a scannable code.</p><div style="text-align:right"><button class="btn" data-act="close">Done</button></div>`);
}
function saveEvent(){
  const u=me(),g=id=>$("#"+id).value.trim(),err=$("#ef-err");
  document.querySelectorAll("#eventform [aria-invalid]").forEach(n=>n.removeAttribute("aria-invalid"));err.textContent="";
  const fail=(m,field)=>{err.textContent=m;err.scrollIntoView({block:"center",behavior:"smooth"});toast(m,"bad");const f=field&&$("#"+field);if(f){f.setAttribute("aria-invalid","true");f.focus()}};
  if(!u)return nav("login");
  const ex=S.editId?DB.events.find(x=>x.id===S.editId&&x.ownerId===u.id):null;
  if(S.editId&&!ex)return fail("You can only edit events you created.");
  const title=g("ef-title"),cat=g("ef-cat"),date=g("ef-date"),st=g("ef-start"),en=g("ef-end"),venue=g("ef-venue"),org=g("ef-org"),desc=g("ef-desc"),cap=Number(g("ef-cap"));
  if(title.length<3)return fail("Give the event a name of at least 3 characters.","ef-title");
  if(!date||!st||!en)return fail("Choose a date, start time and end time.","ef-date");
  const start=new Date(date+"T"+st),end=new Date(date+"T"+en);
  if(isNaN(start)||isNaN(end))return fail("That date or time is not valid.","ef-date");
  if(end<=start)return fail("The end time must be after the start time.","ef-end");
  if(!ex&&start<=now())return fail("Pick a start time in the future.","ef-start");
  if(!venue)return fail("Add a venue.","ef-venue");
  if(!org)return fail("Add the organizer or club name.","ef-org");
  if(!Number.isInteger(cap)||cap<1||cap>5000)return fail("Capacity must be a whole number from 1 to 5000.","ef-cap");
  if(ex&&cap<taken(ex))return fail("Capacity cannot be lower than the "+taken(ex)+" seats already taken.","ef-cap");
  if(desc.length<20)return fail("Describe the event in at least 20 characters.","ef-desc");
  const agenda=[];
  for(const line of $("#ef-agenda").value.split("\n").map(l=>l.trim()).filter(Boolean)){
    const m=line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
    if(!m)return fail("Schedule lines look like: 10:30 Hands on session","ef-agenda");
    agenda.push([m[1],m[2]]);
  }
  if(!agenda.length)agenda.push([st,"Event starts"]);
  const data={title,category:cat,start:start.toISOString(),end:end.toISOString(),venue,organizer:org,capacity:cap,desc,agenda};
  let id;
  if(ex){Object.assign(ex,data);id=ex.id}
  else{id="e"+Date.now().toString(36);DB.events.push({id,ownerId:u.id,taken:0,status:"open",...data})}
  save();S.editId=null;origGo("event",{eventId:id});
  toast(ex?"Event updated.":"Event published. Students can register now.","ok");
}
function ownEvent(id){const u=me();return u?DB.events.find(x=>x.id===id&&x.ownerId===u.id):null}
function showPeople(id){
  const e=ownEvent(id);if(!e)return toast("Only the organizer can see participants.","bad");
  const rows=DB.regs.filter(r=>r.eventId===id&&r.status==="active").map(r=>({r,u:DB.users.find(x=>x.id===r.userId)})).filter(x=>x.u);
  modal(`<h3 style="font-size:24px">Participants</h3><p class="note">${esc(e.title)} · ${taken(e)} of ${e.capacity} seats taken</p>
  <div style="max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:2px">${rows.length?rows.map(({r,u})=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:wrap"><span style="min-width:0;overflow-wrap:anywhere"><b>${esc(u.name)}</b><br><span class="note">${esc(u.email)}</span></span><span class="mono" style="font-size:13px">${r.code}</span></div>`).join(""):`<p class="note" style="padding:14px 0">No one has registered through this site yet.</p>`}</div>
  ${e.taken>0?`<p class="note">Plus ${e.taken} sample registrations that came with the demo data and have no names.</p>`:""}
  <div style="text-align:right"><button class="btn" data-act="close">Close</button></div>`);
}
function askCancelEvent(id){
  const e=ownEvent(id);if(!e)return;
  modal(`<h3 style="font-size:24px">Cancel this event?</h3><p class="note">${esc(e.title)} will be marked cancelled and registrations close. Registered students will see it as cancelled in their dashboard.</p><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost" data-act="close">Keep it open</button><button class="btn danger" data-act="do-cancel-event" data-id="${id}">Cancel event</button></div>`);
}
function doCancelEvent(id){const e=ownEvent(id);closeModal();if(!e)return toast("Only the organizer can cancel this event.","bad");e.status="cancelled";save();render();toast("Event cancelled.","warn")}
function askDelete(id){
  const e=ownEvent(id);if(!e)return;
  modal(`<h3 style="font-size:24px">Delete this event?</h3><p class="note">${esc(e.title)} and all of its registrations will be removed for good. To keep a record, cancel it instead.</p><div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button class="btn ghost" data-act="close">Keep event</button><button class="btn danger" data-act="do-delete" data-id="${id}">Delete event</button></div>`);
}
function doDelete(id){
  const e=ownEvent(id);closeModal();if(!e)return toast("Only the organizer can delete this event.","bad");
  DB.events=DB.events.filter(x=>x.id!==id);DB.regs=DB.regs.filter(r=>r.eventId!==id);save();toast("Event deleted.","warn");
  if(S.view==="event")nav("events");else render();
}
async function submitAuth(){
  const reg=S.authMode==="register",err=$("#a-err");
  const email=$("#a-e").value.trim().toLowerCase(),pw=$("#a-p").value,name=reg?$("#a-n").value.trim():"";
  const fail=m=>{err.textContent=m};
  if(reg&&name.length<2)return fail("Enter your full name.");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return fail("Enter a valid email address.");
  let u;
  if(reg){
    if(pw.length<8||!/\d/.test(pw))return fail("Use at least 8 characters including a number.");
    if(DB.users.some(x=>x.email===email))return fail("An account with this email already exists. Try logging in.");
    const salt=rid(8);u={id:"u"+Date.now().toString(36),name,email,salt,hash:await hashPw(pw,salt)};DB.users.push(u);
  }else{
    u=DB.users.find(x=>x.email===email);
    if(!u||u.hash!==await hashPw(pw,u.salt))return fail("Incorrect email or password.");
  }
  DB.session=u.id;save();
  toast(reg?"Account created. Welcome, "+u.name.split(" ")[0]+"!":"Welcome back, "+u.name.split(" ")[0]+".","ok");
  const after=S.after;S.after=null;
  if(after&&after.host){S.editId=null;origGo("form")}else if(after){origGo("event",{eventId:after.id});doRegister(after.id)}else nav("home");
}

document.addEventListener("click",ev=>{
  const g=ev.target.closest("[data-go]");
  if(g){nav(g.dataset.go);return}
  const el=ev.target.closest("[data-act]");if(!el)return;
  if(ev.target.closest("[data-stop]")&&el.dataset.act==="close"&&!ev.target.closest("button[data-act]"))return;
  const a=el.dataset.act,d=el.dataset;
  switch(a){
    case"open":origGo("event",{eventId:d.id});break;
    case"back":nav("events");break;
    case"cat":S.cat=d.cat;S.page=1;S.view==="events"?render():nav("events");break;
    case"mode":S.mode=d.m;render();break;
    case"month":S.month=new Date(S.month.getFullYear(),S.month.getMonth()+Number(d.d),1);render();break;
    case"page":S.page=Number(d.p);render();$("#results").scrollIntoView({behavior:"smooth",block:"start"});break;
    case"clear":Object.assign(S,{q:"",cat:"All",when:"any",avail:"any",page:1});render();break;
    case"tab":S.tab=d.t;render();break;
    case"register":doRegister(d.id);break;
    case"ask-cancel":askCancel(d.id);break;
    case"do-cancel":doCancel(d.id);break;
    case"pass":showPass(d.id);break;
    case"close":closeModal();break;
    case"need-login":S.authMode="login";nav("login");break;
    case"switch":S.authMode=S.authMode==="login"?"register":"login";render();break;
    case"host":if(!me()){S.after={host:true};S.authMode="login";nav("login")}else{S.editId=null;nav("form")}break;
    case"edit":S.editId=d.id;nav("form");break;
    case"back-dash":S.editId=null;nav("dashboard");break;
    case"people":showPeople(d.id);break;
    case"ask-cancel-event":askCancelEvent(d.id);break;
    case"do-cancel-event":doCancelEvent(d.id);break;
    case"ask-delete":askDelete(d.id);break;
    case"do-delete":doDelete(d.id);break;
    case"logout":DB.session=null;save();toast("Logged out.","ok");render();break;
  }
});
document.addEventListener("submit",ev=>{if(ev.target.id==="authform"){ev.preventDefault();submitAuth()}if(ev.target.id==="eventform"){ev.preventDefault();try{saveEvent()}catch(e){toast("Could not save the event: "+e.message,"bad")}}});
document.addEventListener("input",ev=>{
  if(ev.target.id!=="f-q")return;
  S.q=ev.target.value;S.page=1;const pos=ev.target.selectionStart;render();
  const n=$("#f-q");if(n){n.focus();n.setSelectionRange(pos,pos)}
});
document.addEventListener("change",ev=>{
  if(ev.target.id==="f-w"){S.when=ev.target.value;S.page=1;render()}
  if(ev.target.id==="f-a"){S.avail=ev.target.value;S.page=1;render()}
});
document.addEventListener("keydown",ev=>{
  if(ev.key==="Escape")closeModal();
  if(ev.key==="Enter"&&ev.target.matches(".ticket")){ev.target.click()}
});
$("#theme").addEventListener("click",()=>{
  const r=document.documentElement;
  const dark=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme=dark?"light":"dark";
});

/* ---- boot ---- */
(async function boot(){
  if(!DB||!DB.events||!DB.users){DB={users:[await seedUser()],events:seedEvents(),regs:[],session:null};save()}
  /* the test account acts as organizer of the sample events so they can be edited or removed */
  if(DB.users.some(u=>u.id==="u1")&&DB.events.some(e=>!e.ownerId)){DB.events.forEach(e=>{if(!e.ownerId)e.ownerId="u1"});save()}
  const h=(location.hash||"").slice(1);
  if(["events","dashboard","login"].includes(h))S.view=h;
  render();
})();
})();
