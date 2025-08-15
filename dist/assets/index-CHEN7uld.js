const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-B2S5ARDU.js","assets/index-BTgnNZ61.css"])))=>i.map(i=>d[i]);
import{L as T,_,I as C,A as F,F as $,g as M,a as N,b as k}from"./index-B2S5ARDU.js";const B={beach:[{id:"beach-fishing",name:"Passive coastal fishing",system:"fishing",actionLabel:"Fish",toolRequired:{name:"Fishing Pole"},themeClass:"theme-beach",icon:"icon-fish-spot"},{id:"beach-mining-1",name:"Level 1 Mining Area",system:"mining",actionLabel:"Mine",toolRequired:{name:"Pickaxe"},themeClass:"theme-mining",icon:"icon-location",disabled:!0}]},Z={currentFishingJobId:null,getFishIconId(e){return{Minnow:"fish-minnow",Trout:"fish-trout",Bass:"fish-bass",Salmon:"fish-salmon","Golden Carp":"fish-carp"}[e]||"fish-minnow"},renderFor(){},renderAllInPanel(){const e=document.getElementById("zones-list");if(!e)return;e.innerHTML="",(B.beach||[]).forEach(n=>{e.appendChild(this.createZoneCard(n))})},createZoneCard(e){const t=document.createElement("div"),n=e.themeClass||"",o=!!e.disabled;t.className=`zone-card ${n}${o?" locked":""}`.trim(),t.innerHTML=`
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#${e.icon||"icon-location"}"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">${e.name}</div>
        <div class="zone-req">${e.toolRequired?`Requires: <strong>${e.toolRequired.name}</strong>`:""}</div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" ${o?"disabled":""} aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>${e.actionLabel||"Start"}</button>
          <div class="zone-status" aria-live="polite">${o?"N/A":"Idle"}</div>
          ${e.toolRequired?'<div class="tool-indicator">Tool</div>':""}
        </div>
      </div>
      ${e.system==="fishing"?'<div class="zone-popover" role="dialog" aria-hidden="true"></div>':""}
    `;const c=t.querySelector(".zone-action");if(c&&!o&&c.addEventListener("click",()=>{e.system==="fishing"&&this.toggleFishing(t)}),e.toolRequired){const a=t.querySelector(".tool-indicator"),h=this.hasItem(e.toolRequired.name);a&&(a.textContent=h?"✓":"✗",a.classList.toggle("missing",!h),a.classList.toggle("ok",!!h))}return e.system==="fishing"&&this.attachFishingPopover(t),t},attachFishingPopover(e){const t=e.querySelector(".zone-action"),n=e.querySelector(".zone-popover"),o=()=>{if(!n)return;const a=($.fishTypes||[]).slice(),h=JSON.parse(localStorage.getItem("fish_discovered")||"[]"),r=a.filter(u=>h.includes(u.name)),m=r.map(u=>{const z=this.getFishIconId(u.name),p=`Lvl ${u.minLevel||1}`;return`
          <div class="catch-row">
            <div class="catch-icon"${u.color?` style="color:${u.color}"`:""}><svg><use href="#${z}"/></svg></div>
            <div class="catch-name">${u.name}</div>
            <div class="catch-req">${p}</div>
          </div>
        `}).join(""),l=r.length>0?`<div class="pop-title">Discovered Fish</div>${m}`:'<div class="pop-title">Discovered Fish</div><div class="catch-row"><div class="catch-name">No fish discovered yet</div></div>';n.innerHTML=l},c=a=>{n&&(e.classList.toggle("open",!!a),n.setAttribute("aria-hidden",a?"false":"true"),a&&o())};t&&(t.addEventListener("mouseenter",()=>c(!0)),t.addEventListener("mouseleave",()=>c(!1)))},createComingSoonCard(e){const t=document.createElement("div"),n=["theme-mining","theme-forest","theme-beach","theme-forest"];return t.className=`zone-card locked ${n[e%n.length]}`,t.innerHTML=`
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-location"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Coming soon</div>
        <div class="zone-req">New idle activity</div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" disabled>Locked</button>
          <div class="zone-status" aria-live="polite">N/A</div>
        </div>
      </div>
    `,t},createMiningZoneCard(){const e=document.createElement("div");return e.className="zone-card theme-mining",e.innerHTML=`
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-location"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Level 1 Mining Area</div>
        <div class="zone-req">Requires: <strong>Pickaxe</strong></div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>Mine</button>
          <div class="zone-status" aria-live="polite">Idle</div>
          <div class="tool-indicator">✗</div>
        </div>
      </div>
    `,e},hasItem(e){var t;try{return Array.isArray((t=M)==null?void 0:t.inventory)&&M.inventory.some(n=>n&&n.name===e&&(n.count==null||n.count>0))}catch{return!1}},isFishingActive(){return C.hasActiveOfKind("fishing")},toggleFishing(e){var h,r,m;if(this.isFishingActive()){C.cancelAllOfKind("fishing"),this.currentFishingJobId=null,this.updateZoneState(e,!1),F.playClick();return}if(!this.hasItem("Fishing Pole")){try{e.classList.add("require-missing"),setTimeout(()=>e.classList.remove("require-missing"),500)}catch{}(r=(h=F).playCancel)==null||r.call(h);return}const n=$.fishTypes||[],o=((m=M.fishing)==null?void 0:m.level)||1,c=n.filter(l=>(l.minLevel||1)<=o);if(c.length===0&&o>=1){const l=n.find(u=>u.name==="Minnow");l&&c.push(l)}const a=new N({remaining:1e9,fishTypes:c,playerLevel:o});a.on("catch",l=>{try{k.addItem(l.name)}catch{}try{$.gainXP(l.xp||1)}catch{}try{F.playPickupFor({name:l.name,category:"item",subtype:"fish"})}catch{}try{const u=this.getFishIconId(l.name);this.animateCatchToInventory(e,u),this.spawnFloatAtZone(e,`Caught ${l.name} (+${l.xp||1} XP)`)}catch{}}),C.addJob(a),this.currentFishingJobId=a.id,this.updateZoneState(e,!0),F.playClick()},animateCatchToInventory(e,t){try{const n=e.querySelector(".zone-icon svg")||e.querySelector(".zone-action"),o=document.getElementById("toggleInventory"),c=document.getElementById("inv-grid");if(!n||!o&&!c)return;const a=n.getBoundingClientRect(),h=(o||c).getBoundingClientRect(),r=document.createElementNS("http://www.w3.org/2000/svg","svg"),m=document.createElementNS("http://www.w3.org/2000/svg","use");m.setAttribute("href",`#${t}`),r.appendChild(m),r.classList.add("fly-item"),r.style.left=`${a.left}px`,r.style.top=`${a.top}px`,document.body.appendChild(r),requestAnimationFrame(()=>{const l=h.left-a.left+(h.width/2-14),u=h.top-a.top+(h.height/2-14);r.style.transform=`translate(${l}px, ${u}px) scale(0.6)`,r.style.opacity="0"}),setTimeout(()=>r.remove(),600)}catch{}},spawnFloatAtZone(e,t){try{const o=(e.querySelector(".zone-action")||e).getBoundingClientRect(),c=document.createElement("div");c.className="xp-float",c.textContent=t,c.style.left=`${o.left+o.width/2-40}px`,c.style.top=`${o.top-6}px`,document.body.appendChild(c),setTimeout(()=>c.remove(),1e3)}catch{}},updateZoneState(e,t){if(!e)return;e.classList.toggle("active",!!t);const n=e.querySelector(".zone-action"),o=e.querySelector(".zone-status");n&&n.setAttribute("aria-pressed",String(!!t)),o&&(o.textContent=t?"Fishing...":"Idle")},renderBeachFishing(e){const t=document.createElement("div");t.className="zone-card fishing-zone theme-beach",t.innerHTML=`
      <div class="zone-icon" aria-hidden="true">
        <svg><use href="#icon-fish-spot"/></svg>
      </div>
      <div class="zone-body">
        <div class="zone-desc">Passive coastal fishing</div>
        <div class="zone-req">Requires: <strong>Fishing Pole</strong></div>
        <div class="zone-controls">
          <button class="primary-btn zone-action" type="button" aria-pressed="false"><span class="loc-status-dot" aria-hidden="true"></span>Fish</button>
          <div class="zone-status" aria-live="polite">Idle</div>
        </div>
      </div>
      <div class="zone-popover" role="dialog" aria-hidden="true"></div>
    `;const n=t.querySelector(".zone-action");n==null||n.addEventListener("click",()=>this.toggleFishing(t));const o=t.querySelector(".zone-popover"),c=()=>{var y,S;if(!o)return;const s=($.fishTypes||[]).slice();(S=(y=window==null?void 0:window.gameState)==null?void 0:y.fishing)!=null&&S.level;const i=JSON.parse(localStorage.getItem("fish_discovered")||"[]"),d=s.filter(f=>i.includes(f.name)),v=d.map(f=>{const I=this.getFishIconId(f.name),E=`Lvl ${f.minLevel||1}`;return`
          <div class="catch-row">
            <div class="catch-icon"${f.color?` style="color:${f.color}"`:""}><svg><use href="#${I}"/></svg></div>
            <div class="catch-name">${f.name}</div>
            <div class="catch-req">${E}</div>
          </div>
        `}).join(""),g=d.length>0?`<div class="pop-title">Discovered Fish</div>${v}`:'<div class="pop-title">Discovered Fish</div><div class="catch-row"><div class="catch-name">No fish discovered yet</div></div>';o.innerHTML=g},a=s=>{o&&(t.classList.toggle("open",!!s),o.setAttribute("aria-hidden",s?"false":"true"),s&&c())};n&&(n.addEventListener("mouseenter",()=>a(!0)),n.addEventListener("mouseleave",()=>a(!1))),this.updateZoneState(t,this.isFishingActive()),this.hasItem("Fishing Pole")||t.classList.add("missing"),e.appendChild(t);const h=e.getBoundingClientRect();let r=!1,m=0,l=0,u=16,z=16,p=null,b=null;const x=(s,i)=>{t.style.left=`${Math.round(s)}px`,t.style.top=`${Math.round(i)}px`},L=s=>Math.max(0,Math.min(1,s)),w=()=>{const s=e.getBoundingClientRect(),i=Math.max(8,s.width-t.offsetWidth-8),d=Math.max(8,s.height-t.offsetHeight-8),v=(p??0)*i+8,g=(b??0)*d+8;x(v,g)};try{const s=`zone_pos_${T.current.key}_fishing`,i=JSON.parse(localStorage.getItem(s)||"null");if(i&&typeof i.xpct=="number"&&typeof i.ypct=="number")p=L(i.xpct),b=L(i.ypct),w();else if(i&&typeof i.x=="number"&&typeof i.y=="number"){const d=Math.max(1,h.width-t.offsetWidth-8),v=Math.max(1,h.height-t.offsetHeight-8);p=L((i.x-8)/d),b=L((i.y-8)/v),w();try{localStorage.setItem(s,JSON.stringify({xpct:p,ypct:b}));try{_(async()=>{const{SaveManager:g}=await import("./index-B2S5ARDU.js").then(y=>y.S);return{SaveManager:g}},__vite__mapDeps([0,1])).then(({SaveManager:g})=>{g.debouncedSave()})}catch{}}catch{}}else x(u,z)}catch{x(u,z)}const q=s=>{var v,g;const i=s.touches?s.touches[0]:s,d=t.getBoundingClientRect();r=!0,m=i.clientX-d.left,l=i.clientY-d.top,t.classList.add("dragging"),(v=s.preventDefault)==null||v.call(s),(g=s.stopPropagation)==null||g.call(s)},P=s=>{var f,I;if(!r)return;const i=s.touches?s.touches[0]:s,d=e.getBoundingClientRect();let v=i.clientX-d.left-m,g=i.clientY-d.top-l;const y=d.width-t.offsetWidth-8,S=d.height-t.offsetHeight-8;v=Math.max(8,Math.min(y,v)),g=Math.max(8,Math.min(S,g)),x(v,g),(f=s.preventDefault)==null||f.call(s),(I=s.stopPropagation)==null||I.call(s)},A=()=>{if(r){r=!1,t.classList.remove("dragging");try{const s=`zone_pos_${T.current.key}_fishing`,i=e.getBoundingClientRect(),d=t.getBoundingClientRect(),v=Math.max(1,i.width-t.offsetWidth-8),g=Math.max(1,i.height-t.offsetHeight-8);p=L((d.left-i.left-8)/v),b=L((d.top-i.top-8)/g),localStorage.setItem(s,JSON.stringify({xpct:p,ypct:b}));try{_(async()=>{const{SaveManager:y}=await import("./index-B2S5ARDU.js").then(S=>S.S);return{SaveManager:y}},__vite__mapDeps([0,1])).then(({SaveManager:y})=>{y.debouncedSave()})}catch{}}catch{}}};t.addEventListener("mousedown",q),document.addEventListener("mousemove",P),document.addEventListener("mouseup",A),t.addEventListener("touchstart",q,{passive:!1}),document.addEventListener("touchmove",P,{passive:!1}),document.addEventListener("touchend",A,{passive:!0});const R=()=>{p!=null&&b!=null&&w()};window.addEventListener("resize",R)}};export{Z as SkillingZones};
