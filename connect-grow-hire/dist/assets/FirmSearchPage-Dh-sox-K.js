import{r as l,j as e,a5 as Pe,b1 as Ze,L as fe,l as Oe,u as et,f as tt,a4 as we,aI as je,ad as rt,X as st,b2 as it,I as at,ai as nt}from"./vendor-react-CDCsE7-u.js";import{S as ot,A as lt,a as ct}from"./AppHeader-B-Sucd87.js";import{T as dt,c as Ae}from"./tabs-Dh6GCFf-.js";import{u as ht,m as ft,b as V,t as S,B as ve,L as ut}from"./index-BH_zcMo5.js";import{V as pt}from"./VideoDemo-BkYxhcsj.js";import{A as Be,a as Te,b as Re,c as Ie,d as ze,e as Le,f as De,g as Me}from"./alert-dialog-CnJraqST.js";import{M as mt}from"./MainContentWrapper-BHJyndH1.js";import{S as xt}from"./StickyCTA-GRz4G_2Y.js";const L="'IBM Plex Mono', monospace",Se=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Fe=40,ke=32;function gt({firms:T,onViewContacts:Y,onDelete:U,deletingId:M}){const[m,F]=l.useState("name"),[G,u]=l.useState("desc"),[k,P]=l.useState(""),[x,se]=l.useState(T),[y,R]=l.useState(new Set),[w,O]=l.useState(null),X=l.useRef(null);l.useEffect(()=>{if(!k.trim()){se(T);return}const r=T.filter(h=>{var p,C,I,n,z;const o=k.toLowerCase();return((p=h.name)==null?void 0:p.toLowerCase().includes(o))||((C=h.industry)==null?void 0:C.toLowerCase().includes(o))||((n=(I=h.location)==null?void 0:I.display)==null?void 0:n.toLowerCase().includes(o))||((z=h.website)==null?void 0:z.toLowerCase().includes(o))});se(r)},[k,T]);const b=[...x].sort((r,h)=>{var C,I,n,z,Q,J,ce,ie;let o,p;switch(m){case"name":o=((C=r.name)==null?void 0:C.toLowerCase())||"",p=((I=h.name)==null?void 0:I.toLowerCase())||"";break;case"location":o=((z=(n=r.location)==null?void 0:n.display)==null?void 0:z.toLowerCase())||"",p=((J=(Q=h.location)==null?void 0:Q.display)==null?void 0:J.toLowerCase())||"";break;case"industry":o=((ce=r.industry)==null?void 0:ce.toLowerCase())||"",p=((ie=h.industry)==null?void 0:ie.toLowerCase())||"";break;default:return 0}return o<p?G==="asc"?-1:1:o>p?G==="asc"?1:-1:0}),Ce=r=>{m===r?u(G==="asc"?"desc":"asc"):(F(r),u("desc"))},_=r=>{var h;return r.id||`${r.name}-${(h=r.location)==null?void 0:h.display}`},N=()=>{y.size===x.length?R(new Set):R(new Set(x.map(r=>_(r))))},W=r=>{R(h=>{const o=new Set(h);return o.has(r)?o.delete(r):o.add(r),o})},ue=()=>{if(!w)return"A1";const r=Se.find(p=>p.key===w.col),h=(r==null?void 0:r.letter)||"A",o=b.findIndex(p=>_(p)===w.firmKey);return`${h}${o>=0?o+1:1}`},q=()=>{var h;if(!w)return"";const r=b.find(o=>_(o)===w.firmKey);if(!r)return"";switch(w.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((h=r.location)==null?void 0:h.display)||"";case"industry":return r.industry||"";default:return""}},pe={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:L,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{X.current&&!X.current.contains(r.target)&&O(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(Pe,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:k,onChange:r=>P(r.target.value),style:{fontFamily:L,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[x.length," firm",x.length!==1?"s":"",k&&` of ${T.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:L},children:ue()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:L,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:L,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:q()})]}),e.jsx("div",{ref:X,style:{flex:1,overflow:"auto"},children:x.length===0&&T.length>0&&k?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:L},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>P(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:L},children:"Clear search"})]}):x.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:L},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Se.map(r=>{const h=(w==null?void 0:w.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:h?"#2a2a2a":"#999",fontWeight:h?500:400,background:h?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:x.length>0&&y.size===x.length,onChange:N,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Se.map(r=>{const h=(w==null?void 0:w.col)===r.key,o=pe[r.key];return e.jsxs("th",{onClick:o?()=>Ce(o):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:h?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:o?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,o&&m===o&&(G==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:b.map((r,h)=>{var I;const o=_(r),p=y.has(o),C=n=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(w==null?void 0:w.firmKey)===o&&(w==null?void 0:w.col)===n?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:p?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:n=>{p||(n.currentTarget.style.background="#f5f5f3")},onMouseLeave:n=>{n.currentTarget.style.background=p?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Fe,textAlign:"center",fontSize:10,color:p?"#fff":"#999",background:p?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:n=>{p||(n.currentTarget.style.background="#f0f0ee",n.currentTarget.style.color="#555")},onMouseLeave:n=>{p||(n.currentTarget.style.background="#ffffff",n.currentTarget.style.color="#999")},children:h+1}),e.jsx("td",{style:{width:ke,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:p,onChange:()=>W(o),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"name"}),style:C("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"website"}),style:C("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:n=>n.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"linkedin"}),style:C("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl,target:"_blank",rel:"noopener noreferrer",onClick:n=>n.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"location"}),style:C("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((I=r.location)==null?void 0:I.display)||"—"})}),e.jsx("td",{onClick:()=>O({firmKey:o,col:"industry"}),style:C("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>Y(r),style:{fontFamily:L,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:n=>{n.currentTarget.style.color="#2a2a2a"},onMouseLeave:n=>{n.currentTarget.style.color="#555"},children:[e.jsx(Ze,{className:"h-3 w-3"})," View"]}),U&&e.jsx("button",{onClick:()=>U(r),disabled:M===o,style:{background:"none",border:"none",color:"#bbb",cursor:M===o?"wait":"pointer",padding:3},onMouseEnter:n=>{n.currentTarget.style.color="#c00"},onMouseLeave:n=>{n.currentTarget.style.color="#bbb"},children:M===o?e.jsx(fe,{className:"h-3 w-3 animate-spin"}):e.jsx(Oe,{className:"h-3 w-3"})})]})})]},o)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:L},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[b.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const yt=[{id:1,label:"Tech startups in SF",query:"Early-stage tech startups in San Francisco focused on AI/ML"},{id:2,label:"Healthcare M&A banks",query:"Mid-sized investment banks in New York focused on healthcare M&A"},{id:3,label:"Consulting in Chicago",query:"Management consulting firms in Chicago with 100-500 employees"},{id:4,label:"Fintech in London",query:"Series B+ fintech companies in London focused on payments"}],Ne="scout_auto_populate",bt=T=>T<=5?"Perfect for focused targeting":T<=10?"Great for exploring an industry":"Maximum discovery — cast a wide net",At=({embedded:T=!1,initialTab:Y})=>{const U=et(),M=tt(),{user:m,checkCredits:F}=ht(),{openPanelWithSearchHelp:G}=ft(),u=m||{credits:0,tier:"free"},[k,P]=l.useState(""),[x,se]=l.useState(!1),[y,R]=l.useState([]),[w,O]=l.useState(null),[X,b]=l.useState(null),[Ce,_]=l.useState(!1),[N,W]=l.useState(null),[ue,q]=l.useState(!1),[pe,r]=l.useState(!1),[h,o]=l.useState([]),[p,C]=l.useState(!1),I=l.useRef(null),[n,z]=l.useState(Y||"firm-search");l.useEffect(()=>{Y&&z(Y)},[Y]);const[Q,J]=l.useState(!1),[ce,ie]=l.useState(null),[$e,me]=l.useState(!1),[He,xe]=l.useState(!1),Ue=l.useRef([]),Z=l.useRef(new Set),[j,_e]=l.useState(10),[D]=l.useState(5),[ae,ge]=l.useState(null),ye=l.useRef(null),We=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(k),ee=k.length>20&&We;l.useEffect(()=>{F&&m&&F()},[j,F,m]),l.useEffect(()=>{Ue.current=y},[y]),l.useEffect(()=>{const t=f=>{const{industry:c,location:d,size:s}=f;let a="";c&&(a+=c),d&&(a+=(a?" in ":"")+d),s&&(a+=(a?", ":"")+s),a&&(P(a),S({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},i=()=>{var f;try{const c=(f=M.state)==null?void 0:f.scoutAutoPopulate;if((c==null?void 0:c.search_type)==="firm"){t(c),sessionStorage.removeItem(Ne),U(M.pathname,{replace:!0,state:{}});return}const d=sessionStorage.getItem(Ne);if(d){const s=JSON.parse(d);let a;s.search_type==="firm"&&(s.auto_populate?a=s.auto_populate:a=s,t(a),sessionStorage.removeItem(Ne))}}catch(c){console.error("[Scout] Auto-populate error:",c)}};return i(),window.addEventListener("scout-auto-populate",i),()=>window.removeEventListener("scout-auto-populate",i)},[M.state,M.pathname,U]);const K=l.useRef(new Set),$=l.useCallback(async()=>{if(!m){J(!1);return}J(!0);try{const t=await V.getFirmSearchHistory(100,!0),i=[],f=new Set,c=new Set;t.forEach(s=>{s.results&&Array.isArray(s.results)&&s.results.forEach(a=>{var B;if(a.id&&Z.current.has(a.id)||a.id&&K.current.has(a.id))return;const g=a.id||`${a.name}-${(B=a.location)==null?void 0:B.display}`;a.id?f.has(a.id)||(f.add(a.id),i.push(a)):c.has(g)||(c.add(g),i.push(a))})});const d=i.filter(s=>!(s.id&&Z.current.has(s.id)));K.current.size>0&&K.current.clear(),R(d)}catch(t){console.error("Failed to load saved firms:",t),S({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{J(!1)}},[m]),de=l.useCallback(async()=>{if(m){C(!0);try{const t=await V.getFirmSearchHistory(10);o(t)}catch(t){console.error("Failed to load search history:",t)}finally{C(!1)}}},[m]);l.useEffect(()=>{de(),F&&F()},[de,F]);const he=l.useRef(!1);l.useEffect(()=>{if(n!=="firm-library"){he.current=!1;return}m&&(he.current||(he.current=!0,$()))},[n,m,$]);const be=async t=>{var s;const i=k;if(!i.trim()){b("Please enter a search query");return}if(!m){b("Please sign in to search for firms"),S({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}se(!0),b(null),_(!0),q(!1);const f=2+Math.ceil(j/5)*2,c=f<60?`${f} seconds`:`${Math.ceil(f/60)} minutes`;W({current:0,total:j,step:`Starting search... (est. ${c})`});let d=null;try{const{searchId:a}=await V.searchFirmsAsync(i,j);d=await V.createFirmSearchStream(a),await new Promise((g,B)=>{d.addEventListener("progress",A=>{try{const E=JSON.parse(A.data);W({current:E.current??0,total:E.total??j,step:E.step||"Searching..."})}catch{}}),d.addEventListener("complete",A=>{var E,H;te=!0,d==null||d.close();try{const v=JSON.parse(A.data);W(null),v.success&&((E=v.firms)==null?void 0:E.length)>0?(O(v.parsedFilters),R(v.firms),q(!0),S({title:"Search Complete!",description:`Found ${v.firms.length} firm${v.firms.length!==1?"s":""}. Used ${v.creditsCharged||0} credits.`}),F&&F(),de()):((H=v.firms)==null?void 0:H.length)===0?(b("No firms found matching your criteria. Try broadening your search."),G({searchType:"firm",failedSearchParams:{industry:i,location:"",size:""},errorType:"no_results"})):b(v.error||"Search failed. Please try again.")}catch{b("Failed to parse search results.")}g()}),d.addEventListener("error",A=>{te=!0,d==null||d.close();try{const E=JSON.parse(A.data);b(E.message||"Search failed.")}catch{b("Search connection lost. Please try again.")}g()});let te=!1;d.onerror=()=>{if(te)return;te=!0,d==null||d.close();const A=setInterval(async()=>{var E,H,v;try{const re=await V.getFirmSearchStatus(a);((E=re.progress)==null?void 0:E.status)==="completed"?(clearInterval(A),W(null),F&&F(),de(),$(),q(!0),S({title:"Search Complete!",description:"Results loaded from history."}),g()):((H=re.progress)==null?void 0:H.status)==="failed"&&(clearInterval(A),b(((v=re.progress)==null?void 0:v.error)||"Search failed."),g())}catch{clearInterval(A),b("Search connection lost. Please check your search history for results."),g()}},2e3);setTimeout(()=>{clearInterval(A),b("Search is taking longer than expected. Check your history for results."),g()},12e4)}})}catch(a){if(console.error("Search error:",a),a.status===401||(s=a.message)!=null&&s.includes("Authentication required"))b("Authentication required. Please sign in again."),S({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(a.status===402||a.error_code==="INSUFFICIENT_CREDITS"){const g=a.creditsNeeded||a.required||j*D,B=a.currentCredits||a.available||u.credits||0;b(`Insufficient credits. You need ${g} but have ${B}.`),S({title:"Insufficient Credits",description:`Need ${g}, have ${B}.`,variant:"destructive"}),F&&await F()}else a.status===502||a.error_code==="EXTERNAL_API_ERROR"?(b(a.message||"Search service temporarily unavailable."),S({title:"Service Unavailable",description:a.message||"Try again shortly.",variant:"destructive"})):(b(a.message||"An unexpected error occurred."),S({title:"Search Failed",description:a.message||"Please try again.",variant:"destructive"}))}finally{d==null||d.close(),se(!1),W(null)}},qe=t=>{var f,c;const i=new URLSearchParams;if(i.set("company",t.name),(f=t.location)!=null&&f.display)i.set("location",t.location.display);else if((c=t.location)!=null&&c.city){const d=[t.location.city,t.location.state,t.location.country].filter(Boolean);i.set("location",d.join(", "))}U(`/find?${i.toString()}`)},ne=t=>{var i;return t.id||`${t.name}-${(i=t.location)==null?void 0:i.display}`},Ke=async t=>{const i=ne(t);ie(i);try{t.id&&(Z.current.add(t.id),K.current.add(t.id)),R(c=>c.filter(s=>t.id&&s.id?s.id!==t.id:ne(s)!==i));const f=await V.deleteFirm(t);if(f.success){if(f.deletedCount===0){t.id&&(Z.current.delete(t.id),K.current.delete(t.id)),R(c=>c.some(s=>t.id&&s.id?s.id===t.id:ne(s)===i)?c:[...c,t]),S({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}S({title:"Firm deleted",description:"Removed from your Firm Library."}),n==="firm-library"&&setTimeout(async()=>{try{await $()}catch(c){console.error("Error reloading firms:",c)}},1500)}else throw t.id&&(Z.current.delete(t.id),K.current.delete(t.id)),R(c=>c.some(s=>t.id&&s.id?s.id===t.id:ne(s)===i)?c:[...c,t]),new Error(f.error||"Failed to delete firm")}catch(f){console.error("Delete firm error:",f),t.id&&(Z.current.delete(t.id),K.current.delete(t.id)),R(c=>c.some(s=>t.id&&s.id?s.id===t.id:ne(s)===i)?c:[...c,t]),S({title:"Delete failed",description:f instanceof Error?f.message:"Please try again.",variant:"destructive"})}finally{ie(null)}},Ve=async()=>{const t=y.length;me(!1);try{const i=y.map(s=>V.deleteFirm(s)),c=(await Promise.allSettled(i)).filter(s=>s.status==="fulfilled"&&s.value.success&&(s.value.deletedCount||0)>0).length,d=t-c;d===0?(R([]),S({title:"All firms deleted",description:`Removed ${c} firm${c!==1?"s":""} from your Firm Library.`}),n==="firm-library"&&setTimeout(async()=>{try{await $()}catch(s){console.error("Error reloading firms:",s)}},1e3)):(S({title:"Partial deletion",description:`Deleted ${c} of ${t} firms. ${d} failed.`,variant:"default"}),n==="firm-library"&&setTimeout(async()=>{try{await $()}catch(s){console.error("Error reloading firms:",s)}},1e3))}catch(i){console.error("Error deleting all firms:",i),S({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),n==="firm-library"&&setTimeout(async()=>{try{await $()}catch(f){console.error("Error reloading firms:",f)}},1e3)}},Ye=t=>{P(t.query),r(!1)},Ge=(t,i)=>{P(t),ge(i),ye.current&&(ye.current.focus(),setTimeout(()=>{ge(null)},150))},Xe=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),be())},Qe=()=>{if(u.tier==="free"){xe(!0);return}if(!y||y.length===0)return;const i=["Company Name","Website","LinkedIn","Location","Industry"].join(","),f=y.map(g=>{var A,E,H,v;const B=re=>{if(!re)return"";const le=String(re);return le.includes(",")||le.includes('"')||le.includes(`
`)?`"${le.replace(/"/g,'""')}"`:le},te=((A=g.location)==null?void 0:A.display)||[(E=g.location)==null?void 0:E.city,(H=g.location)==null?void 0:H.state,(v=g.location)==null?void 0:v.country].filter(Boolean).join(", ");return[B(g.name),B(g.website),B(g.linkedinUrl),B(te),B(g.industry)].join(",")}),c=[i,...f].join(`
`),d=new Blob([c],{type:"text/csv;charset=utf-8;"}),s=document.createElement("a"),a=URL.createObjectURL(d);s.setAttribute("href",a),s.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),s.style.visibility="hidden",document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(a)},Je=()=>{xe(!1),U("/pricing")},oe=((u==null?void 0:u.tier)==="pro"?"pro":"free")==="free"?10:15,Ee=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(dt,{value:n,onValueChange:z,className:"w-full",children:[e.jsxs(Ae,{value:"firm-search",className:"mt-0",children:[!m&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(we,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",border:"1.5px solid #E2E8F0",borderRadius:3,background:"#FAFBFF",transition:"all .15s"},className:"focus-within:border-[#3B82F6] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.10)]",children:[e.jsx(Pe,{style:{width:15,height:15,flexShrink:0,color:"#94A3B8"}}),e.jsx("input",{ref:ye,value:k,onChange:t=>P(t.target.value),onKeyDown:Xe,onFocus:()=>ge(null),placeholder:"Fintech startups in NYC, consulting firms in Chicago...",disabled:x||!m,style:{flex:1,border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit"}})]})}),!k.trim()&&e.jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16},children:yt.map(t=>e.jsx("button",{type:"button",onClick:()=>Ge(t.query,t.id),disabled:x,style:{display:"inline-flex",alignItems:"center",padding:"5px 12px",fontSize:12,border:`0.5px solid ${ae===t.id?"#3B82F6":"#E2E8F0"}`,borderRadius:100,background:ae===t.id?"rgba(59,130,246,0.05)":"#fff",color:ae===t.id?"#3B82F6":"#6B7280",cursor:"pointer",transition:"all .12s",fontFamily:"inherit"},onMouseEnter:i=>{ae!==t.id&&(i.currentTarget.style.borderColor="#3B82F6",i.currentTarget.style.background="rgba(59,130,246,0.05)",i.currentTarget.style.color="#3B82F6")},onMouseLeave:i=>{ae!==t.id&&(i.currentTarget.style.borderColor="#E2E8F0",i.currentTarget.style.background="#fff",i.currentTarget.style.color="#6B7280")},children:t.label},t.id))}),X&&e.jsxs("div",{className:"p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4",children:[e.jsx(we,{className:"w-4 h-4 flex-shrink-0"}),X]}),k.trim()&&e.jsxs("div",{style:{marginBottom:16},children:[e.jsx("div",{style:{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:".05em",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsx("div",{className:"slider-container",children:e.jsxs("div",{className:"slider-wrapper",children:[e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[16px]",children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",children:[e.jsx("div",{className:"slider-filled-track",style:{width:oe>5?`${(j-5)/(oe-5)*100}%`:"0%"}}),e.jsx("input",{type:"range",min:5,max:oe,step:5,value:j,onChange:t=>{const i=Math.min(Number(t.target.value),oe);_e(i)},disabled:x,className:"slider-custom","aria-label":"Number of companies to find"})]}),e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[20px] text-right",children:oe})]})}),e.jsx("p",{className:"text-xs text-[#6B7280] mt-2",children:bt(j)}),e.jsxs("div",{className:"mt-2 flex items-center gap-2 text-xs text-[#6B7280]",children:[e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]",children:[j*D," credits"]}),e.jsxs("span",{children:["of ",u.credits??0," available"]})]}),u.credits!==void 0&&u.credits<j*D&&e.jsxs("p",{className:"text-xs text-amber-600 mt-2 flex items-center gap-1",children:[e.jsx(we,{className:"w-3 h-3"}),"Insufficient credits. You need ",j*D," but have ",u.credits,"."]})]}),e.jsx("button",{ref:I,onClick:()=>be(),disabled:!ee||x||!m||(u.credits??0)<j*D||(u.credits??0)===0,style:{width:"100%",height:44,borderRadius:3,background:!ee||x||!m||(u.credits??0)<j*D||(u.credits??0)===0?"#E2E8F0":"#3B82F6",color:!ee||x||!m||(u.credits??0)<j*D||(u.credits??0)===0?"#94A3B8":"#fff",border:"none",fontSize:14,fontWeight:600,cursor:!ee||x||!m||(u.credits??0)<j*D||(u.credits??0)===0?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s",fontFamily:"inherit"},children:x?e.jsxs(e.Fragment,{children:[e.jsx(fe,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(je,{className:"w-4 h-4"}),e.jsx("span",{children:"Find companies"})]})}),k&&!ee&&e.jsx("p",{style:{fontSize:11,color:"#94A3B8",marginTop:10,textAlign:"center"},children:"Include an industry and location for best results"})]})]}),e.jsx(Ae,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[y.length," ",y.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(ve,{onClick:()=>{he.current=!1,$()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:Q,children:[Q?e.jsx(fe,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),y.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(ve,{onClick:()=>me(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Oe,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(ve,{onClick:Qe,className:`gap-2 ${u.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:u.tier==="free",title:u.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(rt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),Q?e.jsx(ut,{variant:"card",count:3}):y.length>0?e.jsx(gt,{firms:y,onViewContacts:qe,onDelete:Ke,deletingId:ce}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx(je,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>z("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),pe&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>r(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(st,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:p?e.jsx("div",{className:"py-8 text-center",children:e.jsx(fe,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):h.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(it,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):h.map(t=>e.jsxs("div",{onClick:()=>Ye(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:i=>{i.currentTarget.style.background="#EEF2F8"},onMouseLeave:i=>{i.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(at,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),x&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx(je,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(N==null?void 0:N.step)||`Finding ${j} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:N?`${Math.max(2,Math.min(98,N.current/N.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:N?`${N.current} of ${N.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:N?`${Math.round(N.current/N.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),ue&&y.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(nt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",y.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{q(!1),z("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{q(!1),P(""),_(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(Be,{open:$e,onOpenChange:me,children:e.jsxs(Te,{children:[e.jsxs(Re,{children:[e.jsx(Ie,{children:"Delete All Companies?"}),e.jsxs(ze,{children:["This will permanently remove all ",y.length," ",y.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(Le,{children:[e.jsx(De,{children:"Cancel"}),e.jsx(Me,{onClick:Ve,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Be,{open:He,onOpenChange:xe,children:e.jsxs(Te,{children:[e.jsxs(Re,{children:[e.jsx(Ie,{children:"Upgrade to Export CSV"}),e.jsx(ze,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(Le,{children:[e.jsx(De,{children:"Cancel"}),e.jsx(Me,{onClick:Je,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),n==="firm-search"&&e.jsx(xt,{originalButtonRef:I,onClick:()=>be(),isLoading:x,disabled:!ee||x||!m||(u.credits??0)<j*D,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return T?Ee:e.jsx(ot,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(lt,{}),e.jsxs(mt,{children:[e.jsx(ct,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(pt,{videoId:"n_AYHEJSXrE"})})]}),Ee]})]})]})})};export{At as default};
