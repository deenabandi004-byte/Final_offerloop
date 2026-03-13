import{b0 as pt,b1 as gt,r as a,j as e,b2 as bt,b3 as Ke,b4 as Ve,b5 as Ye,b6 as Xe,b7 as Qe,I as Ge,b8 as Je,b9 as Ze,ba as et,$ as Fe,bb as tt,bc as yt,a5 as rt,bd as wt,L as ae,l as st,u as jt,f as vt,aI as we,a4 as he,be as je,bf as Nt,q as St,ad as kt,X as Ct,ah as Ft}from"./vendor-react-DqoqxcGQ.js";import{S as At,A as Et,a as Tt}from"./AppHeader-41GxEBs3.js";import{T as It,c as Pe}from"./tabs-BWhwrjUf.js";import{c as H,u as zt,m as Rt,b as V,t as A,B as ve,h as Dt}from"./index-PQ1ScjVZ.js";import{V as Lt}from"./VideoDemo-CtHihnPJ.js";import{A as Be,a as $e,b as Oe,c as He,d as Ue,e as qe,f as We,g as _e}from"./alert-dialog-D0VTLjD4.js";import{M as Mt}from"./MainContentWrapper-DR6MJoIB.js";import{S as Pt}from"./StickyCTA-WCuaqNjD.js";const Bt=pt,$t=gt,Ot=a.forwardRef(({className:x,inset:g,children:b,...h},v)=>e.jsxs(Qe,{ref:v,className:H("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-blue-600 focus:text-white data-[state=open]:bg-blue-600 data-[state=open]:text-white hover:bg-blue-100 hover:text-blue-900",g&&"pl-8",x),...h,children:[b,e.jsx(Ge,{className:"ml-auto h-4 w-4"})]}));Ot.displayName=Qe.displayName;const Ht=a.forwardRef(({className:x,...g},b)=>e.jsx(Je,{ref:b,className:H("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",x),...g}));Ht.displayName=Je.displayName;const at=a.forwardRef(({className:x,sideOffset:g=4,...b},h)=>e.jsx(bt,{children:e.jsx(Ke,{ref:h,sideOffset:g,className:H("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",x),...b})}));at.displayName=Ke.displayName;const Ae=a.forwardRef(({className:x,inset:g,...b},h)=>e.jsx(Xe,{ref:h,className:H("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",g&&"pl-8",x),...b}));Ae.displayName=Xe.displayName;const Ut=a.forwardRef(({className:x,children:g,checked:b,...h},v)=>e.jsxs(Ze,{ref:v,className:H("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",x),checked:b,...h,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(et,{children:e.jsx(Fe,{className:"h-4 w-4 text-white"})})}),g]}));Ut.displayName=Ze.displayName;const qt=a.forwardRef(({className:x,children:g,...b},h)=>e.jsxs(tt,{ref:h,className:H("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",x),...b,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(et,{children:e.jsx(yt,{className:"h-2 w-2 fill-current text-white"})})}),g]}));qt.displayName=tt.displayName;const it=a.forwardRef(({className:x,inset:g,...b},h)=>e.jsx(Ve,{ref:h,className:H("px-2 py-1.5 text-sm font-semibold",g&&"pl-8",x),...b}));it.displayName=Ve.displayName;const Ee=a.forwardRef(({className:x,...g},b)=>e.jsx(Ye,{ref:b,className:H("-mx-1 my-1 h-px bg-muted",x),...g}));Ee.displayName=Ye.displayName;const B="'IBM Plex Mono', monospace",Ne=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Se=40,ke=32;function Wt({firms:x,onViewContacts:g,onDelete:b,deletingId:h}){const[v,me]=a.useState("name"),[f,$]=a.useState("desc"),[D,E]=a.useState(""),[L,w]=a.useState(x),[z,ie]=a.useState(new Set),[j,O]=a.useState(null),S=a.useRef(null);a.useEffect(()=>{if(!D.trim()){w(x);return}const r=x.filter(m=>{var p,T,y,n,P;const o=D.toLowerCase();return((p=m.name)==null?void 0:p.toLowerCase().includes(o))||((T=m.industry)==null?void 0:T.toLowerCase().includes(o))||((n=(y=m.location)==null?void 0:y.display)==null?void 0:n.toLowerCase().includes(o))||((P=m.website)==null?void 0:P.toLowerCase().includes(o))});w(r)},[D,x]);const Y=[...L].sort((r,m)=>{var T,y,n,P,Q,oe,Z,le;let o,p;switch(v){case"name":o=((T=r.name)==null?void 0:T.toLowerCase())||"",p=((y=m.name)==null?void 0:y.toLowerCase())||"";break;case"location":o=((P=(n=r.location)==null?void 0:n.display)==null?void 0:P.toLowerCase())||"",p=((oe=(Q=m.location)==null?void 0:Q.display)==null?void 0:oe.toLowerCase())||"";break;case"industry":o=((Z=r.industry)==null?void 0:Z.toLowerCase())||"",p=((le=m.industry)==null?void 0:le.toLowerCase())||"";break;default:return 0}return o<p?f==="asc"?-1:1:o>p?f==="asc"?1:-1:0}),ne=r=>{v===r?$(f==="asc"?"desc":"asc"):(me(r),$("desc"))},k=r=>{var m;return r.id||`${r.name}-${(m=r.location)==null?void 0:m.display}`},U=()=>{z.size===L.length?ie(new Set):ie(new Set(L.map(r=>k(r))))},ue=r=>{ie(m=>{const o=new Set(m);return o.has(r)?o.delete(r):o.add(r),o})},q=()=>{if(!j)return"A1";const r=Ne.find(p=>p.key===j.col),m=(r==null?void 0:r.letter)||"A",o=Y.findIndex(p=>k(p)===j.firmKey);return`${m}${o>=0?o+1:1}`},fe=()=>{var m;if(!j)return"";const r=Y.find(o=>k(o)===j.firmKey);if(!r)return"";switch(j.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((m=r.location)==null?void 0:m.display)||"";case"industry":return r.industry||"";default:return""}},X={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:B,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{S.current&&!S.current.contains(r.target)&&O(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(rt,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:D,onChange:r=>E(r.target.value),style:{fontFamily:B,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[L.length," firm",L.length!==1?"s":"",D&&` of ${x.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:B},children:q()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:B,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:B,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:fe()})]}),e.jsx("div",{ref:S,style:{flex:1,overflow:"auto"},children:L.length===0&&x.length>0&&D?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:B},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>E(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:B},children:"Clear search"})]}):L.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:B},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Se,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Ne.map(r=>{const m=(j==null?void 0:j.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:m?"#2a2a2a":"#999",fontWeight:m?500:400,background:m?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Se,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:L.length>0&&z.size===L.length,onChange:U,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Ne.map(r=>{const m=(j==null?void 0:j.col)===r.key,o=X[r.key];return e.jsxs("th",{onClick:o?()=>ne(o):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:m?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:o?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,o&&v===o&&(f==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:Y.map((r,m)=>{var y;const o=k(r),p=z.has(o),T=n=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(j==null?void 0:j.firmKey)===o&&(j==null?void 0:j.col)===n?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:p?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:n=>{p||(n.currentTarget.style.background="#f5f5f3")},onMouseLeave:n=>{n.currentTarget.style.background=p?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Se,textAlign:"center",fontSize:10,color:p?"#fff":"#999",background:p?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:n=>{p||(n.currentTarget.style.background="#f0f0ee",n.currentTarget.style.color="#555")},onMouseLeave:n=>{p||(n.currentTarget.style.background="#ffffff",n.currentTarget.style.color="#999")},children:m+1}),e.jsx("td",{style:{width:ke,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:p,onChange:()=>ue(o),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"name"}),style:T("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"website"}),style:T("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:n=>n.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"linkedin"}),style:T("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl,target:"_blank",rel:"noopener noreferrer",onClick:n=>n.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"location"}),style:T("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((y=r.location)==null?void 0:y.display)||"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"industry"}),style:T("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>g(r),style:{fontFamily:B,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:[e.jsx(wt,{className:"h-3 w-3"})," View"]}),b&&e.jsx("button",{onClick:()=>b(r),disabled:h===o,style:{background:"none",border:"none",color:"#bbb",cursor:h===o?"wait":"pointer",padding:3},onMouseEnter:n=>{n.currentTarget.style.color="#c00"},onMouseLeave:n=>{n.currentTarget.style.color="#bbb"},children:h===o?e.jsx(ae,{className:"h-3 w-3 animate-spin"}):e.jsx(st,{className:"h-3 w-3"})})]})})]},o)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:B},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[Y.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const _t=[{id:1,label:"Tech startups in SF",query:"Early-stage tech startups in San Francisco focused on AI/ML"},{id:2,label:"Healthcare M&A banks",query:"Mid-sized investment banks in New York focused on healthcare M&A"},{id:3,label:"Consulting in Chicago",query:"Management consulting firms in Chicago with 100-500 employees"},{id:4,label:"Fintech in London",query:"Series B+ fintech companies in London focused on payments"}],Ce="scout_auto_populate",Kt=[{value:5},{value:10},{value:20},{value:40}],rr=({embedded:x=!1})=>{const g=jt(),b=vt(),{user:h,checkCredits:v}=zt(),{openPanelWithSearchHelp:me}=Rt(),f=h||{credits:0,tier:"free"},[$,D]=a.useState(""),[E,L]=a.useState(!1),[w,z]=a.useState([]),[ie,j]=a.useState(null),[O,S]=a.useState(null),[Y,ne]=a.useState(!1),[k,U]=a.useState(null),[ue,q]=a.useState(!1),[fe,X]=a.useState(!1),[r,m]=a.useState([]),[o,p]=a.useState(!1),T=a.useRef(null),[y,n]=a.useState("firm-search"),[P,Q]=a.useState(!1),[oe,Z]=a.useState(null),[le,xe]=a.useState(!1),[nt,pe]=a.useState(!1),Te=a.useRef([]),G=a.useRef(new Set),[F,ot]=a.useState(10),[W]=a.useState(5),[lt,ge]=a.useState(null),be=a.useRef(null),Ie=/\b(tech(nology)?|fintech|finance|banking|consulting|healthcare|pharma|biotech|energy|legal|law|real estate|insurance|media|advertising|marketing|retail|e-?commerce|education|edtech|telecom|manufacturing|automotive|aerospace|defense|crypto|blockchain|saas|ai|artificial intelligence|machine learning|data|analytics|cybersecurity|cloud|devops|enterprise|logistics|supply chain|food|agri(culture)?|hospitality|travel|gaming|entertainment|sports|venture capital|private equity|investment|wealth management|asset management|accounting|audit|tax|compliance|government|nonprofit|sustainability|cleantech|construction|architecture|design|fashion|beauty|fitness|wellness|startup|b2b|b2c|marketplace|platform|software|engineering|recruiting|staffing|hr|human resources)\b/i.test($),ye=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test($),J=$.length>20&&ye;a.useEffect(()=>{v&&h&&v()},[F,v,h]),a.useEffect(()=>{Te.current=w},[w]),a.useEffect(()=>{const t=u=>{const{industry:l,location:c,size:s}=u;let i="";l&&(i+=l),c&&(i+=(i?" in ":"")+c),s&&(i+=(i?", ":"")+s),i&&(D(i),A({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},d=()=>{var u;try{const l=(u=b.state)==null?void 0:u.scoutAutoPopulate;if((l==null?void 0:l.search_type)==="firm"){t(l),sessionStorage.removeItem(Ce),g(b.pathname,{replace:!0,state:{}});return}const c=sessionStorage.getItem(Ce);if(c){const s=JSON.parse(c);let i;s.search_type==="firm"&&(s.auto_populate?i=s.auto_populate:i=s,t(i),sessionStorage.removeItem(Ce))}}catch(l){console.error("[Scout] Auto-populate error:",l)}};return d(),window.addEventListener("scout-auto-populate",d),()=>window.removeEventListener("scout-auto-populate",d)},[b.state,b.pathname,g]);const _=a.useRef(new Set),K=a.useCallback(async()=>{if(!h){Q(!1);return}Q(!0);try{const t=await V.getFirmSearchHistory(100,!0),d=[],u=new Set,l=new Set;t.forEach(s=>{s.results&&Array.isArray(s.results)&&s.results.forEach(i=>{var R;if(i.id&&G.current.has(i.id)||i.id&&_.current.has(i.id))return;const N=i.id||`${i.name}-${(R=i.location)==null?void 0:R.display}`;i.id?u.has(i.id)||(u.add(i.id),d.push(i)):l.has(N)||(l.add(N),d.push(i))})});const c=d.filter(s=>!(s.id&&G.current.has(s.id)));_.current.size>0&&_.current.clear(),z(c),ee.current=!1}catch(t){console.error("Failed to load saved firms:",t),A({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{Q(!1)}},[h]),ce=a.useCallback(async()=>{if(h){p(!0);try{const t=await V.getFirmSearchHistory(10);m(t)}catch(t){console.error("Failed to load search history:",t)}finally{p(!1)}}},[h]);a.useEffect(()=>{ce(),v&&v()},[ce,v]);const ee=a.useRef(!1);a.useEffect(()=>{if(y!=="firm-library"){ee.current=!1;return}h&&(P||ee.current||Te.current.length>0||(ee.current=!0,K()))},[y,h,K,P]);const de=async t=>{var s;const d=$;if(!d.trim()){S("Please enter a search query");return}if(!h){S("Please sign in to search for firms"),A({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}L(!0),S(null),ne(!0),q(!1);const u=2+Math.ceil(F/5)*2,l=u<60?`${u} seconds`:`${Math.ceil(u/60)} minutes`;U({current:0,total:F,step:`Starting search... (est. ${l})`});let c=null;try{const{searchId:i}=await V.searchFirmsAsync(d,F);c=await V.createFirmSearchStream(i),await new Promise((N,R)=>{c.addEventListener("progress",C=>{try{const I=JSON.parse(C.data);U({current:I.current??0,total:I.total??F,step:I.step||"Searching..."})}catch{}}),c.addEventListener("complete",C=>{var I,re;c==null||c.close();try{const M=JSON.parse(C.data);U(null),M.success&&((I=M.firms)==null?void 0:I.length)>0?(j(M.parsedFilters),z(M.firms),q(!0),A({title:"Search Complete!",description:`Found ${M.firms.length} firm${M.firms.length!==1?"s":""}. Used ${M.creditsCharged||0} credits.`}),v&&v(),ce()):((re=M.firms)==null?void 0:re.length)===0?(S("No firms found matching your criteria. Try broadening your search."),me({searchType:"firm",failedSearchParams:{industry:d,location:"",size:""},errorType:"no_results"})):S(M.error||"Search failed. Please try again.")}catch{S("Failed to parse search results.")}N()}),c.addEventListener("error",C=>{c==null||c.close();try{const I=JSON.parse(C.data);S(I.message||"Search failed.")}catch{S("Search connection lost. Please try again.")}N()}),c.onerror=()=>{c==null||c.close(),V.searchFirms(d,F).then(C=>{var I;U(null),C.success&&((I=C.firms)==null?void 0:I.length)>0?(j(C.parsedFilters),z(C.firms),q(!0),A({title:"Search Complete!",description:`Found ${C.firms.length} firms.`}),v&&v(),ce()):S(C.error||"No firms found."),N()}).catch(C=>{R(C)})}})}catch(i){if(console.error("Search error:",i),i.status===401||(s=i.message)!=null&&s.includes("Authentication required"))S("Authentication required. Please sign in again."),A({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(i.status===402||i.error_code==="INSUFFICIENT_CREDITS"){const N=i.creditsNeeded||i.required||F*W,R=i.currentCredits||i.available||f.credits||0;S(`Insufficient credits. You need ${N} but have ${R}.`),A({title:"Insufficient Credits",description:`Need ${N}, have ${R}.`,variant:"destructive"}),v&&await v()}else i.status===502||i.error_code==="EXTERNAL_API_ERROR"?(S(i.message||"Search service temporarily unavailable."),A({title:"Service Unavailable",description:i.message||"Try again shortly.",variant:"destructive"})):(S(i.message||"An unexpected error occurred."),A({title:"Search Failed",description:i.message||"Please try again.",variant:"destructive"}))}finally{c==null||c.close(),L(!1),U(null)}},ct=t=>{var u,l;const d=new URLSearchParams;if(d.set("company",t.name),(u=t.location)!=null&&u.display)d.set("location",t.location.display);else if((l=t.location)!=null&&l.city){const c=[t.location.city,t.location.state,t.location.country].filter(Boolean);d.set("location",c.join(", "))}g(`/find?${d.toString()}`)},te=t=>{var d;return t.id||`${t.name}-${(d=t.location)==null?void 0:d.display}`},dt=async t=>{const d=te(t);Z(d);try{t.id&&(G.current.add(t.id),_.current.add(t.id)),z(l=>l.filter(s=>t.id&&s.id?s.id!==t.id:te(s)!==d));const u=await V.deleteFirm(t);if(u.success){if(u.deletedCount===0){t.id&&(G.current.delete(t.id),_.current.delete(t.id)),z(l=>l.some(s=>t.id&&s.id?s.id===t.id:te(s)===d)?l:[...l,t]),A({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}if(A({title:"Firm deleted",description:"Removed from your Firm Library."}),y==="firm-library"){const l=[1e3,2e3,3e3];for(const c of l)setTimeout(async()=>{try{await K()}catch(s){console.error("Error reloading firms:",s)}},c)}}else throw t.id&&(G.current.delete(t.id),_.current.delete(t.id)),z(l=>l.some(s=>t.id&&s.id?s.id===t.id:te(s)===d)?l:[...l,t]),new Error(u.error||"Failed to delete firm")}catch(u){console.error("Delete firm error:",u),t.id&&(G.current.delete(t.id),_.current.delete(t.id)),z(l=>l.some(s=>t.id&&s.id?s.id===t.id:te(s)===d)?l:[...l,t]),A({title:"Delete failed",description:u instanceof Error?u.message:"Please try again.",variant:"destructive"})}finally{Z(null)}},ht=async()=>{const t=w.length;xe(!1);try{const d=w.map(s=>V.deleteFirm(s)),l=(await Promise.allSettled(d)).filter(s=>s.status==="fulfilled"&&s.value.success&&(s.value.deletedCount||0)>0).length,c=t-l;z([]),c===0?(A({title:"All firms deleted",description:`Removed ${l} firm${l!==1?"s":""} from your Firm Library.`}),y==="firm-library"&&setTimeout(async()=>{try{await K()}catch(s){console.error("Error reloading firms:",s)}},1e3)):(A({title:"Partial deletion",description:`Deleted ${l} of ${t} firms. ${c} failed.`,variant:"default"}),y==="firm-library"&&setTimeout(async()=>{try{await K()}catch(s){console.error("Error reloading firms:",s)}},1e3))}catch(d){console.error("Error deleting all firms:",d),z([]),A({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),y==="firm-library"&&setTimeout(async()=>{try{await K()}catch(u){console.error("Error reloading firms:",u)}},1e3)}},ze=t=>{D(t.query),X(!1)},mt=(t,d)=>{D(t),ge(d),be.current&&(be.current.focus(),setTimeout(()=>{ge(null)},150))},ut=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),de())},ft=()=>{if(f.tier==="free"){pe(!0);return}if(!w||w.length===0)return;const d=["Company Name","Website","LinkedIn","Location","Industry"].join(","),u=w.map(N=>{var I,re,M,Le;const R=Me=>{if(!Me)return"";const se=String(Me);return se.includes(",")||se.includes('"')||se.includes(`
`)?`"${se.replace(/"/g,'""')}"`:se},C=((I=N.location)==null?void 0:I.display)||[(re=N.location)==null?void 0:re.city,(M=N.location)==null?void 0:M.state,(Le=N.location)==null?void 0:Le.country].filter(Boolean).join(", ");return[R(N.name),R(N.website),R(N.linkedinUrl),R(C),R(N.industry)].join(",")}),l=[d,...u].join(`
`),c=new Blob([l],{type:"text/csv;charset=utf-8;"}),s=document.createElement("a"),i=URL.createObjectURL(c);s.setAttribute("href",i),s.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),s.style.visibility="hidden",document.body.appendChild(s),s.click(),document.body.removeChild(s)},xt=()=>{pe(!1),g("/pricing")},Re=((f==null?void 0:f.tier)==="pro"?"pro":"free")==="free"?10:40,De=e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",marginBottom:"16px",marginTop:"-4px"},children:e.jsxs("div",{style:{display:"inline-flex",gap:"6px"},children:[e.jsxs("button",{onClick:()=>n("firm-search"),style:{display:"flex",alignItems:"center",gap:"5px",padding:"5px 12px",borderRadius:"6px",border:y==="firm-search"?"1px solid #CBD5E1":"1px solid transparent",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"12px",fontWeight:500,transition:"all 0.15s ease",background:y==="firm-search"?"#F8FAFC":"transparent",color:y==="firm-search"?"#334155":"#94A3B8"},children:[e.jsx(rt,{className:"h-3 w-3"}),"Find Companies"]}),e.jsxs("button",{onClick:()=>n("firm-library"),style:{display:"flex",alignItems:"center",gap:"5px",padding:"5px 12px",borderRadius:"6px",border:y==="firm-library"?"1px solid #CBD5E1":"1px solid transparent",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"12px",fontWeight:500,transition:"all 0.15s ease",background:y==="firm-library"?"#F8FAFC":"transparent",color:y==="firm-library"?"#334155":"#94A3B8"},children:[e.jsx(we,{className:"h-3 w-3"}),"Company Tracker",w.length>0&&e.jsx("span",{style:{marginLeft:"2px",padding:"1px 6px",borderRadius:"4px",background:"rgba(100, 116, 139, 0.08)",color:"#64748B",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"10px",fontWeight:600,letterSpacing:"0.03em"},children:w.length})]})]})}),e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(It,{value:y,onValueChange:n,className:"w-full",children:[e.jsxs(Pe,{value:"firm-search",className:"mt-0",children:[!h&&e.jsxs("div",{className:"mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-fadeInUp",style:{animationDelay:"150ms"},children:[e.jsx(he,{className:"h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-sm text-amber-700",children:"Please sign in to use Find Companies."})]}),e.jsxs("div",{style:{maxWidth:"680px",margin:"0 auto",animationDelay:"200ms"},className:"w-full px-4 py-2 sm:px-6 animate-fadeInUp firm-search-form-card",children:[e.jsx("div",{className:"h-1"}),e.jsxs("div",{className:"py-2 firm-search-form-content",children:[e.jsxs("div",{className:"flex items-start justify-between mb-6 firm-search-header-row",children:[e.jsx("div",{className:"flex items-center gap-4 firm-search-header-content",children:e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-semibold text-gray-900 firm-search-form-title",children:"What type of companies are you looking for?"}),e.jsx("p",{className:"text-gray-600 mt-1 firm-search-form-subtitle",children:"Describe the type of companies you're looking for in plain English"})]})}),e.jsxs("button",{onClick:()=>X(!0),className:"firm-search-history-btn flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-blue-600 transition-all border border-transparent hover:border-blue-200/60 hover:bg-white/60",children:[e.jsx(je,{className:"w-4 h-4"}),"History"]})]}),e.jsxs("div",{className:"mb-6 firm-search-examples",children:[e.jsx("p",{className:"text-sm text-gray-500 mb-3",children:"Try an example or write your own"}),e.jsx("div",{className:"flex flex-wrap gap-2 firm-search-example-chips",children:_t.map(t=>e.jsx("button",{onClick:()=>mt(t.query,t.id),className:`px-3 py-1.5 bg-white/50 backdrop-blur-sm border border-black/[0.08] rounded-full text-sm text-gray-600 
                                         hover:bg-white/90 hover:text-blue-600 hover:border-blue-200/60
                                         transition-all duration-150`,children:t.label},t.id))})]}),e.jsxs("div",{className:"relative firm-search-textarea-wrapper",children:[e.jsx("textarea",{ref:be,value:$,onChange:t=>D(t.target.value),onKeyDown:ut,onFocus:()=>ge(null),placeholder:"e.g., Mid-sized investment banks in New York focused on healthcare M&A...",rows:4,disabled:E||!h,className:`w-full p-4 pr-14 text-base border-2 rounded-2xl firm-search-textarea
                                     text-gray-900 placeholder-gray-400 resize-none
                                     transition-all duration-150 disabled:opacity-50
                                     border-gray-200 hover:border-gray-300
                                     focus:border-blue-400 focus:bg-blue-50/20 focus:ring-1 focus:ring-blue-400/20
                                     ${lt!==null?"bg-blue-50/30 border-blue-300":""}`}),e.jsx("button",{onClick:()=>de(),disabled:!J||E||!h,className:`
                            absolute bottom-4 right-4 w-10 h-10 rounded-full
                            flex items-center justify-center transition-all duration-200
                            ${J&&!E&&h?"bg-blue-600 text-white shadow-md hover:scale-105":"bg-gray-100 text-gray-300 cursor-not-allowed"}
                          `,children:E?e.jsx(ae,{className:"w-5 h-5 animate-spin"}):e.jsx(Nt,{className:"w-5 h-5"})})]}),e.jsx("p",{className:"mt-2 text-xs text-gray-400",children:"We'll convert this into structured filters automatically."}),e.jsxs("div",{className:"mt-3 flex flex-wrap items-center gap-x-1 text-sm",children:[e.jsx("span",{className:"text-gray-500",children:"Include"}),e.jsxs("span",{className:`font-medium ${Ie?"text-green-600":"text-gray-900"}`,children:["industry",Ie&&e.jsx(Fe,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsxs("span",{className:`font-medium ${ye?"text-green-600":"text-gray-900"}`,children:["location",ye&&e.jsx(Fe,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsx("span",{className:"text-gray-500",children:"and optionally size, focus areas, and keywords."})]}),O&&e.jsxs("div",{className:"mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3",children:[e.jsx(he,{className:"h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-red-700 text-sm",children:O})]}),e.jsxs("div",{className:"mt-8 pt-8 border-t border-black/[0.06] firm-search-quantity-section",children:[e.jsx("h3",{className:"text-base font-semibold text-gray-900 mb-1 firm-search-quantity-title",children:"How many companies do you want to find?"}),e.jsx("p",{className:"text-sm text-gray-500 mb-5 firm-search-quantity-subtitle",children:"Companies are saved to your Company Tracker for easy access."}),e.jsxs("div",{className:"firm-search-quantity-card",children:[e.jsxs("div",{className:"flex items-center justify-between gap-4",children:[e.jsx("span",{className:"text-sm font-medium text-gray-500 whitespace-nowrap",children:"Quantity:"}),e.jsx("div",{className:"flex items-center gap-2 firm-search-quantity-buttons flex-1",children:Kt.map(t=>e.jsx("button",{onClick:()=>ot(t.value),disabled:E||t.value>Re,className:`
                                  px-4 py-2 rounded-full font-semibold text-sm transition-all duration-150 firm-search-quantity-btn flex-1
                                  ${F===t.value?"bg-blue-600 text-white shadow-sm":"bg-white/60 backdrop-blur-sm text-gray-600 border border-black/[0.08] hover:border-blue-200/60 hover:text-blue-600 hover:bg-white/90"}
                                  ${t.value>Re?"opacity-40 cursor-not-allowed":""}
                                `,children:t.value},t.value))}),e.jsxs("span",{className:"text-sm text-gray-500 whitespace-nowrap min-w-[80px] text-right",children:[F*W," credits"]})]}),f.credits!==void 0&&f.credits<F*W&&e.jsxs("p",{className:"text-xs text-amber-600 mt-3 flex items-center gap-1",children:[e.jsx(he,{className:"w-3 h-3"}),"Insufficient credits. You need ",F*W," but have ",f.credits,"."]})]})]}),e.jsxs("div",{className:"mt-8 firm-search-cta",children:[e.jsx("button",{ref:T,onClick:()=>de(),disabled:!J||E||!h||(f.credits??0)<F*W||(f.credits??0)===0,className:`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto firm-search-find-btn
                            transition-all duration-200 transform
                            ${!J||E||!h||(f.credits??0)<F*W||(f.credits??0)===0?"bg-gray-300 text-gray-500 cursor-not-allowed":"bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-100"}
                          `,children:E?e.jsxs(e.Fragment,{children:[e.jsx(ae,{className:"w-5 h-5 animate-spin"}),"Searching..."]}):e.jsxs(e.Fragment,{children:["Find Companies",e.jsx(St,{className:"w-5 h-5"})]})}),e.jsx("div",{className:"mt-3 text-center",children:(f.credits??0)===0?e.jsxs("div",{children:[e.jsx("p",{className:"text-xs text-red-500",children:"No credits remaining"}),e.jsx("button",{onClick:()=>g("/pricing"),className:"text-xs text-primary hover:underline mt-1",children:"Upgrade for more credits →"})]}):(f.credits??0)<50?e.jsxs("p",{className:"text-xs text-orange-500",children:["⚠ ",f.credits," credits remaining"]}):e.jsxs("p",{className:"text-xs text-muted-foreground",children:[f.credits," credits remaining"]})}),$&&!J&&e.jsxs("p",{className:"text-center text-sm text-amber-600 mt-4 flex items-center justify-center gap-1",children:[e.jsx(he,{className:"w-4 h-4"}),"Please include both an industry and location in your search"]})]}),r.length>0&&!Y&&e.jsx("div",{className:"mt-6 flex justify-center",children:e.jsxs(Bt,{children:[e.jsx($t,{asChild:!0,children:e.jsxs("button",{className:"flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors",children:[e.jsx(je,{className:"w-4 h-4"}),e.jsx("span",{children:"Recent Searches"}),r.length>0&&e.jsxs("span",{className:"text-xs text-gray-400",children:["(",r.length,")"]})]})}),e.jsxs(at,{align:"start",side:"bottom",className:"w-80",children:[e.jsx(it,{children:"Recent Searches"}),e.jsx(Ee,{}),r.slice(0,3).map(t=>e.jsxs(Ae,{onClick:()=>ze(t),className:"flex flex-col items-start gap-1 py-3 px-3 cursor-pointer",children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2 w-full",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500",children:[t.resultsCount," companies • ",new Date(t.createdAt).toLocaleDateString()]})]},t.id)),r.length>3&&e.jsxs(e.Fragment,{children:[e.jsx(Ee,{}),e.jsxs(Ae,{onClick:()=>X(!0),className:"text-center justify-center",children:["View all (",r.length,")"]})]})]})]})})]})]})]}),e.jsx(Pe,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid rgba(37, 99, 235, 0.08)",borderRadius:"14px",maxWidth:"900px",margin:"0 auto",boxShadow:"0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 border-b border-gray-100 mb-6",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold text-gray-900",children:[w.length," ",w.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm text-gray-500 mt-1",children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(ve,{onClick:()=>{ee.current=!1,K()},variant:"outline",size:"sm",className:"gap-2 border-gray-300 text-gray-700 hover:bg-gray-50",disabled:P,children:[P?e.jsx(ae,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),w.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(ve,{onClick:()=>xe(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(st,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(ve,{onClick:ft,className:`gap-2 ${f.tier==="free"?"bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60":"bg-gray-900 hover:bg-gray-800"}`,disabled:f.tier==="free",title:f.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(kt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),P?e.jsx(Dt,{variant:"card",count:3}):w.length>0?e.jsx(Wt,{firms:w,onViewContacts:ct,onDelete:dt,deletingId:oe}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(we,{className:"h-8 w-8 text-gray-900"})}),e.jsx("h3",{className:"text-lg font-semibold text-gray-900 mb-2",children:"No companies yet"}),e.jsx("p",{className:"text-sm text-gray-500 mb-6",children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>n("firm-search"),className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"Find Companies"})]})]})]})})]})})]}),fe&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold text-gray-900",children:"Search History"}),e.jsx("button",{onClick:()=>X(!1),className:"p-2 hover:bg-gray-100 rounded-lg",children:e.jsx(Ct,{className:"w-5 h-5 text-gray-500"})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:o?e.jsx("div",{className:"py-8 text-center",children:e.jsx(ae,{className:"h-6 w-6 text-gray-400 animate-spin mx-auto"})}):r.length===0?e.jsxs("div",{className:"py-8 text-center text-gray-500",children:[e.jsx(je,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):r.map(t=>e.jsxs("div",{onClick:()=>ze(t),className:"flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors",children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(Ge,{className:"w-4 h-4 text-gray-400"})]},t.id))})]})}),E&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200",children:[e.jsxs("div",{className:"w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 relative",children:[e.jsx("div",{className:"absolute inset-0 bg-gray-200/50 rounded-2xl animate-pulse"}),e.jsx(we,{className:"w-10 h-10 text-gray-900 relative z-10"})]}),e.jsx("h3",{className:"text-2xl font-bold text-gray-900 mb-2",children:"Searching for companies"}),e.jsx("p",{className:"text-gray-600 mb-6 text-sm min-h-[20px]",children:(k==null?void 0:k.step)||`Finding ${F} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner",children:e.jsx("div",{className:"bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden",style:{width:k?`${Math.max(2,Math.min(98,k.current/k.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium text-blue-600",children:k?`${k.current} of ${k.total} companies`:"Starting..."}),e.jsx("span",{className:"text-gray-500",children:k?`${Math.round(k.current/k.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs text-gray-400 mt-4",children:"This usually takes 10-20 seconds"})]})}),ue&&w.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn",children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(Ft,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold text-gray-900 mb-1",children:["Found ",w.length," companies!"]}),e.jsx("p",{className:"text-gray-600 mb-2",children:"Matching your criteria"}),e.jsx("p",{className:"text-sm text-blue-600 font-medium mb-6",children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{q(!1),n("firm-library")},className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"View Companies →"}),e.jsx("button",{onClick:()=>{q(!1),D(""),ne(!1)},className:"px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors",children:"Search again"})]})]})}),e.jsx(Be,{open:le,onOpenChange:xe,children:e.jsxs($e,{children:[e.jsxs(Oe,{children:[e.jsx(He,{children:"Delete All Companies?"}),e.jsxs(Ue,{children:["This will permanently remove all ",w.length," ",w.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(qe,{children:[e.jsx(We,{children:"Cancel"}),e.jsx(_e,{onClick:ht,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Be,{open:nt,onOpenChange:pe,children:e.jsxs($e,{children:[e.jsxs(Oe,{children:[e.jsx(He,{children:"Upgrade to Export CSV"}),e.jsx(Ue,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(qe,{children:[e.jsx(We,{children:"Cancel"}),e.jsx(_e,{onClick:xt,className:"bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),y==="firm-search"&&e.jsx(Pt,{originalButtonRef:T,onClick:()=>de(),isLoading:E,disabled:!J||E||!h||(f.credits??0)<F*W,buttonClassName:"rounded-full",children:e.jsx("span",{children:"Find Companies"})})]});return x?De:e.jsx(At,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(Et,{}),e.jsxs(Mt,{children:[e.jsx(Tt,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#F8FAFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Instrument Serif', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#64748B",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Lt,{videoId:"n_AYHEJSXrE"})})]}),De]})]})]})})};export{rr as default};
