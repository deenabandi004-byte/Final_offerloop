import{r as n,j as e,ad as Ne,b3 as ft,L as he,l as qe,w as pt,u as mt,f as xt,ac as we,aK as ve,ak as gt,X as yt,b4 as bt,U as wt,an as vt}from"./vendor-react-CqzRlOw3.js";import{f as jt,A as St,g as kt}from"./AppHeader-BX1Ij_rc.js";import{T as Ft,c as Me}from"./tabs-5TIXXKGC.js";import{u as At,k as Nt,b as G,t as C,B as je,L as Ct}from"./index-COvSHzdn.js";import{V as Et}from"./VideoDemo-Do8XhNF2.js";import{A as Pe,a as Oe,b as Ue,c as $e,d as He,e as _e,f as We,g as Ke}from"./alert-dialog-C8_1Dtor.js";import{M as Bt}from"./MainContentWrapper-DbvKcYzT.js";import{S as Rt}from"./StickyCTA-DYXVaSJG.js";import{D as Tt}from"./devPreview-BKaiNRnB.js";import{g as Ve}from"./universityUtils-D63GFvbv.js";import{f as It,g as zt}from"./suggestionChips-w-ry_-ab.js";import{f as Lt}from"./firebaseApi-Cxk6SlY6.js";const $="'IBM Plex Mono', monospace",Se=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],ke=40,Fe=32;function Dt({firms:g,onViewContacts:E,onDelete:B,deletingId:k}){const[z,_]=n.useState("name"),[x,u]=n.useState("desc"),[W,b]=n.useState(""),[L,Q]=n.useState(g),[w,M]=n.useState(new Set),[h,H]=n.useState(null),v=n.useRef(null);n.useEffect(()=>{if(!W.trim()){Q(g);return}const r=g.filter(m=>{var y,T,P,c,Y;const o=W.toLowerCase();return((y=m.name)==null?void 0:y.toLowerCase().includes(o))||((T=m.industry)==null?void 0:T.toLowerCase().includes(o))||((c=(P=m.location)==null?void 0:P.display)==null?void 0:c.toLowerCase().includes(o))||((Y=m.website)==null?void 0:Y.toLowerCase().includes(o))});Q(r)},[W,g]);const D=[...L].sort((r,m)=>{var T,P,c,Y,ie,ne,O,J;let o,y;switch(z){case"name":o=((T=r.name)==null?void 0:T.toLowerCase())||"",y=((P=m.name)==null?void 0:P.toLowerCase())||"";break;case"location":o=((Y=(c=r.location)==null?void 0:c.display)==null?void 0:Y.toLowerCase())||"",y=((ne=(ie=m.location)==null?void 0:ie.display)==null?void 0:ne.toLowerCase())||"";break;case"industry":o=((O=r.industry)==null?void 0:O.toLowerCase())||"",y=((J=m.industry)==null?void 0:J.toLowerCase())||"";break;default:return 0}return o<y?x==="asc"?-1:1:o>y?x==="asc"?1:-1:0}),Ce=r=>{z===r?u(x==="asc"?"desc":"asc"):(_(r),u("desc"))},Z=r=>{var m;return r.id||`${r.name}-${(m=r.location)==null?void 0:m.display}`},ue=()=>{w.size===L.length?M(new Set):M(new Set(L.map(r=>Z(r))))},S=r=>{M(m=>{const o=new Set(m);return o.has(r)?o.delete(r):o.add(r),o})},re=()=>{if(!h)return"A1";const r=Se.find(y=>y.key===h.col),m=(r==null?void 0:r.letter)||"A",o=D.findIndex(y=>Z(y)===h.firmKey);return`${m}${o>=0?o+1:1}`},se=()=>{var m;if(!h)return"";const r=D.find(o=>Z(o)===h.firmKey);if(!r)return"";switch(h.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((m=r.location)==null?void 0:m.display)||"";case"industry":return r.industry||"";default:return""}},R={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:$,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{v.current&&!v.current.contains(r.target)&&H(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(Ne,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:W,onChange:r=>b(r.target.value),style:{fontFamily:$,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[L.length," firm",L.length!==1?"s":"",W&&` of ${g.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:$},children:re()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:$,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:$,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:se()})]}),e.jsx("div",{ref:v,style:{flex:1,overflow:"auto"},children:L.length===0&&g.length>0&&W?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:$},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>b(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:$},children:"Clear search"})]}):L.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:$},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Se.map(r=>{const m=(h==null?void 0:h.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:m?"#2a2a2a":"#999",fontWeight:m?500:400,background:m?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:L.length>0&&w.size===L.length,onChange:ue,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Se.map(r=>{const m=(h==null?void 0:h.col)===r.key,o=R[r.key];return e.jsxs("th",{onClick:o?()=>Ce(o):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:m?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:o?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,o&&z===o&&(x==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:D.map((r,m)=>{var P;const o=Z(r),y=w.has(o),T=c=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(h==null?void 0:h.firmKey)===o&&(h==null?void 0:h.col)===c?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:y?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:c=>{y||(c.currentTarget.style.background="#f5f5f3")},onMouseLeave:c=>{c.currentTarget.style.background=y?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:ke,textAlign:"center",fontSize:10,color:y?"#fff":"#999",background:y?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:c=>{y||(c.currentTarget.style.background="#f0f0ee",c.currentTarget.style.color="#555")},onMouseLeave:c=>{y||(c.currentTarget.style.background="#ffffff",c.currentTarget.style.color="#999")},children:m+1}),e.jsx("td",{style:{width:Fe,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:y,onChange:()=>S(o),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>H({firmKey:o,col:"name"}),style:T("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||"—"})}),e.jsx("td",{onClick:()=>H({firmKey:o,col:"website"}),style:T("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>H({firmKey:o,col:"linkedin"}),style:T("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl.startsWith("http")?r.linkedinUrl:`https://${r.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>H({firmKey:o,col:"location"}),style:T("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((P=r.location)==null?void 0:P.display)||"—"})}),e.jsx("td",{onClick:()=>H({firmKey:o,col:"industry"}),style:T("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>E(r),style:{fontFamily:$,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:[e.jsx(ft,{className:"h-3 w-3"})," View"]}),B&&e.jsx("button",{onClick:()=>B(r),disabled:k===o,style:{background:"none",border:"none",color:"#bbb",cursor:k===o?"wait":"pointer",padding:3},onMouseEnter:c=>{c.currentTarget.style.color="#c00"},onMouseLeave:c=>{c.currentTarget.style.color="#bbb"},children:k===o?e.jsx(he,{className:"h-3 w-3 animate-spin"}):e.jsx(qe,{className:"h-3 w-3"})})]})})]},o)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:$},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[D.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const Mt=({num:g,name:E,sentence:B,sector:k,onClick:z})=>{const _=It(E);return e.jsxs("button",{type:"button",onClick:z,style:{display:"flex",alignItems:"center",gap:16,width:"100%",padding:"14px 16px",background:"transparent",border:"none",borderBottom:"1px solid var(--line-2, #F0F0ED)",cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"background .12s"},onMouseEnter:x=>{x.currentTarget.style.background="var(--paper-2, #F7F7F5)"},onMouseLeave:x=>{x.currentTarget.style.background="transparent"},children:[e.jsx("span",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:12,fontWeight:400,color:"var(--ink-3, #8A8F9A)",width:24,flexShrink:0,textAlign:"right"},children:g}),_?e.jsx("img",{src:_,alt:"",style:{width:20,height:20,borderRadius:3,flexShrink:0,objectFit:"contain"}}):e.jsx("div",{style:{width:20,height:20,borderRadius:3,background:"var(--line-2, #F0F0ED)",flexShrink:0}}),e.jsx("span",{style:{fontSize:14,fontWeight:500,color:"var(--ink, #111318)",minWidth:120,flexShrink:0},children:E}),e.jsx("span",{style:{flex:1,fontSize:13,color:"var(--ink-3, #8A8F9A)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:B}),e.jsx("span",{style:{fontSize:10,fontFamily:"'JetBrains Mono', monospace",color:"var(--ink-3, #8A8F9A)",textTransform:"uppercase",letterSpacing:"0.04em",flexShrink:0,display:"none"},className:"hidden sm:inline",children:k}),e.jsx(pt,{style:{width:14,height:14,color:"var(--ink-3, #8A8F9A)",flexShrink:0,opacity:.5}})]})},Pt=({items:g,onSelect:E})=>g.length===0?null:e.jsx("div",{style:{border:"1px solid var(--line, #E5E5E0)",borderRadius:3,overflow:"hidden"},children:g.map((B,k)=>e.jsx(Mt,{num:String(k+1).padStart(2,"0"),name:B.company,sentence:B.sentence,sector:B.sector,onClick:()=>E(B.company)},B.company))}),Ot=({onSearch:g,disabled:E,placeholder:B="Search for a specific company or industry..."})=>{const[k,z]=n.useState(""),_=x=>{x.preventDefault(),k.trim()&&g(k.trim())};return e.jsxs("form",{onSubmit:_,style:{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",border:"1px solid var(--line, #E5E5E0)",borderRadius:3,background:"var(--paper, #FFFFFF)",marginTop:20,transition:"border-color .15s"},className:"focus-within:border-[var(--accent)]",children:[e.jsx(Ne,{style:{width:14,height:14,color:"var(--ink-3, #8A8F9A)",flexShrink:0}}),e.jsx("input",{value:k,onChange:x=>z(x.target.value),placeholder:B,disabled:E,style:{flex:1,border:"none",background:"none",outline:"none",fontSize:13,color:"var(--ink, #111318)",fontFamily:"inherit"}}),k.trim()&&e.jsx("button",{type:"submit",disabled:E,style:{fontSize:12,fontWeight:500,color:"var(--accent, #1B2A44)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"4px 8px"},children:"Search"})]})},Ut=({children:g})=>e.jsx("div",{style:{background:"#FAF9F6",border:"1px solid var(--line-2, #F0F0ED)",borderRadius:3,padding:"16px 20px",marginBottom:24},children:e.jsx("p",{style:{fontFamily:"'Instrument Serif', Georgia, serif",fontStyle:"italic",fontSize:16,lineHeight:1.5,color:"var(--ink-2, #4A4F5B)",margin:0},children:g})}),Ae="scout_auto_populate";function $t(g){return["Netflix hiring managers in LA",g?`${g} grads at McKinsey`:"Top grads at McKinsey","AI startups hiring data scientists","Boutique banks in New York","Gaming studios in Los Angeles"]}const Ht=g=>g<=5?"Perfect for focused targeting":g<=10?"Great for exploring an industry":"Maximum discovery — cast a wide net",rr=({embedded:g=!1,initialTab:E,isDevPreview:B=!1})=>{const k=mt(),z=xt(),{user:_,checkCredits:x}=At(),u=B?Tt:_,{openPanelWithSearchHelp:W}=Nt(),b=u||{credits:0,tier:"free"},L=n.useMemo(()=>Ve(u==null?void 0:u.university),[u]),Q=n.useMemo(()=>$t(L),[L]),[w,M]=n.useState(""),[h,H]=n.useState(!1),[v,D]=n.useState([]),[Ce,Z]=n.useState(null),[ue,S]=n.useState(null),[re,se]=n.useState(!1),[R,r]=n.useState(null),[m,o]=n.useState(!1),[y,T]=n.useState(!1),[P,c]=n.useState([]),[Y,ie]=n.useState(!1),ne=n.useRef(null),[O,J]=n.useState(E||"firm-search");n.useEffect(()=>{E&&J(E)},[E]);const[xe,ge]=n.useState(!1),[Ge,Ee]=n.useState(null),[Ye,ye]=n.useState(!1),[Je,be]=n.useState(!1),Xe=n.useRef([]),ee=n.useRef(new Set),[F,Qe]=n.useState(10),[K]=n.useState(5),Ze=n.useRef(null),[Be,et]=n.useState(0),[tt,Re]=n.useState(!0),[fe,Te]=n.useState(!1);n.useEffect(()=>{if(fe||w)return;const t=setInterval(()=>{Re(!1),setTimeout(()=>{et(s=>(s+1)%Q.length),Re(!0)},300)},3e3);return()=>clearInterval(t)},[fe,w]);const rt=!w&&!fe,[Ie,st]=n.useState([]),[ze,it]=n.useState(null),Le=n.useRef(!1);n.useEffect(()=>{if(!(u!=null&&u.uid)||Le.current)return;Le.current=!0,(async()=>{try{const s=await Lt.getUserOnboardingData(u.uid),f=Ve(s.university);it(f||s.university||null);const l={firstName:s.firstName,university:s.university,graduationYear:s.graduationYear,targetIndustries:s.targetIndustries,preferredLocations:s.preferredLocations,dreamCompanies:s.dreamCompanies,careerTrack:s.careerTrack,preferredJobRole:s.preferredJobRole},d=zt(l);let i={};if(s.university&&s.targetIndustries.length>0)try{const p=s.targetIndustries[0],j=await G.getSchoolAffinity(s.university,p);if(j.companies)for(const U of j.companies)i[U.company_name.toLowerCase()]=U.alumni_count}catch{}const a=d.slice(0,12).map(p=>{const j=i[p.company.toLowerCase()],U=f||s.university||"your school";let A;return j&&j>0?A=`${j} ${U} alumni work here in ${p.industry} roles.`:A=`A strong fit based on your ${p.industry} interest.`,{company:p.company,sentence:A,sector:p.industry}});st(a)}catch(s){console.error("Failed to build archive list:",s)}})()},[u==null?void 0:u.uid]);const nt=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(w),ae=w.length>20&&nt;n.useEffect(()=>{x&&u&&x()},[F,x,u]),n.useEffect(()=>{Xe.current=v},[v]),n.useEffect(()=>{const t=f=>{const{industry:l,location:d,size:i}=f;let a="";l&&(a+=l),d&&(a+=(a?" in ":"")+d),i&&(a+=(a?", ":"")+i),a&&(M(a),C({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},s=()=>{var f;try{const l=(f=z.state)==null?void 0:f.scoutAutoPopulate;if((l==null?void 0:l.search_type)==="firm"){t(l),sessionStorage.removeItem(Ae),k(z.pathname,{replace:!0,state:{}});return}const d=sessionStorage.getItem(Ae);if(d){const i=JSON.parse(d);let a;i.search_type==="firm"&&(i.auto_populate?a=i.auto_populate:a=i,t(a),sessionStorage.removeItem(Ae))}}catch(l){console.error("[Scout] Auto-populate error:",l)}};return s(),window.addEventListener("scout-auto-populate",s),()=>window.removeEventListener("scout-auto-populate",s)},[z.state,z.pathname,k]);const X=n.useRef(new Set),V=n.useCallback(async()=>{if(!u){ge(!1);return}ge(!0);try{const t=await G.getFirmSearchHistory(100,!0),s=[],f=new Set,l=new Set;t.forEach(i=>{i.results&&Array.isArray(i.results)&&i.results.forEach(a=>{var j;if(a.id&&ee.current.has(a.id)||a.id&&X.current.has(a.id))return;const p=a.id||`${a.name}-${(j=a.location)==null?void 0:j.display}`;a.id?f.has(a.id)||(f.add(a.id),s.push(a)):l.has(p)||(l.add(p),s.push(a))})});const d=s.filter(i=>!(i.id&&ee.current.has(i.id)));X.current.size>0&&X.current.clear(),D(d)}catch(t){console.error("Failed to load saved firms:",t),C({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{ge(!1)}},[u]),pe=n.useCallback(async()=>{if(u){ie(!0);try{const t=await G.getFirmSearchHistory(10);c(t)}catch(t){console.error("Failed to load search history:",t)}finally{ie(!1)}}},[u]);n.useEffect(()=>{pe(),x&&x()},[pe,x]);const me=n.useRef(!1);n.useEffect(()=>{if(O!=="firm-library"){me.current=!1;return}u&&(me.current||(me.current=!0,V()))},[O,u,V]);const oe=async t=>{var i;const s=t||w;if(!s.trim()){S("Please enter a search query");return}if(!u){S("Please sign in to search for firms"),C({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}H(!0),S(null),se(!0),o(!1);const f=2+Math.ceil(F/5)*2,l=f<60?`${f} seconds`:`${Math.ceil(f/60)} minutes`;r({current:0,total:F,step:`Starting search... (est. ${l})`});let d=null;try{const{searchId:a}=await G.searchFirmsAsync(s,F);d=await G.createFirmSearchStream(a),await new Promise((p,j)=>{d.addEventListener("progress",A=>{try{const I=JSON.parse(A.data);r({current:I.current??0,total:I.total??F,step:I.step||"Searching..."})}catch{}}),d.addEventListener("complete",A=>{var I,q;U=!0,d==null||d.close();try{const N=JSON.parse(A.data);r(null),N.success&&((I=N.firms)==null?void 0:I.length)>0?(Z(N.parsedFilters),D(N.firms),o(!0),C({title:"Search Complete!",description:`Found ${N.firms.length} firm${N.firms.length!==1?"s":""}. Used ${N.creditsCharged||0} credits.`}),x&&x(),pe()):((q=N.firms)==null?void 0:q.length)===0?(S("Hmm, nothing matched that exactly. Try broadening to just the city or industry — or ask Scout."),W({searchType:"firm",failedSearchParams:{industry:s,location:"",size:""},errorType:"no_results"})):S(N.error||"Search failed. Please try again.")}catch{S("Failed to parse search results.")}p()}),d.addEventListener("error",A=>{U=!0,d==null||d.close();try{const I=JSON.parse(A.data);S(I.message||"Search failed.")}catch{S("Search connection lost. Please try again.")}p()});let U=!1;d.onerror=()=>{if(U)return;U=!0,d==null||d.close();const A=setInterval(async()=>{var I,q,N;try{const te=await G.getFirmSearchStatus(a);((I=te.progress)==null?void 0:I.status)==="completed"?(clearInterval(A),r(null),x&&x(),pe(),V(),o(!0),C({title:"Search Complete!",description:"Results loaded from history."}),p()):((q=te.progress)==null?void 0:q.status)==="failed"&&(clearInterval(A),S(((N=te.progress)==null?void 0:N.error)||"Search failed."),p())}catch{clearInterval(A),S("Search connection lost. Please check your search history for results."),p()}},2e3);setTimeout(()=>{clearInterval(A),S("Search is taking longer than expected. Check your history for results."),p()},12e4)}})}catch(a){if(console.error("Search error:",a),a.status===401||(i=a.message)!=null&&i.includes("Authentication required"))S("Authentication required. Please sign in again."),C({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(a.status===402||a.error_code==="INSUFFICIENT_CREDITS"){const p=a.creditsNeeded||a.required||F*K,j=a.currentCredits||a.available||b.credits||0;S(`Insufficient credits. You need ${p} but have ${j}.`),C({title:"Insufficient Credits",description:`Need ${p}, have ${j}.`,variant:"destructive"}),x&&await x()}else a.status===502||a.error_code==="EXTERNAL_API_ERROR"?(S(a.message||"Search service temporarily unavailable."),C({title:"Service Unavailable",description:a.message||"Try again shortly.",variant:"destructive"})):(S(a.message||"An unexpected error occurred."),C({title:"Search Failed",description:a.message||"Please try again.",variant:"destructive"}))}finally{d==null||d.close(),H(!1),r(null)}},at=t=>{var f,l;const s=new URLSearchParams;if(s.set("company",t.name),(f=t.location)!=null&&f.display)s.set("location",t.location.display);else if((l=t.location)!=null&&l.city){const d=[t.location.city,t.location.state,t.location.country].filter(Boolean);s.set("location",d.join(", "))}k(`/find?${s.toString()}`)},le=t=>{var s;return t.id||`${t.name}-${(s=t.location)==null?void 0:s.display}`},ot=async t=>{const s=le(t);Ee(s);try{t.id&&(ee.current.add(t.id),X.current.add(t.id)),D(l=>l.filter(i=>t.id&&i.id?i.id!==t.id:le(i)!==s));const f=await G.deleteFirm(t);if(f.success){if(f.deletedCount===0){t.id&&(ee.current.delete(t.id),X.current.delete(t.id)),D(l=>l.some(i=>t.id&&i.id?i.id===t.id:le(i)===s)?l:[...l,t]),C({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}C({title:"Firm deleted",description:"Removed from your Firm Library."}),O==="firm-library"&&setTimeout(async()=>{try{await V()}catch(l){console.error("Error reloading firms:",l)}},1500)}else throw t.id&&(ee.current.delete(t.id),X.current.delete(t.id)),D(l=>l.some(i=>t.id&&i.id?i.id===t.id:le(i)===s)?l:[...l,t]),new Error(f.error||"Failed to delete firm")}catch(f){console.error("Delete firm error:",f),t.id&&(ee.current.delete(t.id),X.current.delete(t.id)),D(l=>l.some(i=>t.id&&i.id?i.id===t.id:le(i)===s)?l:[...l,t]),C({title:"Delete failed",description:f instanceof Error?f.message:"Please try again.",variant:"destructive"})}finally{Ee(null)}},lt=async()=>{const t=v.length;ye(!1);try{const s=v.map(i=>G.deleteFirm(i)),l=(await Promise.allSettled(s)).filter(i=>i.status==="fulfilled"&&i.value.success&&(i.value.deletedCount||0)>0).length,d=t-l;d===0?(D([]),C({title:"All firms deleted",description:`Removed ${l} firm${l!==1?"s":""} from your Firm Library.`}),O==="firm-library"&&setTimeout(async()=>{try{await V()}catch(i){console.error("Error reloading firms:",i)}},1e3)):(C({title:"Partial deletion",description:`Deleted ${l} of ${t} firms. ${d} failed.`,variant:"default"}),O==="firm-library"&&setTimeout(async()=>{try{await V()}catch(i){console.error("Error reloading firms:",i)}},1e3))}catch(s){console.error("Error deleting all firms:",s),C({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),O==="firm-library"&&setTimeout(async()=>{try{await V()}catch(f){console.error("Error reloading firms:",f)}},1e3)}},ct=t=>{M(t.query),T(!1)},dt=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),oe())},ht=()=>{if(b.tier==="free"){be(!0);return}if(!v||v.length===0)return;const s=["Company Name","Website","LinkedIn","Location","Industry"].join(","),f=v.map(p=>{var A,I,q,N;const j=te=>{if(!te)return"";const de=String(te);return de.includes(",")||de.includes('"')||de.includes(`
`)?`"${de.replace(/"/g,'""')}"`:de},U=((A=p.location)==null?void 0:A.display)||[(I=p.location)==null?void 0:I.city,(q=p.location)==null?void 0:q.state,(N=p.location)==null?void 0:N.country].filter(Boolean).join(", ");return[j(p.name),j(p.website),j(p.linkedinUrl),j(U),j(p.industry)].join(",")}),l=[s,...f].join(`
`),d=new Blob([l],{type:"text/csv;charset=utf-8;"}),i=document.createElement("a"),a=URL.createObjectURL(d);i.setAttribute("href",a),i.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),i.style.visibility="hidden",document.body.appendChild(i),i.click(),document.body.removeChild(i),URL.revokeObjectURL(a)},ut=()=>{be(!1),k("/pricing")},ce=((b==null?void 0:b.tier)==="pro"?"pro":"free")==="free"?10:15,De=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(Ft,{value:O,onValueChange:J,className:"w-full",children:[e.jsxs(Me,{value:"firm-search",className:"mt-0",children:[!u&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(we,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[!w.trim()&&!re&&!h&&e.jsxs(e.Fragment,{children:[ze&&e.jsxs(Ut,{children:["We'll start where ",ze," alumni have landed before."]}),Ie.length>0?e.jsx(Pt,{items:Ie,onSelect:t=>{M(t),oe(t)}}):e.jsxs("div",{style:{padding:"32px 0",textAlign:"center"},children:[e.jsx(he,{className:"w-5 h-5 animate-spin mx-auto",style:{color:"var(--ink-3)"}}),e.jsx("p",{style:{fontSize:13,color:"var(--ink-3)",marginTop:8},children:"Building your recommendations..."})]}),e.jsx(Ot,{onSearch:t=>{M(t),oe(t)},disabled:!u,placeholder:"Or search for a specific company or industry..."})]}),(w.trim()||re||h)&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",border:"1.5px solid var(--warm-border, #E8E4DE)",borderRadius:14,background:"var(--warm-surface, #FAF9F6)",transition:"all .15s",minHeight:110},className:"focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]",children:[e.jsx(Ne,{style:{width:16,height:16,flexShrink:0,color:"#3B82F6",marginTop:1}}),e.jsxs("div",{style:{flex:1,position:"relative"},children:[e.jsx("input",{ref:Ze,value:w,onChange:t=>M(t.target.value),onKeyDown:dt,onFocus:()=>Te(!0),onBlur:()=>{w||Te(!1)},placeholder:fe&&!w?Q[Be]:void 0,disabled:h||!u,style:{width:"100%",border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}}),rt&&e.jsx("div",{style:{position:"absolute",top:0,left:0,right:0,pointerEvents:"none",fontSize:14,fontFamily:"inherit",lineHeight:1.5,color:"var(--warm-ink-tertiary, #9C9590)",opacity:tt?1:0,transition:"opacity 0.3s ease",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:Q[Be]})]})]})}),ue&&e.jsxs("div",{className:"p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4",children:[e.jsx(we,{className:"w-4 h-4 flex-shrink-0"}),ue]}),w.trim()&&e.jsxs("div",{style:{marginBottom:16},children:[e.jsx("div",{style:{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:".05em",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsx("div",{className:"slider-container",children:e.jsxs("div",{className:"slider-wrapper",children:[e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[16px]",children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",children:[e.jsx("div",{className:"slider-filled-track",style:{width:ce>5?`${(F-5)/(ce-5)*100}%`:"0%"}}),e.jsx("input",{type:"range",min:5,max:ce,step:5,value:F,onChange:t=>{const s=Math.min(Number(t.target.value),ce);Qe(s)},disabled:h,className:"slider-custom","aria-label":"Number of companies to find"})]}),e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[20px] text-right",children:ce})]})}),e.jsx("p",{className:"text-xs text-[#6B7280] mt-2",children:Ht(F)}),e.jsxs("div",{className:"mt-2 flex items-center gap-2 text-xs text-[#6B7280]",children:[e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]",children:[F*K," credits"]}),e.jsxs("span",{children:["of ",b.credits??0," available"]})]}),b.credits!==void 0&&b.credits<F*K&&e.jsxs("p",{className:"text-xs text-amber-600 mt-2 flex items-center gap-1",children:[e.jsx(we,{className:"w-3 h-3"}),"Insufficient credits. You need ",F*K," but have ",b.credits,"."]})]}),e.jsx("button",{ref:ne,onClick:()=>oe(),disabled:!ae||h||!u||(b.credits??0)<F*K||(b.credits??0)===0,style:{width:"100%",height:52,borderRadius:12,background:h?"#E2E8F0":w.trim()?!ae||!u||(b.credits??0)<F*K||(b.credits??0)===0?"#E2E8F0":"#2563EB":"transparent",color:h?"#94A3B8":w.trim()?!ae||!u||(b.credits??0)<F*K||(b.credits??0)===0?"#94A3B8":"#fff":"#6B6560",border:!w.trim()&&!h?"1.5px solid #D5D0C9":"1.5px solid transparent",fontSize:15,fontWeight:600,cursor:h?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s ease",fontFamily:"inherit"},children:h?e.jsxs(e.Fragment,{children:[e.jsx(he,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(ve,{className:"w-4 h-4"}),e.jsx("span",{children:"Search companies"})]})}),w&&!ae&&e.jsx("p",{style:{fontSize:11,color:"#94A3B8",marginTop:10,textAlign:"center"},children:"Include an industry and location for best results"}),re&&e.jsx("button",{type:"button",onClick:()=>{M(""),se(!1),S(null)},style:{fontSize:12,color:"var(--ink-3, #64748B)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"12px 0 0",transition:"color .12s"},onMouseEnter:t=>{t.currentTarget.style.color="var(--accent, #1B2A44)"},onMouseLeave:t=>{t.currentTarget.style.color="var(--ink-3, #64748B)"},children:"← Back to recommendations"})]})]})]}),e.jsx(Me,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[v.length," ",v.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(je,{onClick:()=>{me.current=!1,V()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:xe,children:[xe?e.jsx(he,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),v.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(je,{onClick:()=>ye(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(qe,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(je,{onClick:ht,className:`gap-2 ${b.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:b.tier==="free",title:b.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(gt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),xe?e.jsx(Ct,{variant:"card",count:3}):v.length>0?e.jsx(Dt,{firms:v,onViewContacts:at,onDelete:ot,deletingId:Ge}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx(ve,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>J("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),y&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>T(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(yt,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:Y?e.jsx("div",{className:"py-8 text-center",children:e.jsx(he,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):P.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(bt,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):P.map(t=>e.jsxs("div",{onClick:()=>ct(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:s=>{s.currentTarget.style.background="#EEF2F8"},onMouseLeave:s=>{s.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(wt,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),h&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx(ve,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(R==null?void 0:R.step)||`Finding ${F} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:R?`${Math.max(2,Math.min(98,R.current/R.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:R?`${R.current} of ${R.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:R?`${Math.round(R.current/R.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),m&&v.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(vt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",v.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{o(!1),J("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{o(!1),M(""),se(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(Pe,{open:Ye,onOpenChange:ye,children:e.jsxs(Oe,{children:[e.jsxs(Ue,{children:[e.jsx($e,{children:"Delete All Companies?"}),e.jsxs(He,{children:["This will permanently remove all ",v.length," ",v.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(_e,{children:[e.jsx(We,{children:"Cancel"}),e.jsx(Ke,{onClick:lt,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Pe,{open:Je,onOpenChange:be,children:e.jsxs(Oe,{children:[e.jsxs(Ue,{children:[e.jsx($e,{children:"Upgrade to Export CSV"}),e.jsx(He,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(_e,{children:[e.jsx(We,{children:"Cancel"}),e.jsx(Ke,{onClick:ut,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),O==="firm-search"&&e.jsx(Rt,{originalButtonRef:ne,onClick:()=>oe(),isLoading:h,disabled:!ae||h||!u||(b.credits??0)<F*K,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return g?De:e.jsx(jt,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(St,{}),e.jsxs(Bt,{children:[e.jsx(kt,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Et,{videoId:"n_AYHEJSXrE"})})]}),De]})]})]})})};export{rr as default};
