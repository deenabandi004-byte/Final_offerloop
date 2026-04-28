import{r as n,j as e,ad as Te,b3 as ht,L as xe,l as Ge,a7 as pt,u as ut,f as mt,ac as je,aK as Fe,ak as ft,X as gt,b4 as xt,U as yt,an as bt}from"./vendor-react-BoAoxdXb.js";import{f as wt,A as vt,g as St}from"./AppHeader-C2K5IZO_.js";import{T as jt,c as Pe}from"./tabs-DQ05ubud.js";import{b as G,u as Ft,k as kt,t as I,B as ke,L as Ct}from"./index-CfDJJ1-8.js";import{V as At}from"./VideoDemo-DlvG2psN.js";import{A as Oe,a as Ue,b as He,c as _e,d as Ye,e as We,f as qe,g as Ke}from"./alert-dialog-CqX-85Q9.js";import{M as Et}from"./MainContentWrapper-BDRr0nyN.js";import{S as Nt}from"./StickyCTA-CvpvBXXx.js";import{D as Tt}from"./devPreview-BKaiNRnB.js";import{g as Ve}from"./universityUtils-D63GFvbv.js";import{f as $t}from"./firebaseApi-BvHq5Jsp.js";const Y="'IBM Plex Mono', monospace",Ce=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Ae=40,Ee=32;function Bt({firms:r,onViewContacts:b,onDelete:l,deletingId:i}){const[g,j]=n.useState("name"),[u,h]=n.useState("desc"),[$,w]=n.useState(""),[k,E]=n.useState(r),[p,B]=n.useState(new Set),[y,M]=n.useState(null),F=n.useRef(null);n.useEffect(()=>{if(!$.trim()){E(r);return}const s=r.filter(v=>{var C,z,H,f,V;const c=$.toLowerCase();return((C=v.name)==null?void 0:C.toLowerCase().includes(c))||((z=v.industry)==null?void 0:z.toLowerCase().includes(c))||((f=(H=v.location)==null?void 0:H.display)==null?void 0:f.toLowerCase().includes(c))||((V=v.website)==null?void 0:V.toLowerCase().includes(c))});E(s)},[$,r]);const O=[...k].sort((s,v)=>{var z,H,f,V,ne,oe,_,J;let c,C;switch(g){case"name":c=((z=s.name)==null?void 0:z.toLowerCase())||"",C=((H=v.name)==null?void 0:H.toLowerCase())||"";break;case"location":c=((V=(f=s.location)==null?void 0:f.display)==null?void 0:V.toLowerCase())||"",C=((oe=(ne=v.location)==null?void 0:ne.display)==null?void 0:oe.toLowerCase())||"";break;case"industry":c=((_=s.industry)==null?void 0:_.toLowerCase())||"",C=((J=v.industry)==null?void 0:J.toLowerCase())||"";break;default:return 0}return c<C?u==="asc"?-1:1:c>C?u==="asc"?1:-1:0}),$e=s=>{g===s?h(u==="asc"?"desc":"asc"):(j(s),h("desc"))},X=s=>{var v;return s.id||`${s.name}-${(v=s.location)==null?void 0:v.display}`},he=()=>{p.size===k.length?B(new Set):B(new Set(k.map(s=>X(s))))},N=s=>{B(v=>{const c=new Set(v);return c.has(s)?c.delete(s):c.add(s),c})},se=()=>{if(!y)return"A1";const s=Ce.find(C=>C.key===y.col),v=(s==null?void 0:s.letter)||"A",c=O.findIndex(C=>X(C)===y.firmKey);return`${v}${c>=0?c+1:1}`},ie=()=>{var v;if(!y)return"";const s=O.find(c=>X(c)===y.firmKey);if(!s)return"";switch(y.col){case"name":return s.name||"";case"website":return s.website||"";case"linkedin":return s.linkedinUrl||"";case"location":return((v=s.location)==null?void 0:v.display)||"";case"industry":return s.industry||"";default:return""}},L={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:Y,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:s=>{F.current&&!F.current.contains(s.target)&&M(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(Te,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:$,onChange:s=>w(s.target.value),style:{fontFamily:Y,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[k.length," firm",k.length!==1?"s":"",$&&` of ${r.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:Y},children:se()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:Y,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:Y,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:ie()})]}),e.jsx("div",{ref:F,style:{flex:1,overflow:"auto"},children:k.length===0&&r.length>0&&$?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:Y},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>w(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:Y},children:"Clear search"})]}):k.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:Y},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ae,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:Ee,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Ce.map(s=>{const v=(y==null?void 0:y.col)===s.key;return e.jsx("th",{style:{fontSize:10,color:v?"#2a2a2a":"#999",fontWeight:v?500:400,background:v?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:s.width},children:s.letter},s.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ae,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:Ee,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:k.length>0&&p.size===k.length,onChange:he,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Ce.map(s=>{const v=(y==null?void 0:y.col)===s.key,c=L[s.key];return e.jsxs("th",{onClick:c?()=>$e(c):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:v?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:s.width,cursor:c?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[s.label,c&&g===c&&(u==="asc"?" ↑":" ↓")]},s.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:O.map((s,v)=>{var H;const c=X(s),C=p.has(c),z=f=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(y==null?void 0:y.firmKey)===c&&(y==null?void 0:y.col)===f?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:C?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:f=>{C||(f.currentTarget.style.background="#f5f5f3")},onMouseLeave:f=>{f.currentTarget.style.background=C?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Ae,textAlign:"center",fontSize:10,color:C?"#fff":"#999",background:C?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:f=>{C||(f.currentTarget.style.background="#f0f0ee",f.currentTarget.style.color="#555")},onMouseLeave:f=>{C||(f.currentTarget.style.background="#ffffff",f.currentTarget.style.color="#999")},children:v+1}),e.jsx("td",{style:{width:Ee,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:C,onChange:()=>N(c),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>M({firmKey:c,col:"name"}),style:z("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:s.name||"—"})}),e.jsx("td",{onClick:()=>M({firmKey:c,col:"website"}),style:z("website"),children:s.website?e.jsx("a",{href:s.website,target:"_blank",rel:"noopener noreferrer",onClick:f=>f.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:f=>{f.currentTarget.style.color="#2a2a2a"},onMouseLeave:f=>{f.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>M({firmKey:c,col:"linkedin"}),style:z("linkedin"),children:s.linkedinUrl?e.jsx("a",{href:s.linkedinUrl.startsWith("http")?s.linkedinUrl:`https://${s.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",onClick:f=>f.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:f=>{f.currentTarget.style.color="#2a2a2a"},onMouseLeave:f=>{f.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>M({firmKey:c,col:"location"}),style:z("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((H=s.location)==null?void 0:H.display)||"—"})}),e.jsx("td",{onClick:()=>M({firmKey:c,col:"industry"}),style:z("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:s.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>b(s),style:{fontFamily:Y,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:f=>{f.currentTarget.style.color="#2a2a2a"},onMouseLeave:f=>{f.currentTarget.style.color="#555"},children:[e.jsx(ht,{className:"h-3 w-3"})," View"]}),l&&e.jsx("button",{onClick:()=>l(s),disabled:i===c,style:{background:"none",border:"none",color:"#bbb",cursor:i===c?"wait":"pointer",padding:3},onMouseEnter:f=>{f.currentTarget.style.color="#c00"},onMouseLeave:f=>{f.currentTarget.style.color="#bbb"},children:i===c?e.jsx(xe,{className:"h-3 w-3 animate-spin"}):e.jsx(Ge,{className:"h-3 w-3"})})]})})]},c)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:Y},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[O.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}function Rt(r,b){const l=[...r];let i=b;for(let g=l.length-1;g>0;g--){i=(i*16807+0)%2147483647;const j=i%(g+1);[l[g],l[j]]=[l[j],l[g]]}return l}function It(){return Math.floor(Date.now()/(7*24*60*60*1e3))}function Lt(r){const b=Ve(r.university)||r.university,l=r.targetIndustries[0]||"finance",i=r.preferredLocations[0]||"New York",g=r.careerTrack||r.preferredJobRole||"analyst",j=r.graduationYear||"2026",u=r.dreamCompanies[0]||"",h=l.toLowerCase(),$=/banking|ib|investment/i.test(h),w=/consulting|strategy|management/i.test(h),k=/tech|software|engineering|data|ai|product/i.test(h),E=/finance|asset|hedge|pe|private equity|venture/i.test(h),p=[];return p.push({prompt:`${l} firms that recruited from ${b} in the last two years`,hint:`${b} · School affinity`}),p.push({prompt:`Companies in ${i} with ${b} alumni in ${g} roles`,hint:`${b} · ${i} · Alumni signal`}),$?p.push({prompt:`Boutique investment banks in ${i} hiring summer ${j} analysts`,hint:`${g} · ${l} · ${i}`},{prompt:`Middle-market banks in ${i} with strong ${g} programs`,hint:`${l} · ${i}`},{prompt:`Investment banks under 500 employees in ${i}`,hint:`Size · ${i}`},{prompt:`Banks in ${i} known for lateral hiring from ${b}`,hint:`${b} · ${l}`}):w?p.push({prompt:`Boutique consulting firms in ${i} hiring ${j} analysts`,hint:`${g} · ${l} · ${i}`},{prompt:`Strategy consulting firms with offices in ${i}`,hint:`${l} · ${i}`},{prompt:`Management consulting firms under 200 employees in ${i}`,hint:`Size · ${i}`},{prompt:`Consulting firms that recruit heavily from ${b}`,hint:`${b} · ${l}`}):k?p.push({prompt:`Series B+ AI companies in ${i} hiring ${g}s`,hint:`${g} · ${l} · ${i}`},{prompt:`Tech startups in ${i} under 100 employees hiring ${g}s`,hint:`Size · ${g} · ${i}`},{prompt:`FAANG-tier companies hiring new grad ${g}s in ${i}`,hint:`${l} · ${i}`},{prompt:`Climate tech startups hiring ${g}s across the US`,hint:`${l} · ${g}`}):E?p.push({prompt:`Hedge funds in ${i} under 100 employees with ${b} alumni`,hint:"Size · Alumni signal"},{prompt:`Asset management firms in ${i} hiring ${j} analysts`,hint:`${l} · ${i}`},{prompt:`PE firms that recruited from ${b} in the last two years`,hint:`${b} · ${l}`},{prompt:`Venture capital firms in ${i} hiring associates`,hint:`${l} · ${i}`}):p.push({prompt:`${l} companies in ${i} hiring ${j} graduates`,hint:`${l} · ${i}`},{prompt:`${l} firms in ${i} under 200 employees`,hint:`Size · ${i}`},{prompt:`Growing ${l} companies hiring ${g}s`,hint:`${l} · ${g}`},{prompt:`${l} companies with strong early-career programs`,hint:`${l} · Entry-level`}),u&&p.push({prompt:`Companies similar to ${u} in ${i}`,hint:`${u} · ${i}`}),p}function zt(r){const b=r.targetIndustries,l=[],i={tech:[{prompt:"Series B+ AI companies in San Francisco",hint:"Tech · San Francisco"},{prompt:"Climate tech startups hiring across the US",hint:"Tech · Nationwide"},{prompt:"Enterprise SaaS companies in New York hiring engineers",hint:"Tech · New York"},{prompt:"Gaming studios in Los Angeles hiring new grads",hint:"Tech · Los Angeles"}],finance:[{prompt:"Boutique investment banks in New York",hint:"Finance · New York"},{prompt:"Hedge funds in Chicago under 100 employees",hint:"Finance · Chicago"},{prompt:"Fintech companies in San Francisco hiring analysts",hint:"Finance · San Francisco"},{prompt:"Asset management firms in Boston",hint:"Finance · Boston"}],consulting:[{prompt:"Boutique strategy firms in New York",hint:"Consulting · New York"},{prompt:"Management consulting firms in Chicago",hint:"Consulting · Chicago"},{prompt:"Healthcare consulting firms hiring analysts",hint:"Consulting · Healthcare"},{prompt:"Tech consulting firms in San Francisco",hint:"Consulting · San Francisco"}],default:[{prompt:"Fast-growing startups hiring in New York",hint:"Startups · New York"},{prompt:"Companies in San Francisco under 200 employees",hint:"Size · San Francisco"},{prompt:"Top employers in Chicago hiring new graduates",hint:"Chicago · Entry-level"},{prompt:"Mission-driven companies hiring across the US",hint:"Impact · Nationwide"}]};for(const g of b.slice(0,2)){const j=g.toLowerCase(),u=/tech|software|ai|data|engineer/i.test(j)?"tech":/banking|finance|hedge|pe|asset/i.test(j)?"finance":/consulting|strategy/i.test(j)?"consulting":"default";l.push(...i[u]||i.default)}return l.length<6&&l.push(...i.default),l}const Dt=[{prompt:"AI startups in San Francisco hiring data scientists",hint:"Tech · San Francisco"},{prompt:"Boutique investment banks in New York",hint:"Finance · New York"},{prompt:"Climate tech companies hiring across the US",hint:"Climate · Nationwide"},{prompt:"Management consulting firms in Chicago",hint:"Consulting · Chicago"},{prompt:"Gaming studios in Los Angeles hiring new grads",hint:"Entertainment · Los Angeles"},{prompt:"Healthcare startups in Boston under 100 employees",hint:"Healthcare · Boston"},{prompt:"Fintech companies in New York hiring analysts",hint:"Fintech · New York"},{prompt:"Series B+ edtech companies hiring product managers",hint:"Edtech · Product"}];function Mt(r){const b=!!r.university,l=r.targetIndustries.length>0,i=!!(r.careerTrack||r.preferredJobRole),g=!!(r.preferredLocations[0]||r.dreamCompanies[0]);let j,u;b&&l&&i&&g?(j=1,u=Lt(r)):l?(j=2,u=zt(r)):(j=3,u=Dt);const h=It(),$=Rt(u,h),w=new Set,k=[];for(const E of $){const p=E.prompt.toLowerCase();w.has(p)||(w.add(p),k.push(E))}return{tier:j,items:k.slice(0,6)}}const Pt=({item:r,onSelect:b})=>e.jsxs("button",{type:"button",onClick:()=>b(r.prompt),className:"prompt-card",style:{display:"flex",flexDirection:"column",background:"#fff",border:"1px solid #E5E3DE",borderRadius:8,padding:14,minHeight:88,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"border-color .15s ease, transform .15s ease",width:"100%"},children:[e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:15,lineHeight:1.4,color:"var(--ink, #111418)",flex:1},children:["“",r.prompt,"”"]}),e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:9.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8A8F97",marginTop:"auto",paddingTop:8},children:r.hint}),e.jsx("style",{children:`
        .prompt-card:hover {
          border-color: #1B2A44 !important;
          transform: translateY(-1px);
        }
        .prompt-card:focus-visible {
          outline: 2px solid var(--st-accent, #1B2A44);
          outline-offset: 2px;
        }
      `})]}),Ot=({ctx:r,onSelect:b,onUpdatePreferences:l,dimmed:i})=>{var B,y;const g=n.useMemo(()=>Math.floor(Date.now()/6048e5),[]),j=n.useMemo(()=>r?Mt(r):null,[r==null?void 0:r.university,(B=r==null?void 0:r.targetIndustries)==null?void 0:B.join(","),r==null?void 0:r.careerTrack,r==null?void 0:r.preferredJobRole,g]);if(!j)return null;const{tier:u,items:h}=j,$=(r==null?void 0:r.firstName)||"",w=((y=r==null?void 0:r.targetIndustries)==null?void 0:y[0])||"";let k,E,p;if(u===1){k="BUILT FROM YOUR PROFILE";const M=$?`, ${$.toLowerCase()}`:"",F=w?` ${w.toLowerCase()}`:"";E=`Six places to look first${M}${F}.`,p="Update preferences ↗"}else u===2?(k="BUILT FROM YOUR PROFILE",E="Six places to look first.",p="Update preferences ↗"):(k="CURATED BY OFFERLOOP",E="Six strong starting points.",p="Tell us about yourself ↗");return e.jsxs("div",{style:{marginTop:36,transition:"opacity 0.15s ease",opacity:i?.4:1},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12},children:[e.jsxs("div",{children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:9.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8A8F97",marginBottom:4},children:k}),e.jsx("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:18,color:"var(--ink, #111418)",lineHeight:1.3},children:E})]}),e.jsx("button",{type:"button",onClick:l,style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,color:"#4A4F57",background:"none",border:"none",cursor:"pointer",whiteSpace:"nowrap",padding:0,marginTop:2},children:p})]}),u===3&&e.jsx("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:13,color:"var(--ink-2, #4A4F57)",padding:"10px 14px",background:"var(--paper-2, #FAFAF8)",border:"1px solid var(--line, #E5E3DE)",borderRadius:6,marginBottom:12},children:"Add your school and target industries to get prompts shaped around you."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},children:h.map((M,F)=>e.jsx(Pt,{item:M,onSelect:b},F))})]})},Ut=({schoolShort:r,onSelect:b})=>{const{data:l,isLoading:i}=pt({queryKey:["recentSearches",r],queryFn:()=>G.getRecentSearches(3,r||void 0),staleTime:3e5}),g=l||[];if(!i&&g.length===0)return null;const j=r?`WHAT OTHER ${r.toUpperCase()} STUDENTS ARE SEARCHING`:"WHAT STUDENTS ARE SEARCHING";return e.jsxs("div",{style:{marginTop:40},children:[e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:9.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8A8F97",marginBottom:4},children:j}),e.jsx("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:18,color:"var(--ink, #111418)",lineHeight:1.3},children:"This week’s most-run prompts."})]}),i&&e.jsx("div",{children:[1,2,3].map(u=>e.jsxs("div",{style:{padding:"10px 0",borderTop:"1px solid #EFEDE8",display:"flex",justifyContent:"space-between",alignItems:"center"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx("div",{style:{width:14,height:14,background:"var(--line-2, #F0F0ED)",borderRadius:2}}),e.jsx("div",{style:{width:200+u*30,height:13,background:"var(--line-2, #F0F0ED)",borderRadius:2}})]}),e.jsx("div",{style:{width:100,height:10,background:"var(--line-2, #F0F0ED)",borderRadius:2}})]},u))}),!i&&g.map((u,h)=>e.jsxs("button",{type:"button",onClick:()=>b(u.query),style:{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"10px 0",borderTop:"1px solid #EFEDE8",background:"none",border:"none",borderBottom:h===g.length-1?"none":void 0,cursor:"pointer",fontFamily:"inherit",textAlign:"left"},className:"recent-search-row",children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6},children:[e.jsx("span",{style:{color:"#8A8F97",fontSize:13},children:"⌕"}),e.jsx("span",{style:{fontSize:13,color:"#4A4F57"},children:u.query})]}),e.jsxs("span",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,color:"#8A8F97",whiteSpace:"nowrap",flexShrink:0,marginLeft:12},children:[u.count," ",u.count===1?"student":"students"," this week"]})]},h)),e.jsx("style",{children:`
        .recent-search-row {
          border-top: 1px solid #EFEDE8 !important;
        }
        .recent-search-row:hover {
          background: var(--paper-2, #F7F7F5) !important;
        }
        .recent-search-row:focus-visible {
          outline: 2px solid var(--st-accent, #1B2A44);
          outline-offset: 2px;
        }
      `})]})},Ne="scout_auto_populate";function Ht(r){return["Netflix hiring managers in LA",r?`${r} grads at McKinsey`:"Top grads at McKinsey","AI startups hiring data scientists","Boutique banks in New York","Gaming studios in Los Angeles"]}const _t=r=>r<=5?"Perfect for focused targeting":r<=10?"Great for exploring an industry":"Maximum discovery — cast a wide net",rr=({embedded:r=!1,initialTab:b,isDevPreview:l=!1})=>{const i=ut(),g=mt(),{user:j,checkCredits:u}=Ft(),h=l?Tt:j,{openPanelWithSearchHelp:$}=kt(),w=h||{credits:0,tier:"free"},k=n.useMemo(()=>Ve(h==null?void 0:h.university),[h]),E=n.useMemo(()=>Ht(k),[k]),[p,B]=n.useState(""),[y,M]=n.useState(!1),[F,O]=n.useState([]),[$e,X]=n.useState(null),[he,N]=n.useState(null),[se,ie]=n.useState(!1),[L,s]=n.useState(null),[v,c]=n.useState(!1),[C,z]=n.useState(!1),[H,f]=n.useState([]),[V,ne]=n.useState(!1),oe=n.useRef(null),[_,J]=n.useState(b||"firm-search");n.useEffect(()=>{b&&J(b)},[b]);const[ye,be]=n.useState(!1),[Je,Be]=n.useState(null),[Qe,we]=n.useState(!1),[Xe,ve]=n.useState(!1),Ze=n.useRef([]),Z=n.useRef(new Set),[T,et]=n.useState(10),[W]=n.useState(5),pe=n.useRef(null),[ue,tt]=n.useState(0),[Re,Ie]=n.useState(!0),[ee,me]=n.useState(!1);n.useEffect(()=>{if(ee||p)return;const t=setInterval(()=>{Ie(!1),setTimeout(()=>{tt(d=>(d+1)%E.length),Ie(!0)},300)},3e3);return()=>clearInterval(t)},[ee,p]);const Le=!p&&!ee,[rt,st]=n.useState(null),ze=n.useRef(!1);n.useEffect(()=>{!(h!=null&&h.uid)||ze.current||(ze.current=!0,(async()=>{try{const t=await $t.getUserOnboardingData(h.uid);st({firstName:t.firstName,university:t.university,graduationYear:t.graduationYear,targetIndustries:t.targetIndustries,preferredLocations:t.preferredLocations,dreamCompanies:t.dreamCompanies,careerTrack:t.careerTrack,preferredJobRole:t.preferredJobRole})}catch(t){console.error("Failed to load onboarding data:",t)}})())},[h==null?void 0:h.uid]);const it=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(p),ae=p.length>20&&it;n.useEffect(()=>{u&&h&&u()},[T,u,h]),n.useEffect(()=>{Ze.current=F},[F]),n.useEffect(()=>{const t=S=>{const{industry:m,location:x,size:o}=S;let a="";m&&(a+=m),x&&(a+=(a?" in ":"")+x),o&&(a+=(a?", ":"")+o),a&&(B(a),I({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},d=()=>{var S;try{const m=(S=g.state)==null?void 0:S.scoutAutoPopulate;if((m==null?void 0:m.search_type)==="firm"){t(m),sessionStorage.removeItem(Ne),i(g.pathname,{replace:!0,state:{}});return}const x=sessionStorage.getItem(Ne);if(x){const o=JSON.parse(x);let a;o.search_type==="firm"&&(o.auto_populate?a=o.auto_populate:a=o,t(a),sessionStorage.removeItem(Ne))}}catch(m){console.error("[Scout] Auto-populate error:",m)}};return d(),window.addEventListener("scout-auto-populate",d),()=>window.removeEventListener("scout-auto-populate",d)},[g.state,g.pathname,i]);const Q=n.useRef(new Set),q=n.useCallback(async()=>{if(!h){be(!1);return}be(!0);try{const t=await G.getFirmSearchHistory(100,!0),d=[],S=new Set,m=new Set;t.forEach(o=>{o.results&&Array.isArray(o.results)&&o.results.forEach(a=>{var U;if(a.id&&Z.current.has(a.id)||a.id&&Q.current.has(a.id))return;const A=a.id||`${a.name}-${(U=a.location)==null?void 0:U.display}`;a.id?S.has(a.id)||(S.add(a.id),d.push(a)):m.has(A)||(m.add(A),d.push(a))})});const x=d.filter(o=>!(o.id&&Z.current.has(o.id)));Q.current.size>0&&Q.current.clear(),O(x)}catch(t){console.error("Failed to load saved firms:",t),I({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{be(!1)}},[h]),fe=n.useCallback(async()=>{if(h){ne(!0);try{const t=await G.getFirmSearchHistory(10);f(t)}catch(t){console.error("Failed to load search history:",t)}finally{ne(!1)}}},[h]);n.useEffect(()=>{fe(),u&&u()},[fe,u]);const ge=n.useRef(!1);n.useEffect(()=>{if(_!=="firm-library"){ge.current=!1;return}h&&(ge.current||(ge.current=!0,q()))},[_,h,q]);const Se=async t=>{var o;const d=p;if(!d.trim()){N("Please enter a search query");return}if(!h){N("Please sign in to search for firms"),I({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}M(!0),N(null),ie(!0),c(!1);const S=2+Math.ceil(T/5)*2,m=S<60?`${S} seconds`:`${Math.ceil(S/60)} minutes`;s({current:0,total:T,step:`Starting search... (est. ${m})`});let x=null;try{const{searchId:a}=await G.searchFirmsAsync(d,T);x=await G.createFirmSearchStream(a),await new Promise((A,U)=>{x.addEventListener("progress",P=>{try{const D=JSON.parse(P.data);s({current:D.current??0,total:D.total??T,step:D.step||"Searching..."})}catch{}}),x.addEventListener("complete",P=>{var D,K;te=!0,x==null||x.close();try{const R=JSON.parse(P.data);s(null),R.success&&((D=R.firms)==null?void 0:D.length)>0?(X(R.parsedFilters),O(R.firms),c(!0),I({title:"Search Complete!",description:`Found ${R.firms.length} firm${R.firms.length!==1?"s":""}. Used ${R.creditsCharged||0} credits.`}),u&&u(),fe()):((K=R.firms)==null?void 0:K.length)===0?(N("Hmm, nothing matched that exactly. Try broadening to just the city or industry — or ask Scout."),$({searchType:"firm",failedSearchParams:{industry:d,location:"",size:""},errorType:"no_results"})):N(R.error||"Search failed. Please try again.")}catch{N("Failed to parse search results.")}A()}),x.addEventListener("error",P=>{te=!0,x==null||x.close();try{const D=JSON.parse(P.data);N(D.message||"Search failed.")}catch{N("Search connection lost. Please try again.")}A()});let te=!1;x.onerror=()=>{if(te)return;te=!0,x==null||x.close();const P=setInterval(async()=>{var D,K,R;try{const re=await G.getFirmSearchStatus(a);((D=re.progress)==null?void 0:D.status)==="completed"?(clearInterval(P),s(null),u&&u(),fe(),q(),c(!0),I({title:"Search Complete!",description:"Results loaded from history."}),A()):((K=re.progress)==null?void 0:K.status)==="failed"&&(clearInterval(P),N(((R=re.progress)==null?void 0:R.error)||"Search failed."),A())}catch{clearInterval(P),N("Search connection lost. Please check your search history for results."),A()}},2e3);setTimeout(()=>{clearInterval(P),N("Search is taking longer than expected. Check your history for results."),A()},12e4)}})}catch(a){if(console.error("Search error:",a),a.status===401||(o=a.message)!=null&&o.includes("Authentication required"))N("Authentication required. Please sign in again."),I({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(a.status===402||a.error_code==="INSUFFICIENT_CREDITS"){const A=a.creditsNeeded||a.required||T*W,U=a.currentCredits||a.available||w.credits||0;N(`Insufficient credits. You need ${A} but have ${U}.`),I({title:"Insufficient Credits",description:`Need ${A}, have ${U}.`,variant:"destructive"}),u&&await u()}else a.status===502||a.error_code==="EXTERNAL_API_ERROR"?(N(a.message||"Search service temporarily unavailable."),I({title:"Service Unavailable",description:a.message||"Try again shortly.",variant:"destructive"})):(N(a.message||"An unexpected error occurred."),I({title:"Search Failed",description:a.message||"Please try again.",variant:"destructive"}))}finally{x==null||x.close(),M(!1),s(null)}},nt=t=>{var S,m;const d=new URLSearchParams;if(d.set("company",t.name),(S=t.location)!=null&&S.display)d.set("location",t.location.display);else if((m=t.location)!=null&&m.city){const x=[t.location.city,t.location.state,t.location.country].filter(Boolean);d.set("location",x.join(", "))}i(`/find?${d.toString()}`)},le=t=>{var d;return t.id||`${t.name}-${(d=t.location)==null?void 0:d.display}`},ot=async t=>{const d=le(t);Be(d);try{t.id&&(Z.current.add(t.id),Q.current.add(t.id)),O(m=>m.filter(o=>t.id&&o.id?o.id!==t.id:le(o)!==d));const S=await G.deleteFirm(t);if(S.success){if(S.deletedCount===0){t.id&&(Z.current.delete(t.id),Q.current.delete(t.id)),O(m=>m.some(o=>t.id&&o.id?o.id===t.id:le(o)===d)?m:[...m,t]),I({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}I({title:"Firm deleted",description:"Removed from your Firm Library."}),_==="firm-library"&&setTimeout(async()=>{try{await q()}catch(m){console.error("Error reloading firms:",m)}},1500)}else throw t.id&&(Z.current.delete(t.id),Q.current.delete(t.id)),O(m=>m.some(o=>t.id&&o.id?o.id===t.id:le(o)===d)?m:[...m,t]),new Error(S.error||"Failed to delete firm")}catch(S){console.error("Delete firm error:",S),t.id&&(Z.current.delete(t.id),Q.current.delete(t.id)),O(m=>m.some(o=>t.id&&o.id?o.id===t.id:le(o)===d)?m:[...m,t]),I({title:"Delete failed",description:S instanceof Error?S.message:"Please try again.",variant:"destructive"})}finally{Be(null)}},at=async()=>{const t=F.length;we(!1);try{const d=F.map(o=>G.deleteFirm(o)),m=(await Promise.allSettled(d)).filter(o=>o.status==="fulfilled"&&o.value.success&&(o.value.deletedCount||0)>0).length,x=t-m;x===0?(O([]),I({title:"All firms deleted",description:`Removed ${m} firm${m!==1?"s":""} from your Firm Library.`}),_==="firm-library"&&setTimeout(async()=>{try{await q()}catch(o){console.error("Error reloading firms:",o)}},1e3)):(I({title:"Partial deletion",description:`Deleted ${m} of ${t} firms. ${x} failed.`,variant:"default"}),_==="firm-library"&&setTimeout(async()=>{try{await q()}catch(o){console.error("Error reloading firms:",o)}},1e3))}catch(d){console.error("Error deleting all firms:",d),I({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),_==="firm-library"&&setTimeout(async()=>{try{await q()}catch(S){console.error("Error reloading firms:",S)}},1e3)}},lt=t=>{B(t.query),z(!1)},De=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),Se())},ct=()=>{if(w.tier==="free"){ve(!0);return}if(!F||F.length===0)return;const d=["Company Name","Website","LinkedIn","Location","Industry"].join(","),S=F.map(A=>{var P,D,K,R;const U=re=>{if(!re)return"";const de=String(re);return de.includes(",")||de.includes('"')||de.includes(`
`)?`"${de.replace(/"/g,'""')}"`:de},te=((P=A.location)==null?void 0:P.display)||[(D=A.location)==null?void 0:D.city,(K=A.location)==null?void 0:K.state,(R=A.location)==null?void 0:R.country].filter(Boolean).join(", ");return[U(A.name),U(A.website),U(A.linkedinUrl),U(te),U(A.industry)].join(",")}),m=[d,...S].join(`
`),x=new Blob([m],{type:"text/csv;charset=utf-8;"}),o=document.createElement("a"),a=URL.createObjectURL(x);o.setAttribute("href",a),o.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),o.style.visibility="hidden",document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)},dt=()=>{ve(!1),i("/pricing")},ce=((w==null?void 0:w.tier)==="pro"?"pro":"free")==="free"?10:15,Me=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(jt,{value:_,onValueChange:J,className:"w-full",children:[e.jsxs(Pe,{value:"firm-search",className:"mt-0",children:[!h&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(je,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[!p.trim()&&!se&&!y&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{marginBottom:0},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",border:"1.5px solid var(--warm-border, #E8E4DE)",borderRadius:14,background:"var(--warm-surface, #FAF9F6)",transition:"all .15s",minHeight:56},className:"focus-within:border-[#1B2A44] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(27,42,68,0.08)]",children:[e.jsx(Te,{style:{width:16,height:16,flexShrink:0,color:"#8A8F97",marginTop:3}}),e.jsxs("div",{style:{flex:1,position:"relative"},children:[e.jsx("input",{ref:pe,value:p,onChange:t=>B(t.target.value),onKeyDown:De,onFocus:()=>me(!0),onBlur:()=>{p||me(!1)},placeholder:ee&&!p?E[ue]:void 0,disabled:!h,style:{width:"100%",border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}}),Le&&e.jsx("div",{style:{position:"absolute",top:0,left:0,right:0,pointerEvents:"none",fontSize:14,fontFamily:"inherit",lineHeight:1.5,color:"var(--warm-ink-tertiary, #9C9590)",opacity:Re?1:0,transition:"opacity 0.3s ease",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:E[ue]})]})]})}),e.jsx(Ot,{ctx:rt,onSelect:t=>{var d;B(t),(d=pe.current)==null||d.focus(),window.scrollTo({top:0,behavior:"smooth"})},onUpdatePreferences:()=>i("/account-settings"),dimmed:ee&&!!p}),e.jsx(Ut,{schoolShort:k,onSelect:t=>{var d;B(t),(d=pe.current)==null||d.focus(),window.scrollTo({top:0,behavior:"smooth"})}})]}),(p.trim()||se||y)&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",border:"1.5px solid var(--warm-border, #E8E4DE)",borderRadius:14,background:"var(--warm-surface, #FAF9F6)",transition:"all .15s",minHeight:110},className:"focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]",children:[e.jsx(Te,{style:{width:16,height:16,flexShrink:0,color:"#3B82F6",marginTop:1}}),e.jsxs("div",{style:{flex:1,position:"relative"},children:[e.jsx("input",{ref:pe,value:p,onChange:t=>B(t.target.value),onKeyDown:De,onFocus:()=>me(!0),onBlur:()=>{p||me(!1)},placeholder:ee&&!p?E[ue]:void 0,disabled:y||!h,style:{width:"100%",border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}}),Le&&e.jsx("div",{style:{position:"absolute",top:0,left:0,right:0,pointerEvents:"none",fontSize:14,fontFamily:"inherit",lineHeight:1.5,color:"var(--warm-ink-tertiary, #9C9590)",opacity:Re?1:0,transition:"opacity 0.3s ease",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:E[ue]})]})]})}),he&&e.jsxs("div",{className:"p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4",children:[e.jsx(je,{className:"w-4 h-4 flex-shrink-0"}),he]}),p.trim()&&e.jsxs("div",{style:{marginBottom:16},children:[e.jsx("div",{style:{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:".05em",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsx("div",{className:"slider-container",children:e.jsxs("div",{className:"slider-wrapper",children:[e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[16px]",children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",children:[e.jsx("div",{className:"slider-filled-track",style:{width:ce>5?`${(T-5)/(ce-5)*100}%`:"0%"}}),e.jsx("input",{type:"range",min:5,max:ce,step:5,value:T,onChange:t=>{const d=Math.min(Number(t.target.value),ce);et(d)},disabled:y,className:"slider-custom","aria-label":"Number of companies to find"})]}),e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[20px] text-right",children:ce})]})}),e.jsx("p",{className:"text-xs text-[#6B7280] mt-2",children:_t(T)}),e.jsxs("div",{className:"mt-2 flex items-center gap-2 text-xs text-[#6B7280]",children:[e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]",children:[T*W," credits"]}),e.jsxs("span",{children:["of ",w.credits??0," available"]})]}),w.credits!==void 0&&w.credits<T*W&&e.jsxs("p",{className:"text-xs text-amber-600 mt-2 flex items-center gap-1",children:[e.jsx(je,{className:"w-3 h-3"}),"Insufficient credits. You need ",T*W," but have ",w.credits,"."]})]}),e.jsx("button",{ref:oe,onClick:()=>Se(),disabled:!ae||y||!h||(w.credits??0)<T*W||(w.credits??0)===0,style:{width:"100%",height:52,borderRadius:12,background:y?"#E2E8F0":p.trim()?!ae||!h||(w.credits??0)<T*W||(w.credits??0)===0?"#E2E8F0":"#2563EB":"transparent",color:y?"#94A3B8":p.trim()?!ae||!h||(w.credits??0)<T*W||(w.credits??0)===0?"#94A3B8":"#fff":"#6B6560",border:!p.trim()&&!y?"1.5px solid #D5D0C9":"1.5px solid transparent",fontSize:15,fontWeight:600,cursor:y?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s ease",fontFamily:"inherit"},children:y?e.jsxs(e.Fragment,{children:[e.jsx(xe,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(Fe,{className:"w-4 h-4"}),e.jsx("span",{children:"Search companies"})]})}),p&&!ae&&e.jsx("p",{style:{fontSize:11,color:"#94A3B8",marginTop:10,textAlign:"center"},children:"Include an industry and location for best results"}),se&&e.jsx("button",{type:"button",onClick:()=>{B(""),ie(!1),N(null)},style:{fontSize:12,color:"var(--ink-3, #64748B)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"12px 0 0",transition:"color .12s"},onMouseEnter:t=>{t.currentTarget.style.color="var(--accent, #1B2A44)"},onMouseLeave:t=>{t.currentTarget.style.color="var(--ink-3, #64748B)"},children:"← Back to recommendations"})]})]})]}),e.jsx(Pe,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[F.length," ",F.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(ke,{onClick:()=>{ge.current=!1,q()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:ye,children:[ye?e.jsx(xe,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),F.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(ke,{onClick:()=>we(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Ge,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(ke,{onClick:ct,className:`gap-2 ${w.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:w.tier==="free",title:w.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(ft,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),ye?e.jsx(Ct,{variant:"card",count:3}):F.length>0?e.jsx(Bt,{firms:F,onViewContacts:nt,onDelete:ot,deletingId:Je}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx(Fe,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>J("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),C&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>z(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(gt,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:V?e.jsx("div",{className:"py-8 text-center",children:e.jsx(xe,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):H.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(xt,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):H.map(t=>e.jsxs("div",{onClick:()=>lt(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:d=>{d.currentTarget.style.background="#EEF2F8"},onMouseLeave:d=>{d.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(yt,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),y&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx(Fe,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(L==null?void 0:L.step)||`Finding ${T} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:L?`${Math.max(2,Math.min(98,L.current/L.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:L?`${L.current} of ${L.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:L?`${Math.round(L.current/L.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),v&&F.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(bt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",F.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{c(!1),J("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{c(!1),B(""),ie(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(Oe,{open:Qe,onOpenChange:we,children:e.jsxs(Ue,{children:[e.jsxs(He,{children:[e.jsx(_e,{children:"Delete All Companies?"}),e.jsxs(Ye,{children:["This will permanently remove all ",F.length," ",F.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(We,{children:[e.jsx(qe,{children:"Cancel"}),e.jsx(Ke,{onClick:at,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Oe,{open:Xe,onOpenChange:ve,children:e.jsxs(Ue,{children:[e.jsxs(He,{children:[e.jsx(_e,{children:"Upgrade to Export CSV"}),e.jsx(Ye,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(We,{children:[e.jsx(qe,{children:"Cancel"}),e.jsx(Ke,{onClick:dt,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER - Prevent horizontal overflow */
          .firm-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-container {
            max-width: 100%;
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          /* 2. HEADER - Reduce font size, ensure wrapping */
          .firm-search-title {
            font-size: 1.75rem !important;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-left: 0;
            padding-right: 0;
          }

          /* 3. SUBTITLE TEXT - Reduce font size */
          .firm-search-subtitle {
            font-size: 0.875rem !important;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 4. TAB BAR - Horizontal scroll or fit within viewport */
          .firm-search-tabs {
            width: 100% !important;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .firm-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .firm-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARD - Full width, proper padding */
          .firm-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADING + HISTORY BUTTON ROW - Stack if needed */
          .firm-search-header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .firm-search-header-content {
            width: 100%;
          }

          .firm-search-form-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-form-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-history-btn {
            width: 100%;
            justify-content: center;
            min-height: 44px;
          }

          /* 7. EXAMPLE CHIPS - Wrap to multiple lines */
          .firm-search-examples {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-example-chips {
            flex-wrap: wrap !important;
            gap: 8px;
            max-width: 100%;
          }

          .firm-search-example-chips button {
            flex-shrink: 0;
            max-width: 100%;
            word-wrap: break-word;
            white-space: normal;
            padding: 8px 12px;
            font-size: 0.875rem;
          }

          /* 8. TEXTAREA - Full width, proper padding */
          .firm-search-textarea-wrapper {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-textarea {
            width: 100% !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 12px !important;
            padding-right: 48px !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 9. HOW MANY COMPANIES SECTION - Ensure wrapping */
          .firm-search-quantity-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-quantity-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-quantity-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-quantity-card {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 10. NUMBER SELECTOR BUTTONS - Ensure all 4 fit or allow scroll */
          .firm-search-quantity-buttons {
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .firm-search-quantity-btn {
            min-width: 60px;
            min-height: 44px !important;
            flex: 1 1 calc(25% - 6px);
            max-width: calc(25% - 6px);
            padding: 12px 8px !important;
            font-size: 0.875rem;
          }

          /* 11. COMPANY ICON VISUALIZATION ROW - Constrain to viewport */
          .firm-search-company-icons {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            max-width: 100%;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .firm-search-company-icons::-webkit-scrollbar {
            display: none;
          }

          .firm-search-company-icons > div {
            flex-shrink: 0;
          }

          /* 12. WHAT YOU'LL GET SECTION - Stack in 2x2 grid or single column */
          .firm-search-features-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-features-title {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding: 0 8px;
          }

          .firm-search-features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .firm-search-features-grid > div {
            padding: 12px !important;
            box-sizing: border-box;
          }

          .firm-search-features-grid > div > div {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-features-grid p {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 13. FIND COMPANIES CTA BUTTON - Full width */
          .firm-search-cta {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-find-btn {
            width: 100% !important;
            min-height: 48px !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 14px 16px !important;
          }

          /* GENERAL - Ensure all containers respect max-width */
          .firm-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-page input,
          .firm-search-page textarea,
          .firm-search-page select,
          .firm-search-page button {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .firm-search-page p,
          .firm-search-page h1,
          .firm-search-page h2,
          .firm-search-page h3,
          .firm-search-page span,
          .firm-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }

          /* Ensure content doesn't touch screen edge */
          .firm-search-container > * {
            padding-left: 0;
            padding-right: 0;
          }

          /* Additional overflow fixes */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-page {
            overflow-x: hidden;
          }

          .firm-search-header {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      `}),_==="firm-search"&&e.jsx(Nt,{originalButtonRef:oe,onClick:()=>Se(),isLoading:y,disabled:!ae||y||!h||(w.credits??0)<T*W,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return r?Me:e.jsx(wt,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(vt,{}),e.jsxs(Et,{children:[e.jsx(St,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(At,{videoId:"n_AYHEJSXrE"})})]}),Me]})]})]})})};export{rr as default};
