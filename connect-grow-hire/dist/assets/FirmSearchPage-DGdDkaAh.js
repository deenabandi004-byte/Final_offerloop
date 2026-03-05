import{b0 as ct,b1 as mt,r as a,j as e,b2 as ht,b3 as $e,b4 as He,b5 as Oe,b6 as Ue,b7 as qe,a3 as Be,b8 as _e,b9 as Ve,ba as We,a9 as be,bb as Ye,bc as xt,aK as ie,I as Ke,bd as ut,y as pt,ah as ft,be as gt,L as ae,l as Xe,aA as bt,a2 as yt,u as wt,f as jt,Y as le,bf as fe,bg as vt,p as Nt,ai as St,X as Ct,ak as kt}from"./vendor-react-BrZ-WZRu.js";import{S as Ft,A as Et,a as At}from"./AppHeader-BU0c6Hy0.js";import{T as Tt,c as Ae}from"./tabs-D9dcxf60.js";import{f as M,B as de,u as Rt,m as Dt,b as V,t as S,l as It}from"./index-8ABf5-Vs.js";import{V as Lt}from"./VideoDemo-BfvEAfGq.js";import{A as Te,a as Re,b as De,c as Ie,d as Le,e as ze,f as Pe,g as Me}from"./alert-dialog-ByljhmtQ.js";import{I as zt}from"./input-BWe4OJwe.js";import{M as Pt}from"./MainContentWrapper-BlWFbcRY.js";import{S as Mt}from"./StickyCTA-D5PypqpG.js";const $t=ct,Ht=mt,Ot=a.forwardRef(({className:m,inset:p,children:o,...h},L)=>e.jsxs(qe,{ref:L,className:M("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-blue-600 focus:text-white data-[state=open]:bg-blue-600 data-[state=open]:text-white hover:bg-blue-100 hover:text-blue-900",p&&"pl-8",m),...h,children:[o,e.jsx(Be,{className:"ml-auto h-4 w-4"})]}));Ot.displayName=qe.displayName;const Ut=a.forwardRef(({className:m,...p},o)=>e.jsx(_e,{ref:o,className:M("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",m),...p}));Ut.displayName=_e.displayName;const Ge=a.forwardRef(({className:m,sideOffset:p=4,...o},h)=>e.jsx(ht,{children:e.jsx($e,{ref:h,sideOffset:p,className:M("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",m),...o})}));Ge.displayName=$e.displayName;const ye=a.forwardRef(({className:m,inset:p,...o},h)=>e.jsx(Ue,{ref:h,className:M("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",p&&"pl-8",m),...o}));ye.displayName=Ue.displayName;const qt=a.forwardRef(({className:m,children:p,checked:o,...h},L)=>e.jsxs(Ve,{ref:L,className:M("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",m),checked:o,...h,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(We,{children:e.jsx(be,{className:"h-4 w-4 text-white"})})}),p]}));qt.displayName=Ve.displayName;const Bt=a.forwardRef(({className:m,children:p,...o},h)=>e.jsxs(Ye,{ref:h,className:M("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",m),...o,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(We,{children:e.jsx(xt,{className:"h-2 w-2 fill-current text-white"})})}),p]}));Bt.displayName=Ye.displayName;const Qe=a.forwardRef(({className:m,inset:p,...o},h)=>e.jsx(He,{ref:h,className:M("px-2 py-1.5 text-sm font-semibold",p&&"pl-8",m),...o}));Qe.displayName=He.displayName;const we=a.forwardRef(({className:m,...p},o)=>e.jsx(Oe,{ref:o,className:M("-mx-1 my-1 h-px bg-muted",m),...p}));we.displayName=Oe.displayName;function _t({firms:m,onViewContacts:p,onDelete:o,deletingId:h}){const[L,f]=a.useState("name"),[R,z]=a.useState("desc"),[y,G]=a.useState(""),[u,A]=a.useState(m);a.useEffect(()=>{if(!y.trim()){A(m);return}const d=m.filter(g=>{var C,$,D,H,I,k,O,U,P,Q,b;const c=y.toLowerCase();return((C=g.name)==null?void 0:C.toLowerCase().includes(c))||(($=g.industry)==null?void 0:$.toLowerCase().includes(c))||((H=(D=g.location)==null?void 0:D.display)==null?void 0:H.toLowerCase().includes(c))||((k=(I=g.location)==null?void 0:I.city)==null?void 0:k.toLowerCase().includes(c))||((U=(O=g.location)==null?void 0:O.state)==null?void 0:U.toLowerCase().includes(c))||((Q=(P=g.location)==null?void 0:P.country)==null?void 0:Q.toLowerCase().includes(c))||((b=g.website)==null?void 0:b.toLowerCase().includes(c))});A(d)},[y,m]);const je=[...u].sort((d,g)=>{var $,D,H,I,k,O,U,P;let c,C;switch(L){case"name":c=(($=d.name)==null?void 0:$.toLowerCase())||"",C=((D=g.name)==null?void 0:D.toLowerCase())||"";break;case"location":c=((I=(H=d.location)==null?void 0:H.display)==null?void 0:I.toLowerCase())||"",C=((O=(k=g.location)==null?void 0:k.display)==null?void 0:O.toLowerCase())||"";break;case"industry":c=((U=d.industry)==null?void 0:U.toLowerCase())||"",C=((P=g.industry)==null?void 0:P.toLowerCase())||"";break;default:return 0}return c<C?R==="asc"?-1:1:c>C?R==="asc"?1:-1:0}),W=d=>{L===d?z(R==="asc"?"desc":"asc"):(f(d),z("desc"))},Y=({field:d})=>L!==d?null:R==="asc"?e.jsx(bt,{className:"h-4 w-4 inline-block ml-1"}):e.jsx(yt,{className:"h-4 w-4 inline-block ml-1"}),j=d=>{var g;return d.id||`${d.name}-${(g=d.location)==null?void 0:g.display}`};return e.jsxs("div",{className:"bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden firm-search-results-wrapper",children:[e.jsx("div",{className:"px-6 py-4 border-b border-border bg-muted firm-results-header",children:e.jsxs("div",{className:"flex items-center justify-between firm-results-header-row",children:[e.jsxs("div",{className:"flex items-center space-x-2 firm-results-header-content",children:[e.jsx(ie,{className:"h-5 w-5 text-blue-400"}),e.jsxs("span",{className:"font-medium text-foreground firm-results-count",children:[u.length," ",u.length===1?"firm":"firms",y&&` (filtered from ${m.length})`]})]}),e.jsx("p",{className:"text-sm text-muted-foreground firm-results-helper-text",children:'Click "View Contacts" to find professionals at any firm'})]})}),e.jsx("div",{className:"px-6 py-4 border-b border-border bg-background",children:e.jsxs("div",{className:"relative w-80",children:[e.jsx(Ke,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"}),e.jsx(zt,{type:"text",placeholder:"Search firms...",value:y,onChange:d=>G(d.target.value),className:"pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary"})]})}),u.length===0&&m.length>0&&y&&e.jsxs("div",{className:"px-6 py-12 text-center",children:[e.jsx("p",{className:"text-muted-foreground mb-2",children:"No firms match your search."}),e.jsx("button",{onClick:()=>G(""),className:"text-sm text-blue-400 hover:text-blue-300 underline",children:"Clear search"})]}),u.length>0&&e.jsx("div",{className:"overflow-x-auto firm-table-wrapper",children:e.jsxs("table",{className:"min-w-full divide-y divide-border firm-table",children:[e.jsx("thead",{className:"bg-muted",children:e.jsxs("tr",{children:[e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>W("name"),children:["Company Name",e.jsx(Y,{field:"name"})]}),e.jsx("th",{scope:"col",className:"px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Website"}),e.jsx("th",{scope:"col",className:"px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"LinkedIn"}),e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>W("location"),children:["Location",e.jsx(Y,{field:"location"})]}),e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>W("industry"),children:["Industry",e.jsx(Y,{field:"industry"})]}),e.jsx("th",{scope:"col",className:"px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Actions"})]})}),e.jsx("tbody",{className:"bg-background divide-y divide-border",children:je.map((d,g)=>{var c;return e.jsxs("tr",{className:"hover:bg-secondary transition-colors",children:[e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsxs("div",{className:"flex items-center",children:[e.jsx("div",{className:"flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30",children:e.jsx(ie,{className:"h-5 w-5 text-blue-400"})}),e.jsx("div",{className:"ml-4",children:e.jsx("div",{className:"text-sm font-medium text-foreground",children:d.name})})]})}),e.jsx("td",{className:"px-4 py-4 whitespace-nowrap text-center",children:d.website?e.jsx("a",{href:d.website,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors",title:d.website,children:e.jsx(ut,{className:"h-5 w-5"})}):e.jsx("span",{className:"text-muted-foreground",children:"—"})}),e.jsx("td",{className:"px-4 py-4 whitespace-nowrap text-center",children:d.linkedinUrl?e.jsx("a",{href:d.linkedinUrl,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors",title:"View on LinkedIn",children:e.jsx(pt,{className:"h-5 w-5"})}):e.jsx("span",{className:"text-muted-foreground",children:"—"})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsxs("div",{className:"flex items-center text-sm text-foreground",children:[e.jsx(ft,{className:"h-4 w-4 text-muted-foreground mr-1.5 flex-shrink-0"}),e.jsx("span",{children:((c=d.location)==null?void 0:c.display)||"—"})]})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsx("span",{className:"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 capitalize",children:d.industry||"—"})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap text-right",children:e.jsxs("div",{className:"flex items-center justify-end gap-2",children:[e.jsxs("button",{onClick:()=>p(d),className:"inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-300 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 hover:text-blue-200 transition-colors",children:[e.jsx(gt,{className:"h-4 w-4 mr-1.5"}),"View Contacts"]}),o&&e.jsx(de,{size:"sm",variant:"ghost",className:"text-red-300 hover:text-red-200 hover:bg-red-500/10",disabled:h===j(d),onClick:()=>o(d),children:h===j(d)?e.jsx(ae,{className:"h-4 w-4 animate-spin"}):e.jsx(Xe,{className:"h-4 w-4"})})]})})]},d.id||g)})})]})}),u.length>0&&e.jsx("div",{className:"px-6 py-4 border-t border-border bg-muted firm-helper-text",children:e.jsx("p",{className:"text-sm text-muted-foreground text-center firm-helper-text-content",children:'Click on column headers to sort • Click "View Contacts" to find professionals at any firm'})}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 4. HELPER TEXT in header */
          .firm-results-header {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .firm-results-header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .firm-results-header-content {
            width: 100%;
            flex: 1;
            min-width: 0;
          }

          .firm-results-count {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          .firm-results-helper-text {
            width: 100%;
            padding: 0;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
            text-align: left;
            margin: 0;
          }

          /* 5. TABLE WRAPPER - CSS only, no HTML changes */
          .firm-table-wrapper {
            overflow-x: auto;
            width: 100%;
            box-sizing: border-box;
            -webkit-overflow-scrolling: touch;
          }

          /* Table itself - no modifications, just ensure it doesn't affect header */
          .firm-table {
            min-width: 800px;
          }

          /* 11. HELPER TEXT in footer */
          .firm-helper-text {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .firm-helper-text-content {
            width: 100%;
            padding: 0 16px;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
            text-align: left;
          }

          /* General - ensure wrapper doesn't overflow */
          .firm-search-results-wrapper {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            overflow: visible;
          }
        }
      `})]})}const Vt=[{id:1,label:"Tech startups in SF",query:"Early-stage tech startups in San Francisco focused on AI/ML"},{id:2,label:"Healthcare M&A banks",query:"Mid-sized investment banks in New York focused on healthcare M&A"},{id:3,label:"Consulting in Chicago",query:"Management consulting firms in Chicago with 100-500 employees"},{id:4,label:"Fintech in London",query:"Series B+ fintech companies in London focused on payments"}],ge="scout_auto_populate",Wt=[{value:5},{value:10},{value:20},{value:40}],sr=()=>{const m=wt(),p=jt(),{user:o,checkCredits:h}=Rt(),{openPanelWithSearchHelp:L}=Dt(),f=o||{credits:0,tier:"free"},[R,z]=a.useState(""),[y,G]=a.useState(!1),[u,A]=a.useState([]),[je,W]=a.useState(null),[Y,j]=a.useState(null),[d,g]=a.useState(!1),[c,C]=a.useState(null),[$,D]=a.useState(!1),[H,I]=a.useState(!1),[k,O]=a.useState([]),[U,P]=a.useState(!1),Q=a.useRef(null),[b,J]=a.useState("firm-search"),[Z,ce]=a.useState(!1),[Je,ve]=a.useState(null),[Ze,me]=a.useState(!1),[et,he]=a.useState(!1),Ne=a.useRef([]),K=a.useRef(new Set),[N,tt]=a.useState(10),[q]=a.useState(5),[rt,xe]=a.useState(null),ue=a.useRef(null),Se=/\b(tech(nology)?|fintech|finance|banking|consulting|healthcare|pharma|biotech|energy|legal|law|real estate|insurance|media|advertising|marketing|retail|e-?commerce|education|edtech|telecom|manufacturing|automotive|aerospace|defense|crypto|blockchain|saas|ai|artificial intelligence|machine learning|data|analytics|cybersecurity|cloud|devops|enterprise|logistics|supply chain|food|agri(culture)?|hospitality|travel|gaming|entertainment|sports|venture capital|private equity|investment|wealth management|asset management|accounting|audit|tax|compliance|government|nonprofit|sustainability|cleantech|construction|architecture|design|fashion|beauty|fitness|wellness|startup|b2b|b2c|marketplace|platform|software|engineering|recruiting|staffing|hr|human resources)\b/i.test(R),pe=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(R),X=R.length>20&&pe;a.useEffect(()=>{h&&o&&h()},[N,h,o]),a.useEffect(()=>{Ne.current=u},[u]),a.useEffect(()=>{const t=x=>{const{industry:i,location:n,size:r}=x;let s="";i&&(s+=i),n&&(s+=(s?" in ":"")+n),r&&(s+=(s?", ":"")+r),s&&(z(s),S({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},l=()=>{var x;try{const i=(x=p.state)==null?void 0:x.scoutAutoPopulate;if((i==null?void 0:i.search_type)==="firm"){t(i),sessionStorage.removeItem(ge),m(p.pathname,{replace:!0,state:{}});return}const n=sessionStorage.getItem(ge);if(n){const r=JSON.parse(n);let s;r.search_type==="firm"&&(r.auto_populate?s=r.auto_populate:s=r,t(s),sessionStorage.removeItem(ge))}}catch(i){console.error("[Scout] Auto-populate error:",i)}};return l(),window.addEventListener("scout-auto-populate",l),()=>window.removeEventListener("scout-auto-populate",l)},[p.state,p.pathname,m]);const B=a.useRef(new Set),_=a.useCallback(async()=>{if(!o){ce(!1);return}ce(!0);try{const t=await V.getFirmSearchHistory(100,!0),l=[],x=new Set,i=new Set;t.forEach(r=>{r.results&&Array.isArray(r.results)&&r.results.forEach(s=>{var E;if(s.id&&K.current.has(s.id)||s.id&&B.current.has(s.id))return;const w=s.id||`${s.name}-${(E=s.location)==null?void 0:E.display}`;s.id?x.has(s.id)||(x.add(s.id),l.push(s)):i.has(w)||(i.add(w),l.push(s))})});const n=l.filter(r=>!(r.id&&K.current.has(r.id)));B.current.size>0&&B.current.clear(),A(n),ee.current=!1}catch(t){console.error("Failed to load saved firms:",t),S({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{ce(!1)}},[o]),ne=a.useCallback(async()=>{if(o){P(!0);try{const t=await V.getFirmSearchHistory(10);O(t)}catch(t){console.error("Failed to load search history:",t)}finally{P(!1)}}},[o]);a.useEffect(()=>{ne(),h&&h()},[ne,h]);const ee=a.useRef(!1);a.useEffect(()=>{if(b!=="firm-library"){ee.current=!1;return}o&&(Z||ee.current||Ne.current.length>0||(ee.current=!0,_()))},[b,o,_,Z]);const oe=async t=>{var r;const l=R;if(!l.trim()){j("Please enter a search query");return}if(!o){j("Please sign in to search for firms"),S({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}G(!0),j(null),g(!0),D(!1);const x=2+Math.ceil(N/5)*2,i=x<60?`${x} seconds`:`${Math.ceil(x/60)} minutes`;C({current:0,total:N,step:`Starting search... (est. ${i})`});let n=null;try{const{searchId:s}=await V.searchFirmsAsync(l,N);n=await V.createFirmSearchStream(s),await new Promise((w,E)=>{n.addEventListener("progress",v=>{try{const F=JSON.parse(v.data);C({current:F.current??0,total:F.total??N,step:F.step||"Searching..."})}catch{}}),n.addEventListener("complete",v=>{var F,re;n==null||n.close();try{const T=JSON.parse(v.data);C(null),T.success&&((F=T.firms)==null?void 0:F.length)>0?(W(T.parsedFilters),A(T.firms),D(!0),S({title:"Search Complete!",description:`Found ${T.firms.length} firm${T.firms.length!==1?"s":""}. Used ${T.creditsCharged||0} credits.`}),h&&h(),ne()):((re=T.firms)==null?void 0:re.length)===0?(j("No firms found matching your criteria. Try broadening your search."),L({searchType:"firm",failedSearchParams:{industry:l,location:"",size:""},errorType:"no_results"})):j(T.error||"Search failed. Please try again.")}catch{j("Failed to parse search results.")}w()}),n.addEventListener("error",v=>{n==null||n.close();try{const F=JSON.parse(v.data);j(F.message||"Search failed.")}catch{j("Search connection lost. Please try again.")}w()}),n.onerror=()=>{n==null||n.close(),V.searchFirms(l,N).then(v=>{var F;C(null),v.success&&((F=v.firms)==null?void 0:F.length)>0?(W(v.parsedFilters),A(v.firms),D(!0),S({title:"Search Complete!",description:`Found ${v.firms.length} firms.`}),h&&h(),ne()):j(v.error||"No firms found."),w()}).catch(v=>{E(v)})}})}catch(s){if(console.error("Search error:",s),s.status===401||(r=s.message)!=null&&r.includes("Authentication required"))j("Authentication required. Please sign in again."),S({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(s.status===402||s.error_code==="INSUFFICIENT_CREDITS"){const w=s.creditsNeeded||s.required||N*q,E=s.currentCredits||s.available||f.credits||0;j(`Insufficient credits. You need ${w} but have ${E}.`),S({title:"Insufficient Credits",description:`Need ${w}, have ${E}.`,variant:"destructive"}),h&&await h()}else s.status===502||s.error_code==="EXTERNAL_API_ERROR"?(j(s.message||"Search service temporarily unavailable."),S({title:"Service Unavailable",description:s.message||"Try again shortly.",variant:"destructive"})):(j(s.message||"An unexpected error occurred."),S({title:"Search Failed",description:s.message||"Please try again.",variant:"destructive"}))}finally{n==null||n.close(),G(!1),C(null)}},st=t=>{var x,i;const l=new URLSearchParams;if(l.set("company",t.name),(x=t.location)!=null&&x.display)l.set("location",t.location.display);else if((i=t.location)!=null&&i.city){const n=[t.location.city,t.location.state,t.location.country].filter(Boolean);l.set("location",n.join(", "))}m(`/contact-search?${l.toString()}`)},te=t=>{var l;return t.id||`${t.name}-${(l=t.location)==null?void 0:l.display}`},at=async t=>{const l=te(t);ve(l);try{t.id&&(K.current.add(t.id),B.current.add(t.id)),A(i=>i.filter(r=>t.id&&r.id?r.id!==t.id:te(r)!==l));const x=await V.deleteFirm(t);if(x.success){if(x.deletedCount===0){t.id&&(K.current.delete(t.id),B.current.delete(t.id)),A(i=>i.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?i:[...i,t]),S({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}if(S({title:"Firm deleted",description:"Removed from your Firm Library."}),b==="firm-library"){const i=[1e3,2e3,3e3];for(const n of i)setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},n)}}else throw t.id&&(K.current.delete(t.id),B.current.delete(t.id)),A(i=>i.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?i:[...i,t]),new Error(x.error||"Failed to delete firm")}catch(x){console.error("Delete firm error:",x),t.id&&(K.current.delete(t.id),B.current.delete(t.id)),A(i=>i.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?i:[...i,t]),S({title:"Delete failed",description:x instanceof Error?x.message:"Please try again.",variant:"destructive"})}finally{ve(null)}},it=async()=>{const t=u.length;me(!1);try{const l=u.map(r=>V.deleteFirm(r)),i=(await Promise.allSettled(l)).filter(r=>r.status==="fulfilled"&&r.value.success&&(r.value.deletedCount||0)>0).length,n=t-i;A([]),n===0?(S({title:"All firms deleted",description:`Removed ${i} firm${i!==1?"s":""} from your Firm Library.`}),b==="firm-library"&&setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},1e3)):(S({title:"Partial deletion",description:`Deleted ${i} of ${t} firms. ${n} failed.`,variant:"default"}),b==="firm-library"&&setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},1e3))}catch(l){console.error("Error deleting all firms:",l),A([]),S({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),b==="firm-library"&&setTimeout(async()=>{try{await _()}catch(x){console.error("Error reloading firms:",x)}},1e3)}},Ce=t=>{z(t.query),I(!1)},nt=(t,l)=>{z(t),xe(l),ue.current&&(ue.current.focus(),setTimeout(()=>{xe(null)},150))},ot=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),oe())},lt=()=>{if(f.tier==="free"){he(!0);return}if(!u||u.length===0)return;const l=["Company Name","Website","LinkedIn","Location","Industry"].join(","),x=u.map(w=>{var F,re,T,Fe;const E=Ee=>{if(!Ee)return"";const se=String(Ee);return se.includes(",")||se.includes('"')||se.includes(`
`)?`"${se.replace(/"/g,'""')}"`:se},v=((F=w.location)==null?void 0:F.display)||[(re=w.location)==null?void 0:re.city,(T=w.location)==null?void 0:T.state,(Fe=w.location)==null?void 0:Fe.country].filter(Boolean).join(", ");return[E(w.name),E(w.website),E(w.linkedinUrl),E(v),E(w.industry)].join(",")}),i=[l,...x].join(`
`),n=new Blob([i],{type:"text/csv;charset=utf-8;"}),r=document.createElement("a"),s=URL.createObjectURL(n);r.setAttribute("href",s),r.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),r.style.visibility="hidden",document.body.appendChild(r),r.click(),document.body.removeChild(r)},dt=()=>{he(!1),m("/pricing")},ke=((f==null?void 0:f.tier)==="pro"?"pro":"free")==="free"?10:40;return e.jsxs(Ft,{children:[e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(Et,{}),e.jsxs(Pt,{children:[e.jsx(At,{}),e.jsx("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#F8FAFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:e.jsxs("div",{children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Instrument Serif', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#64748B",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Lt,{videoId:"n_AYHEJSXrE"})})]}),e.jsx("div",{style:{display:"flex",justifyContent:"center",marginBottom:"36px"},children:e.jsxs("div",{style:{display:"inline-flex",gap:"0",background:"#F0F4FD",borderRadius:"12px",padding:"4px",margin:"0 auto"},children:[e.jsxs("button",{onClick:()=>J("firm-search"),style:{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"9px",border:"none",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"14px",fontWeight:500,transition:"all 0.15s ease",background:b==="firm-search"?"#2563EB":"transparent",color:b==="firm-search"?"white":"#64748B",boxShadow:b==="firm-search"?"0 1px 3px rgba(37, 99, 235, 0.2)":"none"},children:[e.jsx(Ke,{className:"h-4 w-4"}),"Find Companies"]}),e.jsxs("button",{onClick:()=>J("firm-library"),style:{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"9px",border:"none",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"14px",fontWeight:500,transition:"all 0.15s ease",background:b==="firm-library"?"#2563EB":"transparent",color:b==="firm-library"?"white":"#64748B",boxShadow:b==="firm-library"?"0 1px 3px rgba(37, 99, 235, 0.2)":"none"},children:[e.jsx(ie,{className:"h-4 w-4"}),"Company Tracker",u.length>0&&e.jsx("span",{style:{marginLeft:"6px",padding:"2px 8px",borderRadius:"6px",background:b==="firm-library"?"rgba(255, 255, 255, 0.2)":"rgba(37, 99, 235, 0.08)",color:b==="firm-library"?"white":"#2563EB",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"11px",fontWeight:600,letterSpacing:"0.03em"},children:u.length})]})]})}),e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(Tt,{value:b,onValueChange:J,className:"w-full",children:[e.jsxs(Ae,{value:"firm-search",className:"mt-0",children:[!o&&e.jsxs("div",{className:"mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-fadeInUp",style:{animationDelay:"150ms"},children:[e.jsx(le,{className:"h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-sm text-amber-700",children:"Please sign in to use Find Companies."})]}),e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid rgba(37, 99, 235, 0.08)",borderRadius:"14px",maxWidth:"900px",margin:"0 auto",boxShadow:"0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp firm-search-form-card",children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsxs("div",{className:"p-8 firm-search-form-content",children:[e.jsxs("div",{className:"flex items-start justify-between mb-6 firm-search-header-row",children:[e.jsx("div",{className:"flex items-center gap-4 firm-search-header-content",children:e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-semibold text-gray-900 firm-search-form-title",children:"What type of companies are you looking for?"}),e.jsx("p",{className:"text-gray-600 mt-1 firm-search-form-subtitle",children:"Describe the type of companies you're looking for in plain English"})]})}),e.jsxs("button",{onClick:()=>I(!0),className:"firm-search-history-btn flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-all",children:[e.jsx(fe,{className:"w-4 h-4"}),"History"]})]}),e.jsxs("div",{className:"mb-6 firm-search-examples",children:[e.jsx("p",{className:"text-sm text-gray-500 mb-3",children:"Try an example or write your own"}),e.jsx("div",{className:"flex flex-wrap gap-2 firm-search-example-chips",children:Vt.map(t=>e.jsx("button",{onClick:()=>nt(t.query,t.id),className:`px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm text-gray-600 
                                         hover:bg-blue-50 hover:text-gray-900 hover:border-blue-200 
                                         transition-all duration-150`,children:t.label},t.id))})]}),e.jsxs("div",{className:"relative firm-search-textarea-wrapper",children:[e.jsx("textarea",{ref:ue,value:R,onChange:t=>z(t.target.value),onKeyDown:ot,onFocus:()=>xe(null),placeholder:"e.g., Mid-sized investment banks in New York focused on healthcare M&A...",rows:4,disabled:y||!o,className:`w-full p-4 pr-14 text-base border-2 rounded-2xl firm-search-textarea
                                     text-gray-900 placeholder-gray-400 resize-none
                                     transition-all duration-150 disabled:opacity-50
                                     border-gray-200 hover:border-gray-300
                                     focus:border-blue-400 focus:bg-blue-50/20 focus:ring-1 focus:ring-blue-400/20
                                     ${rt!==null?"bg-blue-50/30 border-blue-300":""}`}),e.jsx("button",{onClick:()=>oe(),disabled:!X||y||!o,className:`
                            absolute bottom-4 right-4 w-10 h-10 rounded-full
                            flex items-center justify-center transition-all duration-200
                            ${X&&!y&&o?"bg-blue-600 text-white shadow-md hover:scale-105":"bg-gray-100 text-gray-300 cursor-not-allowed"}
                          `,children:y?e.jsx(ae,{className:"w-5 h-5 animate-spin"}):e.jsx(vt,{className:"w-5 h-5"})})]}),e.jsx("p",{className:"mt-2 text-xs text-gray-400",children:"We'll convert this into structured filters automatically."}),e.jsxs("div",{className:"mt-3 flex flex-wrap items-center gap-x-1 text-sm",children:[e.jsx("span",{className:"text-gray-500",children:"Include"}),e.jsxs("span",{className:`font-medium ${Se?"text-green-600":"text-gray-900"}`,children:["industry",Se&&e.jsx(be,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsxs("span",{className:`font-medium ${pe?"text-green-600":"text-gray-900"}`,children:["location",pe&&e.jsx(be,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsx("span",{className:"text-gray-500",children:"and optionally size, focus areas, and keywords."})]}),Y&&e.jsxs("div",{className:"mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3",children:[e.jsx(le,{className:"h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-red-700 text-sm",children:Y})]}),e.jsxs("div",{className:"mt-8 pt-8 border-t border-gray-100 firm-search-quantity-section",children:[e.jsx("h3",{className:"text-lg font-semibold text-gray-900 mb-2 firm-search-quantity-title",children:"How many companies do you want to find?"}),e.jsx("p",{className:"text-gray-600 mb-5 firm-search-quantity-subtitle",children:"Companies are saved to your Company Tracker for easy access."}),e.jsxs("div",{className:"bg-gray-50 rounded-xl p-6 firm-search-quantity-card",children:[e.jsxs("div",{className:"flex items-center justify-between gap-4",children:[e.jsx("span",{className:"text-sm font-medium text-gray-700 whitespace-nowrap",children:"Quantity:"}),e.jsx("div",{className:"flex items-center gap-2 firm-search-quantity-buttons flex-1",children:Wt.map(t=>e.jsx("button",{onClick:()=>tt(t.value),disabled:y||t.value>ke,className:`
                                  px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-150 firm-search-quantity-btn flex-1
                                  ${N===t.value?"bg-blue-600 text-white shadow-sm":"bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-50"}
                                  ${t.value>ke?"opacity-50 cursor-not-allowed":""}
                                `,children:t.value},t.value))}),e.jsxs("span",{className:"text-sm text-gray-500 whitespace-nowrap min-w-[80px] text-right",children:[N*q," credits"]})]}),f.credits!==void 0&&f.credits<N*q&&e.jsxs("p",{className:"text-xs text-amber-600 mt-3 flex items-center gap-1",children:[e.jsx(le,{className:"w-3 h-3"}),"Insufficient credits. You need ",N*q," but have ",f.credits,"."]})]})]}),e.jsxs("div",{className:"mt-8 firm-search-cta",children:[e.jsx("button",{ref:Q,onClick:()=>oe(),disabled:!X||y||!o||(f.credits??0)<N*q||(f.credits??0)===0,className:`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto firm-search-find-btn
                            transition-all duration-200 transform
                            ${!X||y||!o||(f.credits??0)<N*q||(f.credits??0)===0?"bg-gray-300 text-gray-500 cursor-not-allowed":"bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-100"}
                          `,children:y?e.jsxs(e.Fragment,{children:[e.jsx(ae,{className:"w-5 h-5 animate-spin"}),"Searching..."]}):e.jsxs(e.Fragment,{children:["Find Companies",e.jsx(Nt,{className:"w-5 h-5"})]})}),e.jsx("div",{className:"mt-3 text-center",children:(f.credits??0)===0?e.jsxs("div",{children:[e.jsx("p",{className:"text-xs text-red-500",children:"No credits remaining"}),e.jsx("button",{onClick:()=>m("/pricing"),className:"text-xs text-primary hover:underline mt-1",children:"Upgrade for more credits →"})]}):(f.credits??0)<50?e.jsxs("p",{className:"text-xs text-orange-500",children:["⚠ ",f.credits," credits remaining"]}):e.jsxs("p",{className:"text-xs text-muted-foreground",children:[f.credits," credits remaining"]})}),R&&!X&&e.jsxs("p",{className:"text-center text-sm text-amber-600 mt-4 flex items-center justify-center gap-1",children:[e.jsx(le,{className:"w-4 h-4"}),"Please include both an industry and location in your search"]})]}),k.length>0&&!d&&e.jsx("div",{className:"mt-6 flex justify-center",children:e.jsxs($t,{children:[e.jsx(Ht,{asChild:!0,children:e.jsxs("button",{className:"flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors",children:[e.jsx(fe,{className:"w-4 h-4"}),e.jsx("span",{children:"Recent Searches"}),k.length>0&&e.jsxs("span",{className:"text-xs text-gray-400",children:["(",k.length,")"]})]})}),e.jsxs(Ge,{align:"start",side:"bottom",className:"w-80",children:[e.jsx(Qe,{children:"Recent Searches"}),e.jsx(we,{}),k.slice(0,3).map(t=>e.jsxs(ye,{onClick:()=>Ce(t),className:"flex flex-col items-start gap-1 py-3 px-3 cursor-pointer",children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2 w-full",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500",children:[t.resultsCount," companies • ",new Date(t.createdAt).toLocaleDateString()]})]},t.id)),k.length>3&&e.jsxs(e.Fragment,{children:[e.jsx(we,{}),e.jsxs(ye,{onClick:()=>I(!0),className:"text-center justify-center",children:["View all (",k.length,")"]})]})]})]})})]})]})]}),e.jsx(Ae,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid rgba(37, 99, 235, 0.08)",borderRadius:"14px",maxWidth:"900px",margin:"0 auto",boxShadow:"0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 border-b border-gray-100 mb-6",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold text-gray-900",children:[u.length," ",u.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm text-gray-500 mt-1",children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(de,{onClick:()=>{ee.current=!1,_()},variant:"outline",size:"sm",className:"gap-2 border-gray-300 text-gray-700 hover:bg-gray-50",disabled:Z,children:[Z?e.jsx(ae,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),u.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(de,{onClick:()=>me(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Xe,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(de,{onClick:lt,className:`gap-2 ${f.tier==="free"?"bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60":"bg-gray-900 hover:bg-gray-800"}`,disabled:f.tier==="free",title:f.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(St,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),Z?e.jsx(It,{variant:"card",count:3}):u.length>0?e.jsx(_t,{firms:u,onViewContacts:st,onDelete:at,deletingId:Je}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(ie,{className:"h-8 w-8 text-gray-900"})}),e.jsx("h3",{className:"text-lg font-semibold text-gray-900 mb-2",children:"No companies yet"}),e.jsx("p",{className:"text-sm text-gray-500 mb-6",children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>J("firm-search"),className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"Find Companies"})]})]})]})})]})})]})})]}),H&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold text-gray-900",children:"Search History"}),e.jsx("button",{onClick:()=>I(!1),className:"p-2 hover:bg-gray-100 rounded-lg",children:e.jsx(Ct,{className:"w-5 h-5 text-gray-500"})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:U?e.jsx("div",{className:"py-8 text-center",children:e.jsx(ae,{className:"h-6 w-6 text-gray-400 animate-spin mx-auto"})}):k.length===0?e.jsxs("div",{className:"py-8 text-center text-gray-500",children:[e.jsx(fe,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):k.map(t=>e.jsxs("div",{onClick:()=>Ce(t),className:"flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors",children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(Be,{className:"w-4 h-4 text-gray-400"})]},t.id))})]})}),y&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200",children:[e.jsxs("div",{className:"w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 relative",children:[e.jsx("div",{className:"absolute inset-0 bg-gray-200/50 rounded-2xl animate-pulse"}),e.jsx(ie,{className:"w-10 h-10 text-gray-900 relative z-10"})]}),e.jsx("h3",{className:"text-2xl font-bold text-gray-900 mb-2",children:"Searching for companies"}),e.jsx("p",{className:"text-gray-600 mb-6 text-sm min-h-[20px]",children:(c==null?void 0:c.step)||`Finding ${N} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner",children:e.jsx("div",{className:"bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden",style:{width:c?`${Math.max(2,Math.min(98,c.current/c.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium text-blue-600",children:c?`${c.current} of ${c.total} companies`:"Starting..."}),e.jsx("span",{className:"text-gray-500",children:c?`${Math.round(c.current/c.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs text-gray-400 mt-4",children:"This usually takes 10-20 seconds"})]})}),$&&u.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn",children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(kt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold text-gray-900 mb-1",children:["Found ",u.length," companies!"]}),e.jsx("p",{className:"text-gray-600 mb-2",children:"Matching your criteria"}),e.jsx("p",{className:"text-sm text-blue-600 font-medium mb-6",children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{D(!1),J("firm-library")},className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"View Companies →"}),e.jsx("button",{onClick:()=>{D(!1),z(""),g(!1)},className:"px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors",children:"Search again"})]})]})}),e.jsx(Te,{open:Ze,onOpenChange:me,children:e.jsxs(Re,{children:[e.jsxs(De,{children:[e.jsx(Ie,{children:"Delete All Companies?"}),e.jsxs(Le,{children:["This will permanently remove all ",u.length," ",u.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(ze,{children:[e.jsx(Pe,{children:"Cancel"}),e.jsx(Me,{onClick:it,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Te,{open:et,onOpenChange:he,children:e.jsxs(Re,{children:[e.jsxs(De,{children:[e.jsx(Ie,{children:"Upgrade to Export CSV"}),e.jsx(Le,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(ze,{children:[e.jsx(Pe,{children:"Cancel"}),e.jsx(Me,{onClick:dt,className:"bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",children:"Upgrade to Pro/Elite"})]})]})})]}),e.jsx("style",{children:`
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
      `}),b==="firm-search"&&e.jsx(Mt,{originalButtonRef:Q,onClick:()=>oe(),isLoading:y,disabled:!X||y||!o||(f.credits??0)<N*q,buttonClassName:"rounded-full",children:e.jsx("span",{children:"Find Companies"})})]})};export{sr as default};
