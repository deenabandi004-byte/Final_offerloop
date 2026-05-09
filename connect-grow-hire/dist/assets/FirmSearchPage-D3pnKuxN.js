import{r as i,j as e,x as ge,cf as xt,L as ye,l as Ye,u as gt,f as yt,ag as Fe,an as bt,aM as Oe,X as wt,cg as vt,a1 as jt,ap as St}from"./vendor-react-4vhOoxV2.js";import{f as Ft,A as kt,g as At}from"./AppHeader-BaS4EV4t.js";import{T as Ct,c as Ue}from"./tabs--0M-Qw8K.js";import{u as Et,C as Nt,b as G,t as A,B as ke,L as Bt}from"./index-nGYglU4-.js";import{V as Rt}from"./VideoDemo-B0o_1y4T.js";import{A as He,a as $e,b as We,c as _e,d as Ke,e as qe,f as Ve,g as Ge}from"./alert-dialog-BobWfG3D.js";import{M as Tt}from"./MainContentWrapper-Bjbr27l2.js";import{S as zt}from"./StickyCTA-CoCJ97vL.js";import{D as It}from"./devPreview-BKaiNRnB.js";import{a as Je}from"./universityUtils-IWoHoM4I.js";import{i as Lt,a as Dt,b as Pt}from"./suggestionChips-CBa5dcmh.js";import{f as Mt}from"./firebaseApi-C29wMDl4.js";const D="'IBM Plex Mono', monospace",Ae=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Ce=40,Ee=32;function Ot({firms:k,onViewContacts:M,onDelete:le,deletingId:z}){const[O,be]=i.useState("name"),[v,p]=i.useState("desc"),[U,b]=i.useState(""),[N,te]=i.useState(k),[w,B]=i.useState(new Set),[f,P]=i.useState(null),g=i.useRef(null);i.useEffect(()=>{if(!U.trim()){te(k);return}const r=k.filter(d=>{var m,j,I,c,L;const a=U.toLowerCase();return((m=d.name)==null?void 0:m.toLowerCase().includes(a))||((j=d.industry)==null?void 0:j.toLowerCase().includes(a))||((c=(I=d.location)==null?void 0:I.display)==null?void 0:c.toLowerCase().includes(a))||((L=d.website)==null?void 0:L.toLowerCase().includes(a))});te(r)},[U,k]);const R=[...N].sort((r,d)=>{var j,I,c,L,he,pe,se,ie;let a,m;switch(O){case"name":a=((j=r.name)==null?void 0:j.toLowerCase())||"",m=((I=d.name)==null?void 0:I.toLowerCase())||"";break;case"location":a=((L=(c=r.location)==null?void 0:c.display)==null?void 0:L.toLowerCase())||"",m=((pe=(he=d.location)==null?void 0:he.display)==null?void 0:pe.toLowerCase())||"";break;case"industry":a=((se=r.industry)==null?void 0:se.toLowerCase())||"",m=((ie=d.industry)==null?void 0:ie.toLowerCase())||"";break;default:return 0}return a<m?v==="asc"?-1:1:a>m?v==="asc"?1:-1:0}),Be=r=>{O===r?p(v==="asc"?"desc":"asc"):(be(r),p("desc"))},J=r=>{var d;return r.id||`${r.name}-${(d=r.location)==null?void 0:d.display}`},ce=()=>{w.size===N.length?B(new Set):B(new Set(N.map(r=>J(r))))},y=r=>{B(d=>{const a=new Set(d);return a.has(r)?a.delete(r):a.add(r),a})},de=()=>{if(!f)return"A1";const r=Ae.find(m=>m.key===f.col),d=(r==null?void 0:r.letter)||"A",a=R.findIndex(m=>J(m)===f.firmKey);return`${d}${a>=0?a+1:1}`},re=()=>{var d;if(!f)return"";const r=R.find(a=>J(a)===f.firmKey);if(!r)return"";switch(f.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((d=r.location)==null?void 0:d.display)||"";case"industry":return r.industry||"";default:return""}},Y={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:D,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{g.current&&!g.current.contains(r.target)&&P(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(ge,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:U,onChange:r=>b(r.target.value),style:{fontFamily:D,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[N.length," firm",N.length!==1?"s":"",U&&` of ${k.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:D},children:de()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:D,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:D,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:re()})]}),e.jsx("div",{ref:g,style:{flex:1,overflow:"auto"},children:N.length===0&&k.length>0&&U?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:D},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>b(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:D},children:"Clear search"})]}):N.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:D},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ce,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:Ee,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Ae.map(r=>{const d=(f==null?void 0:f.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:d?"#2a2a2a":"#999",fontWeight:d?500:400,background:d?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ce,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:Ee,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:N.length>0&&w.size===N.length,onChange:ce,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Ae.map(r=>{const d=(f==null?void 0:f.col)===r.key,a=Y[r.key];return e.jsxs("th",{onClick:a?()=>Be(a):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:d?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:a?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,a&&O===a&&(v==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:R.map((r,d)=>{var I;const a=J(r),m=w.has(a),j=c=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(f==null?void 0:f.firmKey)===a&&(f==null?void 0:f.col)===c?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:m?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:c=>{m||(c.currentTarget.style.background="#f5f5f3")},onMouseLeave:c=>{c.currentTarget.style.background=m?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Ce,textAlign:"center",fontSize:10,color:m?"#fff":"#999",background:m?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:c=>{m||(c.currentTarget.style.background="#f0f0ee",c.currentTarget.style.color="#555")},onMouseLeave:c=>{m||(c.currentTarget.style.background="#ffffff",c.currentTarget.style.color="#999")},children:d+1}),e.jsx("td",{style:{width:Ee,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:m,onChange:()=>y(a),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>P({firmKey:a,col:"name"}),style:j("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||"—"})}),e.jsx("td",{onClick:()=>P({firmKey:a,col:"website"}),style:j("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>P({firmKey:a,col:"linkedin"}),style:j("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl.startsWith("http")?r.linkedinUrl:`https://${r.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>P({firmKey:a,col:"location"}),style:j("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((I=r.location)==null?void 0:I.display)||"—"})}),e.jsx("td",{onClick:()=>P({firmKey:a,col:"industry"}),style:j("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>M(r),style:{fontFamily:D,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:[e.jsx(xt,{className:"h-3 w-3"})," View"]}),le&&e.jsx("button",{onClick:()=>le(r),disabled:z===a,style:{background:"none",border:"none",color:"#bbb",cursor:z===a?"wait":"pointer",padding:3},onMouseEnter:c=>{c.currentTarget.style.color="#c00"},onMouseLeave:c=>{c.currentTarget.style.color="#bbb"},children:z===a?e.jsx(ye,{className:"h-3 w-3 animate-spin"}):e.jsx(Ye,{className:"h-3 w-3"})})]})})]},a)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:D},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[R.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const Ut=({item:k,onSelect:M})=>e.jsxs("button",{type:"button",onClick:()=>M(k.prompt),className:"prompt-card",style:{display:"flex",flexDirection:"column",background:"#fff",border:"1px solid #E5E3DE",borderRadius:8,padding:14,minHeight:88,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"border-color .15s ease, transform .15s ease",width:"100%"},children:[e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:15,lineHeight:1.4,color:"var(--ink, #111418)",flex:1},children:["“",k.prompt,"”"]}),e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:9.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8A8F97",marginTop:"auto",paddingTop:8},children:k.hint}),e.jsx("style",{children:`
        .prompt-card:hover {
          border-color: #1B2A44 !important;
          transform: translateY(-1px);
        }
        .prompt-card:focus-visible {
          outline: 2px solid var(--st-accent, #1B2A44);
          outline-offset: 2px;
        }
      `})]}),Ne="scout_auto_populate";function Ht(k){return["Netflix hiring managers in LA",k?`${k} grads at McKinsey`:"Top grads at McKinsey","AI startups hiring data scientists","Boutique banks in New York","Gaming studios in Los Angeles"]}const tr=({embedded:k=!1,initialTab:M,isDevPreview:le=!1})=>{const z=gt(),O=yt(),{user:be,checkCredits:v}=Et(),p=le?It:be,{openPanelWithSearchHelp:U}=Nt(),b=p||{credits:0,tier:"free"},N=i.useMemo(()=>Je(p==null?void 0:p.university),[p]),te=i.useMemo(()=>Ht(N),[N]),[w,B]=i.useState(""),[f,P]=i.useState(!1),[g,R]=i.useState([]),[Be,J]=i.useState(null),[ce,y]=i.useState(null),[de,re]=i.useState([]),[Y,r]=i.useState(!1),[d,a]=i.useState(null),[m,j]=i.useState(!1),[I,c]=i.useState(!1),[L,he]=i.useState([]),[pe,se]=i.useState(!1),ie=i.useRef(null),[H,fe]=i.useState(M||"firm-search");i.useEffect(()=>{M&&fe(M)},[M]);const[we,ve]=i.useState(!1),[Xe,Re]=i.useState(null),[Qe,je]=i.useState(!1),[Ze,Se]=i.useState(!1),et=i.useRef([]),X=i.useRef(new Set),[S,tt]=i.useState(10),[Q]=i.useState(5),rt=i.useRef(null),[st,it]=i.useState(0),[ot,Te]=i.useState(!0),[$,ze]=i.useState(!1);i.useEffect(()=>{if($||w)return;const t=setInterval(()=>{Te(!1),setTimeout(()=>{it(s=>(s+1)%te.length),Te(!0)},300)},3e3);return()=>clearInterval(t)},[$,w]);const nt=!w&&!$,Ie=i.useRef(!1),[at,Le]=i.useState([]),[ue,De]=i.useState(!1),[Pe,lt]=i.useState(null);i.useEffect(()=>{if(!(p!=null&&p.uid)||Ie.current)return;Ie.current=!0,(async()=>{try{const s=await Mt.getUserOnboardingData(p.uid),u=Je(s.university);lt(u||null);const l={firstName:s.firstName,university:s.university,graduationYear:s.graduationYear,targetIndustries:s.targetIndustries,preferredLocations:s.preferredLocations,dreamCompanies:s.dreamCompanies,careerTrack:s.careerTrack,preferredJobRole:s.preferredJobRole,targetFirms:s.targetFirms||[],extractedRoles:s.extractedRoles||[],directionNarrative:s.directionNarrative||"",personalContext:s.personalContext||""};Lt(l)?(Le(Pt()),De(!1)):(Le(Dt(l)),De(!0))}catch(s){console.error("Failed to build archive list:",s)}})()},[p==null?void 0:p.uid]);const K=w.trim().length>=5;i.useEffect(()=>{v&&p&&v()},[S,v,p]),i.useEffect(()=>{et.current=g},[g]),i.useEffect(()=>{const t=u=>{const{industry:l,location:h,size:o}=u;let n="";l&&(n+=l),h&&(n+=(n?" in ":"")+h),o&&(n+=(n?", ":"")+o),n&&(B(n),A({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},s=()=>{var u;try{const l=(u=O.state)==null?void 0:u.scoutAutoPopulate;if((l==null?void 0:l.search_type)==="firm"){t(l),sessionStorage.removeItem(Ne),z(O.pathname,{replace:!0,state:{}});return}const h=sessionStorage.getItem(Ne);if(h){const o=JSON.parse(h);let n;o.search_type==="firm"&&(o.auto_populate?n=o.auto_populate:n=o,t(n),sessionStorage.removeItem(Ne))}}catch(l){console.error("[Scout] Auto-populate error:",l)}};return s(),window.addEventListener("scout-auto-populate",s),()=>window.removeEventListener("scout-auto-populate",s)},[O.state,O.pathname,z]);const q=i.useRef(new Set),W=i.useCallback(async()=>{if(!p){ve(!1);return}ve(!0);try{const t=await G.getFirmSearchHistory(100,!0),s=[],u=new Set,l=new Set;t.forEach(o=>{o.results&&Array.isArray(o.results)&&o.results.forEach(n=>{var T;if(n.id&&X.current.has(n.id)||n.id&&q.current.has(n.id))return;const x=n.id||`${n.name}-${(T=n.location)==null?void 0:T.display}`;n.id?u.has(n.id)||(u.add(n.id),s.push(n)):l.has(x)||(l.add(x),s.push(n))})});const h=s.filter(o=>!(o.id&&X.current.has(o.id)));q.current.size>0&&q.current.clear(),R(h)}catch(t){console.error("Failed to load saved firms:",t),A({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{ve(!1)}},[p]),me=i.useCallback(async()=>{if(p){se(!0);try{const t=await G.getFirmSearchHistory(10);he(t)}catch(t){console.error("Failed to load search history:",t)}finally{se(!1)}}},[p]);i.useEffect(()=>{me(),v&&v()},[me,v]);const xe=i.useRef(!1);i.useEffect(()=>{if(H!=="firm-library"){xe.current=!1;return}p&&(xe.current||(xe.current=!0,W()))},[H,p,W]);const oe=async t=>{var o;const s=t||w;if(!s.trim()){y("Please enter a search query");return}if(!p){y("Please sign in to search for firms"),A({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}P(!0),y(null),r(!0),j(!1);const u=2+Math.ceil(S/5)*2,l=u<60?`${u} seconds`:`${Math.ceil(u/60)} minutes`;a({current:0,total:S,step:`Starting search... (est. ${l})`});let h=null;try{const{searchId:n}=await G.searchFirmsAsync(s,S);h=await G.createFirmSearchStream(n),await new Promise((x,T)=>{h.addEventListener("progress",E=>{try{const C=JSON.parse(E.data);a({current:C.current??0,total:C.total??S,step:C.step||"Searching..."})}catch{}}),h.addEventListener("complete",E=>{var C,_;Z=!0,h==null||h.close();try{const F=JSON.parse(E.data);a(null),F.success&&((C=F.firms)==null?void 0:C.length)>0?(J(F.parsedFilters),R(F.firms),j(!0),re(F.suggestions||[]),A({title:"Search Complete!",description:`Found ${F.firms.length} firm${F.firms.length!==1?"s":""}. Used ${F.creditsCharged||0} credits.`}),v&&v(),me()):((_=F.firms)==null?void 0:_.length)===0?(re(F.suggestions||[]),y("Hmm, nothing matched that exactly. Try broadening to just the city or industry — or ask Scout."),U({searchType:"firm",failedSearchParams:{industry:s,location:"",size:""},errorType:"no_results"})):y(F.error||"Search failed. Please try again.")}catch{y("Failed to parse search results.")}x()}),h.addEventListener("error",E=>{Z=!0,h==null||h.close();try{const C=JSON.parse(E.data);y(C.message||"Search failed.")}catch{y("Search connection lost. Please try again.")}x()});let Z=!1;h.onerror=()=>{if(Z)return;Z=!0,h==null||h.close();const E=setInterval(async()=>{var C,_,F;try{const ee=await G.getFirmSearchStatus(n);((C=ee.progress)==null?void 0:C.status)==="completed"?(clearInterval(E),a(null),v&&v(),me(),W(),j(!0),A({title:"Search Complete!",description:"Results loaded from history."}),x()):((_=ee.progress)==null?void 0:_.status)==="failed"&&(clearInterval(E),y(((F=ee.progress)==null?void 0:F.error)||"Search failed."),x())}catch{clearInterval(E),y("Search connection lost. Please check your search history for results."),x()}},2e3);setTimeout(()=>{clearInterval(E),y("Search is taking longer than expected. Check your history for results."),x()},12e4)}})}catch(n){if(console.error("Search error:",n),n.status===401||(o=n.message)!=null&&o.includes("Authentication required"))y("Authentication required. Please sign in again."),A({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(n.status===402||n.error_code==="INSUFFICIENT_CREDITS"){const x=n.creditsNeeded||n.required||S*Q,T=n.currentCredits||n.available||b.credits||0;y(`Insufficient credits. You need ${x} but have ${T}.`),A({title:"Insufficient Credits",description:`Need ${x}, have ${T}.`,variant:"destructive"}),v&&await v()}else n.status===502||n.error_code==="EXTERNAL_API_ERROR"?(y(n.message||"Search service temporarily unavailable."),A({title:"Service Unavailable",description:n.message||"Try again shortly.",variant:"destructive"})):(y(n.message||"An unexpected error occurred."),A({title:"Search Failed",description:n.message||"Please try again.",variant:"destructive"}))}finally{h==null||h.close(),P(!1),a(null)}},ct=t=>{var u,l;const s=new URLSearchParams;if(s.set("company",t.name),(u=t.location)!=null&&u.display)s.set("location",t.location.display);else if((l=t.location)!=null&&l.city){const h=[t.location.city,t.location.state,t.location.country].filter(Boolean);s.set("location",h.join(", "))}z(`/find?${s.toString()}`)},ne=t=>{var s;return t.id||`${t.name}-${(s=t.location)==null?void 0:s.display}`},dt=async t=>{const s=ne(t);Re(s);try{t.id&&(X.current.add(t.id),q.current.add(t.id)),R(l=>l.filter(o=>t.id&&o.id?o.id!==t.id:ne(o)!==s));const u=await G.deleteFirm(t);if(u.success){if(u.deletedCount===0){t.id&&(X.current.delete(t.id),q.current.delete(t.id)),R(l=>l.some(o=>t.id&&o.id?o.id===t.id:ne(o)===s)?l:[...l,t]),A({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}A({title:"Firm deleted",description:"Removed from your Firm Library."}),H==="firm-library"&&setTimeout(async()=>{try{await W()}catch(l){console.error("Error reloading firms:",l)}},1500)}else throw t.id&&(X.current.delete(t.id),q.current.delete(t.id)),R(l=>l.some(o=>t.id&&o.id?o.id===t.id:ne(o)===s)?l:[...l,t]),new Error(u.error||"Failed to delete firm")}catch(u){console.error("Delete firm error:",u),t.id&&(X.current.delete(t.id),q.current.delete(t.id)),R(l=>l.some(o=>t.id&&o.id?o.id===t.id:ne(o)===s)?l:[...l,t]),A({title:"Delete failed",description:u instanceof Error?u.message:"Please try again.",variant:"destructive"})}finally{Re(null)}},ht=async()=>{const t=g.length;je(!1);try{const s=g.map(o=>G.deleteFirm(o)),l=(await Promise.allSettled(s)).filter(o=>o.status==="fulfilled"&&o.value.success&&(o.value.deletedCount||0)>0).length,h=t-l;h===0?(R([]),A({title:"All firms deleted",description:`Removed ${l} firm${l!==1?"s":""} from your Firm Library.`}),H==="firm-library"&&setTimeout(async()=>{try{await W()}catch(o){console.error("Error reloading firms:",o)}},1e3)):(A({title:"Partial deletion",description:`Deleted ${l} of ${t} firms. ${h} failed.`,variant:"default"}),H==="firm-library"&&setTimeout(async()=>{try{await W()}catch(o){console.error("Error reloading firms:",o)}},1e3))}catch(s){console.error("Error deleting all firms:",s),A({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),H==="firm-library"&&setTimeout(async()=>{try{await W()}catch(u){console.error("Error reloading firms:",u)}},1e3)}},pt=t=>{B(t.query),c(!1)},ft=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),oe())},ut=()=>{if(b.tier==="free"){Se(!0);return}if(!g||g.length===0)return;const s=["Company Name","Website","LinkedIn","Location","Industry"].join(","),u=g.map(x=>{var E,C,_,F;const T=ee=>{if(!ee)return"";const ae=String(ee);return ae.includes(",")||ae.includes('"')||ae.includes(`
`)?`"${ae.replace(/"/g,'""')}"`:ae},Z=((E=x.location)==null?void 0:E.display)||[(C=x.location)==null?void 0:C.city,(_=x.location)==null?void 0:_.state,(F=x.location)==null?void 0:F.country].filter(Boolean).join(", ");return[T(x.name),T(x.website),T(x.linkedinUrl),T(Z),T(x.industry)].join(",")}),l=[s,...u].join(`
`),h=new Blob([l],{type:"text/csv;charset=utf-8;"}),o=document.createElement("a"),n=URL.createObjectURL(h);o.setAttribute("href",n),o.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),o.style.visibility="hidden",document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(n)},mt=()=>{Se(!1),z("/pricing")},V=((b==null?void 0:b.tier)==="pro"?"pro":"free")==="free"?10:15,Me=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(Ct,{value:H,onValueChange:fe,className:"w-full",children:[e.jsxs(Ue,{value:"firm-search",className:"mt-0",children:[!p&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(Fe,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",background:$?"#fff":"var(--warm-surface, #FAF9F6)",border:$?"1.5px solid #2563EB":"1.5px solid var(--warm-border, #E8E4DE)",boxShadow:$?"0 0 0 4px rgba(37,99,235,0.12)":"none",borderRadius:14,transition:"all .15s",minHeight:56},children:[e.jsx(ge,{style:{width:16,height:16,flexShrink:0,color:"#3B82F6",marginTop:1}}),e.jsxs("div",{style:{flex:1,position:"relative",minWidth:0},children:[e.jsx("input",{ref:rt,value:w,onChange:t=>B(t.target.value),onKeyDown:ft,onFocus:()=>ze(!0),onBlur:()=>{w||ze(!1)},disabled:f||!p,style:{width:"100%",border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}}),nt&&e.jsxs("div",{style:{position:"absolute",top:0,left:0,right:0,pointerEvents:"none",fontSize:14,fontFamily:"inherit",lineHeight:1.5,color:"var(--warm-ink-tertiary, #9C9590)",opacity:ot?1:0,transition:"opacity 0.3s ease",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:["Try: ",te[st]]})]})]})}),e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.12em",color:"#8A8F97",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx("span",{style:{fontSize:11,color:"#8A8F97",minWidth:12},children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",style:{flex:1,position:"relative",height:4,background:"#E5E3DE",borderRadius:2},children:[e.jsx("div",{style:{position:"absolute",left:0,top:0,height:4,width:V>5?`${(S-5)/(V-5)*100}%`:"0%",background:"var(--accent, #1B2A44)",borderRadius:2}}),e.jsx("input",{type:"range",min:5,max:V,step:1,value:S,onChange:t=>tt(Math.min(Number(t.target.value),V)),disabled:f,className:"slider-custom","aria-label":"Number of companies to find",style:{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}),e.jsx("div",{style:{position:"absolute",left:`calc(${V>5?(S-5)/(V-5)*100:0}% - 7px)`,top:-5,width:14,height:14,borderRadius:"50%",background:"var(--accent, #1B2A44)",boxShadow:"0 1px 4px rgba(27,42,68,0.4)",pointerEvents:"none"}})]}),e.jsx("span",{style:{fontSize:11,color:"#8A8F97",minWidth:16,textAlign:"right"},children:V})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:9},children:[e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:13.5,color:"#111418"},children:["Find ",S," companies"]}),e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#4A4F57"},children:[e.jsxs("span",{style:{display:"inline-flex",padding:"3px 8px",background:"#FAFAF8",border:"1px solid #E5E3DE",borderRadius:4,fontFamily:"'JetBrains Mono', monospace",fontSize:10,color:"#111418"},children:[S*Q," credits"]}),e.jsxs("span",{style:{color:"#8A8F97"},children:["of ",b.credits??0]})]})]}),b.credits!==void 0&&b.credits<S*Q&&e.jsxs("p",{style:{fontSize:11,color:"#D97706",marginTop:6,display:"flex",alignItems:"center",gap:4},children:[e.jsx(Fe,{style:{width:12,height:12}}),"Insufficient credits. Need ",S*Q,", have ",b.credits,"."]})]}),e.jsx("button",{ref:ie,onClick:()=>oe(),disabled:!K||f||!p||(b.credits??0)<S*Q||(b.credits??0)===0,style:{width:"100%",height:52,borderRadius:12,background:f?"var(--warm-border, #E8E4DE)":!w.trim()||!K||!p?"transparent":"var(--ink, #1A1D23)",color:f?"var(--warm-ink-tertiary, #9C9590)":!w.trim()||!K||!p?"#6B6560":"var(--paper, #FFFFFF)",border:(!w.trim()||!K||!p)&&!f?"1.5px solid #D5D0C9":"1.5px solid transparent",fontSize:15,fontWeight:600,cursor:f?"not-allowed":w.trim()&&K?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s ease",fontFamily:"inherit",marginBottom:Y?0:8},children:f?e.jsxs(e.Fragment,{children:[e.jsx(ye,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(ge,{style:{width:14,height:14}}),e.jsxs("span",{children:["Find ",S," companies"]})]})}),w&&!K&&!Y&&e.jsx("p",{style:{fontSize:11,color:"#8A8F97",marginTop:6,textAlign:"center"},children:"Include an industry and location for best results"}),ce&&e.jsxs("div",{style:{padding:"10px 14px",marginTop:12,background:"#FEF2F2",color:"#991B1B",fontSize:13,borderRadius:6,display:"flex",alignItems:"center",gap:8,border:"1px solid #FECACA"},children:[e.jsx(Fe,{style:{width:14,height:14,flexShrink:0}}),ce]}),de.length>0&&e.jsx("div",{style:{display:"flex",gap:8,flexWrap:"wrap",marginTop:12},children:de.map((t,s)=>e.jsx("button",{onClick:()=>{t.query&&(B(t.query),y(null),re([]))},style:{padding:"7px 12px",background:"#fff",border:"1px solid #E2E8F0",borderRadius:6,fontSize:12,color:"#3B82F6",cursor:"pointer",fontWeight:500},children:t.label},s))}),Y&&e.jsx("button",{type:"button",onClick:()=>{B(""),r(!1),y(null)},style:{fontSize:12,color:"#8A8F97",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"12px 0 0",transition:"color .12s"},onMouseEnter:t=>{t.currentTarget.style.color="var(--accent, #1B2A44)"},onMouseLeave:t=>{t.currentTarget.style.color="#8A8F97"},children:"← Back to recommendations"}),!Y&&!f&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{height:36}}),e.jsxs("div",{style:{opacity:$&&w.trim()?.4:1,transition:"opacity .15s"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12},children:[e.jsxs("div",{children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.14em",color:"#8A8F97",textTransform:"uppercase",marginBottom:4},children:ue?"Built from your profile":"Curated by Offerloop"}),e.jsx("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontSize:22,lineHeight:1.2,color:"#111418",fontWeight:400},children:ue?e.jsxs(e.Fragment,{children:["Six places to look first, ",e.jsx("em",{style:{fontStyle:"italic",color:"#4A4F57"},children:Pe?`${Pe} finance.`:"your field."})]}):e.jsxs(e.Fragment,{children:["Six strong ",e.jsx("em",{style:{fontStyle:"italic",color:"#4A4F57"},children:"starting points."})]})})]}),ue?e.jsx("a",{onClick:()=>z("/account-settings"),style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.1em",color:"#4A4F57",textDecoration:"none",whiteSpace:"nowrap",cursor:"pointer"},children:"Update preferences ↗"}):e.jsx("a",{onClick:()=>z("/onboarding"),style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.1em",color:"#4A4F57",textDecoration:"none",whiteSpace:"nowrap",cursor:"pointer"},children:"Tell us about yourself ↗"})]}),!ue&&e.jsx("div",{style:{background:"#FAFAF8",border:"1px solid #EFEDE8",borderRadius:8,padding:"10px 14px",marginBottom:14,fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:13,color:"#4A4F57"},children:"Add your school and target industries to get prompts shaped around you."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:10,marginBottom:40},className:"max-sm:!grid-cols-1",children:at.map(t=>e.jsx(Ut,{item:{prompt:t.prompt,hint:t.hint},onSelect:s=>{B(s),oe(s)}},t.id))})]}),L.length>0&&e.jsxs("div",{style:{opacity:($&&w.trim(),1),transition:"opacity .15s"},children:[e.jsx("div",{style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12},children:e.jsxs("div",{children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.14em",color:"#8A8F97",textTransform:"uppercase",marginBottom:4},children:"Your recent searches"}),e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontSize:22,lineHeight:1.2,color:"#111418",fontWeight:400},children:["Pick up where ",e.jsx("em",{style:{fontStyle:"italic",color:"#4A4F57"},children:"you left off."})]})]})}),L.slice(0,5).map((t,s)=>e.jsxs("div",{onClick:()=>{B(t.query),oe(t.query)},style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",padding:"10px 0",borderTop:"1px solid #EFEDE8",cursor:"pointer",transition:"background .12s"},children:[e.jsxs("div",{style:{fontSize:13,color:"#4A4F57"},children:[e.jsx("span",{style:{color:"#8A8F97",marginRight:6},children:e.jsx(ge,{style:{width:12,height:12,display:"inline",verticalAlign:"middle"}})}),t.query]}),e.jsxs("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.08em",color:"#8A8F97",whiteSpace:"nowrap",marginLeft:12},children:[t.resultsCount," ",t.resultsCount===1?"result":"results"]})]},t.id))]})]})]})]}),e.jsx(Ue,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[g.length," ",g.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(ke,{onClick:()=>{xe.current=!1,W()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:we,children:[we?e.jsx(ye,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),g.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(ke,{onClick:()=>je(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Ye,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(ke,{onClick:ut,className:`gap-2 ${b.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:b.tier==="free",title:b.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(bt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),we?e.jsx(Bt,{variant:"card",count:3}):g.length>0?e.jsx(Ot,{firms:g,onViewContacts:ct,onDelete:dt,deletingId:Xe}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx(Oe,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>fe("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),I&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>c(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(wt,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:pe?e.jsx("div",{className:"py-8 text-center",children:e.jsx(ye,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):L.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(vt,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):L.map(t=>e.jsxs("div",{onClick:()=>pt(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:s=>{s.currentTarget.style.background="#EEF2F8"},onMouseLeave:s=>{s.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(jt,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),f&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx(Oe,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(d==null?void 0:d.step)||`Finding ${S} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:d?`${Math.max(2,Math.min(98,d.current/d.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:d?`${d.current} of ${d.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:d?`${Math.round(d.current/d.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),m&&g.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(St,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",g.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{j(!1),fe("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{j(!1),B(""),r(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(He,{open:Qe,onOpenChange:je,children:e.jsxs($e,{children:[e.jsxs(We,{children:[e.jsx(_e,{children:"Delete All Companies?"}),e.jsxs(Ke,{children:["This will permanently remove all ",g.length," ",g.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(qe,{children:[e.jsx(Ve,{children:"Cancel"}),e.jsx(Ge,{onClick:ht,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(He,{open:Ze,onOpenChange:Se,children:e.jsxs($e,{children:[e.jsxs(We,{children:[e.jsx(_e,{children:"Upgrade to Export CSV"}),e.jsx(Ke,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(qe,{children:[e.jsx(Ve,{children:"Cancel"}),e.jsx(Ge,{onClick:mt,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),H==="firm-search"&&e.jsx(zt,{originalButtonRef:ie,onClick:()=>oe(),isLoading:f,disabled:!K||f||!p||(b.credits??0)<S*Q,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return k?Me:e.jsx(Ft,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(kt,{}),e.jsxs(Tt,{children:[e.jsx(At,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Rt,{videoId:"n_AYHEJSXrE"})})]}),Me]})]})]})})};export{tr as default};
