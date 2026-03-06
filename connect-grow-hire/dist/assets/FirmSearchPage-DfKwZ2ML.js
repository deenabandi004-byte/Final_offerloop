import{b1 as ht,b2 as ut,r as a,j as e,b3 as xt,b4 as Oe,b5 as Ue,b6 as qe,b7 as Be,b8 as _e,a3 as Ve,b9 as We,ba as Ye,bb as Ke,a9 as ye,bc as Xe,bd as pt,aK as ie,I as Ge,be as ft,y as gt,ah as bt,bf as wt,L as ae,l as Qe,aA as yt,a2 as jt,u as vt,f as Nt,Y as ce,bg as be,bh as Ct,p as St,ai as kt,X as Ft,ak as Et}from"./vendor-react-D4h_QE9m.js";import{S as At,A as Tt,a as Dt}from"./AppHeader-BpvxAP1h.js";import{T as It,c as De}from"./tabs-DBIIuXa1.js";import{f as M,B as de,u as Lt,m as Rt,b as V,t as N,l as zt}from"./index-Cgoag3C3.js";import{V as Pt}from"./VideoDemo-D6P3kmSN.js";import{A as Ie,a as Le,b as Re,c as ze,d as Pe,e as Me,f as $e,g as He}from"./alert-dialog-BjIrvL_-.js";import{I as Mt}from"./input-DMu5SxYl.js";import{M as $t}from"./MainContentWrapper-C40Qj3ur.js";import{S as Ht}from"./StickyCTA-CerjsR3v.js";const Ot=ht,Ut=ut,qt=a.forwardRef(({className:h,inset:u,children:x,...c},g)=>e.jsxs(_e,{ref:g,className:M("flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-blue-600 focus:text-white data-[state=open]:bg-blue-600 data-[state=open]:text-white hover:bg-blue-100 hover:text-blue-900",u&&"pl-8",h),...c,children:[x,e.jsx(Ve,{className:"ml-auto h-4 w-4"})]}));qt.displayName=_e.displayName;const Bt=a.forwardRef(({className:h,...u},x)=>e.jsx(We,{ref:x,className:M("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",h),...u}));Bt.displayName=We.displayName;const Je=a.forwardRef(({className:h,sideOffset:u=4,...x},c)=>e.jsx(xt,{children:e.jsx(Oe,{ref:c,sideOffset:u,className:M("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",h),...x})}));Je.displayName=Oe.displayName;const je=a.forwardRef(({className:h,inset:u,...x},c)=>e.jsx(Be,{ref:c,className:M("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",u&&"pl-8",h),...x}));je.displayName=Be.displayName;const _t=a.forwardRef(({className:h,children:u,checked:x,...c},g)=>e.jsxs(Ye,{ref:g,className:M("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",h),checked:x,...c,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(Ke,{children:e.jsx(ye,{className:"h-4 w-4 text-white"})})}),u]}));_t.displayName=Ye.displayName;const Vt=a.forwardRef(({className:h,children:u,...x},c)=>e.jsxs(Xe,{ref:c,className:M("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-blue-600 focus:text-white hover:bg-blue-100 hover:text-blue-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",h),...x,children:[e.jsx("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:e.jsx(Ke,{children:e.jsx(pt,{className:"h-2 w-2 fill-current text-white"})})}),u]}));Vt.displayName=Xe.displayName;const Ze=a.forwardRef(({className:h,inset:u,...x},c)=>e.jsx(Ue,{ref:c,className:M("px-2 py-1.5 text-sm font-semibold",u&&"pl-8",h),...x}));Ze.displayName=Ue.displayName;const ve=a.forwardRef(({className:h,...u},x)=>e.jsx(qe,{ref:x,className:M("-mx-1 my-1 h-px bg-muted",h),...u}));ve.displayName=qe.displayName;function Wt({firms:h,onViewContacts:u,onDelete:x,deletingId:c}){const[g,me]=a.useState("name"),[m,z]=a.useState("desc"),[A,C]=a.useState(""),[P,p]=a.useState(h);a.useEffect(()=>{if(!A.trim()){p(h);return}const i=h.filter(w=>{var f,I,$,L,H,R,S,O,U,G,Q;const b=A.toLowerCase();return((f=w.name)==null?void 0:f.toLowerCase().includes(b))||((I=w.industry)==null?void 0:I.toLowerCase().includes(b))||((L=($=w.location)==null?void 0:$.display)==null?void 0:L.toLowerCase().includes(b))||((R=(H=w.location)==null?void 0:H.city)==null?void 0:R.toLowerCase().includes(b))||((O=(S=w.location)==null?void 0:S.state)==null?void 0:O.toLowerCase().includes(b))||((G=(U=w.location)==null?void 0:U.country)==null?void 0:G.toLowerCase().includes(b))||((Q=w.website)==null?void 0:Q.toLowerCase().includes(b))});p(i)},[A,h]);const D=[...P].sort((i,w)=>{var I,$,L,H,R,S,O,U;let b,f;switch(g){case"name":b=((I=i.name)==null?void 0:I.toLowerCase())||"",f=(($=w.name)==null?void 0:$.toLowerCase())||"";break;case"location":b=((H=(L=i.location)==null?void 0:L.display)==null?void 0:H.toLowerCase())||"",f=((S=(R=w.location)==null?void 0:R.display)==null?void 0:S.toLowerCase())||"";break;case"industry":b=((O=i.industry)==null?void 0:O.toLowerCase())||"",f=((U=w.industry)==null?void 0:U.toLowerCase())||"";break;default:return 0}return b<f?m==="asc"?-1:1:b>f?m==="asc"?1:-1:0}),ne=i=>{g===i?z(m==="asc"?"desc":"asc"):(me(i),z("desc"))},W=({field:i})=>g!==i?null:m==="asc"?e.jsx(yt,{className:"h-4 w-4 inline-block ml-1"}):e.jsx(jt,{className:"h-4 w-4 inline-block ml-1"}),X=i=>{var w;return i.id||`${i.name}-${(w=i.location)==null?void 0:w.display}`};return e.jsxs("div",{className:"bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden firm-search-results-wrapper",children:[e.jsx("div",{className:"px-6 py-4 border-b border-border bg-muted firm-results-header",children:e.jsxs("div",{className:"flex items-center justify-between firm-results-header-row",children:[e.jsxs("div",{className:"flex items-center space-x-2 firm-results-header-content",children:[e.jsx(ie,{className:"h-5 w-5 text-blue-400"}),e.jsxs("span",{className:"font-medium text-foreground firm-results-count",children:[P.length," ",P.length===1?"firm":"firms",A&&` (filtered from ${h.length})`]})]}),e.jsx("p",{className:"text-sm text-muted-foreground firm-results-helper-text",children:'Click "View Contacts" to find professionals at any firm'})]})}),e.jsx("div",{className:"px-6 py-4 border-b border-border bg-background",children:e.jsxs("div",{className:"relative w-80",children:[e.jsx(Ge,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"}),e.jsx(Mt,{type:"text",placeholder:"Search firms...",value:A,onChange:i=>C(i.target.value),className:"pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary"})]})}),P.length===0&&h.length>0&&A&&e.jsxs("div",{className:"px-6 py-12 text-center",children:[e.jsx("p",{className:"text-muted-foreground mb-2",children:"No firms match your search."}),e.jsx("button",{onClick:()=>C(""),className:"text-sm text-blue-400 hover:text-blue-300 underline",children:"Clear search"})]}),P.length>0&&e.jsx("div",{className:"overflow-x-auto firm-table-wrapper",children:e.jsxs("table",{className:"min-w-full divide-y divide-border firm-table",children:[e.jsx("thead",{className:"bg-muted",children:e.jsxs("tr",{children:[e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>ne("name"),children:["Company Name",e.jsx(W,{field:"name"})]}),e.jsx("th",{scope:"col",className:"px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Website"}),e.jsx("th",{scope:"col",className:"px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"LinkedIn"}),e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>ne("location"),children:["Location",e.jsx(W,{field:"location"})]}),e.jsxs("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary transition-colors",onClick:()=>ne("industry"),children:["Industry",e.jsx(W,{field:"industry"})]}),e.jsx("th",{scope:"col",className:"px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Actions"})]})}),e.jsx("tbody",{className:"bg-background divide-y divide-border",children:D.map((i,w)=>{var b;return e.jsxs("tr",{className:"hover:bg-secondary transition-colors",children:[e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsxs("div",{className:"flex items-center",children:[e.jsx("div",{className:"flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30",children:e.jsx(ie,{className:"h-5 w-5 text-blue-400"})}),e.jsx("div",{className:"ml-4",children:e.jsx("div",{className:"text-sm font-medium text-foreground",children:i.name})})]})}),e.jsx("td",{className:"px-4 py-4 whitespace-nowrap text-center",children:i.website?e.jsx("a",{href:i.website,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors",title:i.website,children:e.jsx(ft,{className:"h-5 w-5"})}):e.jsx("span",{className:"text-muted-foreground",children:"—"})}),e.jsx("td",{className:"px-4 py-4 whitespace-nowrap text-center",children:i.linkedinUrl?e.jsx("a",{href:i.linkedinUrl,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center justify-center p-2 text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors",title:"View on LinkedIn",children:e.jsx(gt,{className:"h-5 w-5"})}):e.jsx("span",{className:"text-muted-foreground",children:"—"})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsxs("div",{className:"flex items-center text-sm text-foreground",children:[e.jsx(bt,{className:"h-4 w-4 text-muted-foreground mr-1.5 flex-shrink-0"}),e.jsx("span",{children:((b=i.location)==null?void 0:b.display)||"—"})]})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.jsx("span",{className:"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 capitalize",children:i.industry||"—"})}),e.jsx("td",{className:"px-6 py-4 whitespace-nowrap text-right",children:e.jsxs("div",{className:"flex items-center justify-end gap-2",children:[e.jsxs("button",{onClick:()=>u(i),className:"inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-300 bg-blue-500/20 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 hover:text-blue-200 transition-colors",children:[e.jsx(wt,{className:"h-4 w-4 mr-1.5"}),"View Contacts"]}),x&&e.jsx(de,{size:"sm",variant:"ghost",className:"text-red-300 hover:text-red-200 hover:bg-red-500/10",disabled:c===X(i),onClick:()=>x(i),children:c===X(i)?e.jsx(ae,{className:"h-4 w-4 animate-spin"}):e.jsx(Qe,{className:"h-4 w-4"})})]})})]},i.id||w)})})]})}),P.length>0&&e.jsx("div",{className:"px-6 py-4 border-t border-border bg-muted firm-helper-text",children:e.jsx("p",{className:"text-sm text-muted-foreground text-center firm-helper-text-content",children:'Click on column headers to sort • Click "View Contacts" to find professionals at any firm'})}),e.jsx("style",{children:`
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
      `})]})}const Yt=[{id:1,label:"Tech startups in SF",query:"Early-stage tech startups in San Francisco focused on AI/ML"},{id:2,label:"Healthcare M&A banks",query:"Mid-sized investment banks in New York focused on healthcare M&A"},{id:3,label:"Consulting in Chicago",query:"Management consulting firms in Chicago with 100-500 employees"},{id:4,label:"Fintech in London",query:"Series B+ fintech companies in London focused on payments"}],we="scout_auto_populate",Kt=[{value:5},{value:10},{value:20},{value:40}],ir=({embedded:h=!1})=>{const u=vt(),x=Nt(),{user:c,checkCredits:g}=Lt(),{openPanelWithSearchHelp:me}=Rt(),m=c||{credits:0,tier:"free"},[z,A]=a.useState(""),[C,P]=a.useState(!1),[p,D]=a.useState([]),[ne,W]=a.useState(null),[X,i]=a.useState(null),[w,b]=a.useState(!1),[f,I]=a.useState(null),[$,L]=a.useState(!1),[H,R]=a.useState(!1),[S,O]=a.useState([]),[U,G]=a.useState(!1),Q=a.useRef(null),[k,J]=a.useState("firm-search"),[Z,he]=a.useState(!1),[et,Ne]=a.useState(null),[tt,ue]=a.useState(!1),[rt,xe]=a.useState(!1),Ce=a.useRef([]),Y=a.useRef(new Set),[v,st]=a.useState(10),[q]=a.useState(5),[at,pe]=a.useState(null),fe=a.useRef(null),Se=/\b(tech(nology)?|fintech|finance|banking|consulting|healthcare|pharma|biotech|energy|legal|law|real estate|insurance|media|advertising|marketing|retail|e-?commerce|education|edtech|telecom|manufacturing|automotive|aerospace|defense|crypto|blockchain|saas|ai|artificial intelligence|machine learning|data|analytics|cybersecurity|cloud|devops|enterprise|logistics|supply chain|food|agri(culture)?|hospitality|travel|gaming|entertainment|sports|venture capital|private equity|investment|wealth management|asset management|accounting|audit|tax|compliance|government|nonprofit|sustainability|cleantech|construction|architecture|design|fashion|beauty|fitness|wellness|startup|b2b|b2c|marketplace|platform|software|engineering|recruiting|staffing|hr|human resources)\b/i.test(z),ge=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(z),K=z.length>20&&ge;a.useEffect(()=>{g&&c&&g()},[v,g,c]),a.useEffect(()=>{Ce.current=p},[p]),a.useEffect(()=>{const t=d=>{const{industry:n,location:o,size:r}=d;let s="";n&&(s+=n),o&&(s+=(s?" in ":"")+o),r&&(s+=(s?", ":"")+r),s&&(A(s),N({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},l=()=>{var d;try{const n=(d=x.state)==null?void 0:d.scoutAutoPopulate;if((n==null?void 0:n.search_type)==="firm"){t(n),sessionStorage.removeItem(we),u(x.pathname,{replace:!0,state:{}});return}const o=sessionStorage.getItem(we);if(o){const r=JSON.parse(o);let s;r.search_type==="firm"&&(r.auto_populate?s=r.auto_populate:s=r,t(s),sessionStorage.removeItem(we))}}catch(n){console.error("[Scout] Auto-populate error:",n)}};return l(),window.addEventListener("scout-auto-populate",l),()=>window.removeEventListener("scout-auto-populate",l)},[x.state,x.pathname,u]);const B=a.useRef(new Set),_=a.useCallback(async()=>{if(!c){he(!1);return}he(!0);try{const t=await V.getFirmSearchHistory(100,!0),l=[],d=new Set,n=new Set;t.forEach(r=>{r.results&&Array.isArray(r.results)&&r.results.forEach(s=>{var E;if(s.id&&Y.current.has(s.id)||s.id&&B.current.has(s.id))return;const y=s.id||`${s.name}-${(E=s.location)==null?void 0:E.display}`;s.id?d.has(s.id)||(d.add(s.id),l.push(s)):n.has(y)||(n.add(y),l.push(s))})});const o=l.filter(r=>!(r.id&&Y.current.has(r.id)));B.current.size>0&&B.current.clear(),D(o),ee.current=!1}catch(t){console.error("Failed to load saved firms:",t),N({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{he(!1)}},[c]),oe=a.useCallback(async()=>{if(c){G(!0);try{const t=await V.getFirmSearchHistory(10);O(t)}catch(t){console.error("Failed to load search history:",t)}finally{G(!1)}}},[c]);a.useEffect(()=>{oe(),g&&g()},[oe,g]);const ee=a.useRef(!1);a.useEffect(()=>{if(k!=="firm-library"){ee.current=!1;return}c&&(Z||ee.current||Ce.current.length>0||(ee.current=!0,_()))},[k,c,_,Z]);const le=async t=>{var r;const l=z;if(!l.trim()){i("Please enter a search query");return}if(!c){i("Please sign in to search for firms"),N({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}P(!0),i(null),b(!0),L(!1);const d=2+Math.ceil(v/5)*2,n=d<60?`${d} seconds`:`${Math.ceil(d/60)} minutes`;I({current:0,total:v,step:`Starting search... (est. ${n})`});let o=null;try{const{searchId:s}=await V.searchFirmsAsync(l,v);o=await V.createFirmSearchStream(s),await new Promise((y,E)=>{o.addEventListener("progress",j=>{try{const F=JSON.parse(j.data);I({current:F.current??0,total:F.total??v,step:F.step||"Searching..."})}catch{}}),o.addEventListener("complete",j=>{var F,re;o==null||o.close();try{const T=JSON.parse(j.data);I(null),T.success&&((F=T.firms)==null?void 0:F.length)>0?(W(T.parsedFilters),D(T.firms),L(!0),N({title:"Search Complete!",description:`Found ${T.firms.length} firm${T.firms.length!==1?"s":""}. Used ${T.creditsCharged||0} credits.`}),g&&g(),oe()):((re=T.firms)==null?void 0:re.length)===0?(i("No firms found matching your criteria. Try broadening your search."),me({searchType:"firm",failedSearchParams:{industry:l,location:"",size:""},errorType:"no_results"})):i(T.error||"Search failed. Please try again.")}catch{i("Failed to parse search results.")}y()}),o.addEventListener("error",j=>{o==null||o.close();try{const F=JSON.parse(j.data);i(F.message||"Search failed.")}catch{i("Search connection lost. Please try again.")}y()}),o.onerror=()=>{o==null||o.close(),V.searchFirms(l,v).then(j=>{var F;I(null),j.success&&((F=j.firms)==null?void 0:F.length)>0?(W(j.parsedFilters),D(j.firms),L(!0),N({title:"Search Complete!",description:`Found ${j.firms.length} firms.`}),g&&g(),oe()):i(j.error||"No firms found."),y()}).catch(j=>{E(j)})}})}catch(s){if(console.error("Search error:",s),s.status===401||(r=s.message)!=null&&r.includes("Authentication required"))i("Authentication required. Please sign in again."),N({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(s.status===402||s.error_code==="INSUFFICIENT_CREDITS"){const y=s.creditsNeeded||s.required||v*q,E=s.currentCredits||s.available||m.credits||0;i(`Insufficient credits. You need ${y} but have ${E}.`),N({title:"Insufficient Credits",description:`Need ${y}, have ${E}.`,variant:"destructive"}),g&&await g()}else s.status===502||s.error_code==="EXTERNAL_API_ERROR"?(i(s.message||"Search service temporarily unavailable."),N({title:"Service Unavailable",description:s.message||"Try again shortly.",variant:"destructive"})):(i(s.message||"An unexpected error occurred."),N({title:"Search Failed",description:s.message||"Please try again.",variant:"destructive"}))}finally{o==null||o.close(),P(!1),I(null)}},it=t=>{var d,n;const l=new URLSearchParams;if(l.set("company",t.name),(d=t.location)!=null&&d.display)l.set("location",t.location.display);else if((n=t.location)!=null&&n.city){const o=[t.location.city,t.location.state,t.location.country].filter(Boolean);l.set("location",o.join(", "))}u(`/find?${l.toString()}`)},te=t=>{var l;return t.id||`${t.name}-${(l=t.location)==null?void 0:l.display}`},nt=async t=>{const l=te(t);Ne(l);try{t.id&&(Y.current.add(t.id),B.current.add(t.id)),D(n=>n.filter(r=>t.id&&r.id?r.id!==t.id:te(r)!==l));const d=await V.deleteFirm(t);if(d.success){if(d.deletedCount===0){t.id&&(Y.current.delete(t.id),B.current.delete(t.id)),D(n=>n.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?n:[...n,t]),N({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}if(N({title:"Firm deleted",description:"Removed from your Firm Library."}),k==="firm-library"){const n=[1e3,2e3,3e3];for(const o of n)setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},o)}}else throw t.id&&(Y.current.delete(t.id),B.current.delete(t.id)),D(n=>n.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?n:[...n,t]),new Error(d.error||"Failed to delete firm")}catch(d){console.error("Delete firm error:",d),t.id&&(Y.current.delete(t.id),B.current.delete(t.id)),D(n=>n.some(r=>t.id&&r.id?r.id===t.id:te(r)===l)?n:[...n,t]),N({title:"Delete failed",description:d instanceof Error?d.message:"Please try again.",variant:"destructive"})}finally{Ne(null)}},ot=async()=>{const t=p.length;ue(!1);try{const l=p.map(r=>V.deleteFirm(r)),n=(await Promise.allSettled(l)).filter(r=>r.status==="fulfilled"&&r.value.success&&(r.value.deletedCount||0)>0).length,o=t-n;D([]),o===0?(N({title:"All firms deleted",description:`Removed ${n} firm${n!==1?"s":""} from your Firm Library.`}),k==="firm-library"&&setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},1e3)):(N({title:"Partial deletion",description:`Deleted ${n} of ${t} firms. ${o} failed.`,variant:"default"}),k==="firm-library"&&setTimeout(async()=>{try{await _()}catch(r){console.error("Error reloading firms:",r)}},1e3))}catch(l){console.error("Error deleting all firms:",l),D([]),N({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),k==="firm-library"&&setTimeout(async()=>{try{await _()}catch(d){console.error("Error reloading firms:",d)}},1e3)}},ke=t=>{A(t.query),R(!1)},lt=(t,l)=>{A(t),pe(l),fe.current&&(fe.current.focus(),setTimeout(()=>{pe(null)},150))},ct=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),le())},dt=()=>{if(m.tier==="free"){xe(!0);return}if(!p||p.length===0)return;const l=["Company Name","Website","LinkedIn","Location","Industry"].join(","),d=p.map(y=>{var F,re,T,Ae;const E=Te=>{if(!Te)return"";const se=String(Te);return se.includes(",")||se.includes('"')||se.includes(`
`)?`"${se.replace(/"/g,'""')}"`:se},j=((F=y.location)==null?void 0:F.display)||[(re=y.location)==null?void 0:re.city,(T=y.location)==null?void 0:T.state,(Ae=y.location)==null?void 0:Ae.country].filter(Boolean).join(", ");return[E(y.name),E(y.website),E(y.linkedinUrl),E(j),E(y.industry)].join(",")}),n=[l,...d].join(`
`),o=new Blob([n],{type:"text/csv;charset=utf-8;"}),r=document.createElement("a"),s=URL.createObjectURL(o);r.setAttribute("href",s),r.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),r.style.visibility="hidden",document.body.appendChild(r),r.click(),document.body.removeChild(r)},mt=()=>{xe(!1),u("/pricing")},Fe=((m==null?void 0:m.tier)==="pro"?"pro":"free")==="free"?10:40,Ee=e.jsxs(e.Fragment,{children:[e.jsxs("div",{children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",marginBottom:"16px",marginTop:"-4px"},children:e.jsxs("div",{style:{display:"inline-flex",gap:"6px"},children:[e.jsxs("button",{onClick:()=>J("firm-search"),style:{display:"flex",alignItems:"center",gap:"5px",padding:"5px 12px",borderRadius:"6px",border:k==="firm-search"?"1px solid #CBD5E1":"1px solid transparent",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"12px",fontWeight:500,transition:"all 0.15s ease",background:k==="firm-search"?"#F8FAFC":"transparent",color:k==="firm-search"?"#334155":"#94A3B8"},children:[e.jsx(Ge,{className:"h-3 w-3"}),"Find Companies"]}),e.jsxs("button",{onClick:()=>J("firm-library"),style:{display:"flex",alignItems:"center",gap:"5px",padding:"5px 12px",borderRadius:"6px",border:k==="firm-library"?"1px solid #CBD5E1":"1px solid transparent",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"12px",fontWeight:500,transition:"all 0.15s ease",background:k==="firm-library"?"#F8FAFC":"transparent",color:k==="firm-library"?"#334155":"#94A3B8"},children:[e.jsx(ie,{className:"h-3 w-3"}),"Company Tracker",p.length>0&&e.jsx("span",{style:{marginLeft:"2px",padding:"1px 6px",borderRadius:"4px",background:"rgba(100, 116, 139, 0.08)",color:"#64748B",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"10px",fontWeight:600,letterSpacing:"0.03em"},children:p.length})]})]})}),e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(It,{value:k,onValueChange:J,className:"w-full",children:[e.jsxs(De,{value:"firm-search",className:"mt-0",children:[!c&&e.jsxs("div",{className:"mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 animate-fadeInUp",style:{animationDelay:"150ms"},children:[e.jsx(ce,{className:"h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-sm text-amber-700",children:"Please sign in to use Find Companies."})]}),e.jsxs("div",{style:{maxWidth:"680px",margin:"0 auto",animationDelay:"200ms"},className:"w-full px-4 py-2 sm:px-6 animate-fadeInUp firm-search-form-card",children:[e.jsx("div",{className:"h-1"}),e.jsxs("div",{className:"py-2 firm-search-form-content",children:[e.jsxs("div",{className:"flex items-start justify-between mb-6 firm-search-header-row",children:[e.jsx("div",{className:"flex items-center gap-4 firm-search-header-content",children:e.jsxs("div",{children:[e.jsx("h2",{className:"text-xl font-semibold text-gray-900 firm-search-form-title",children:"What type of companies are you looking for?"}),e.jsx("p",{className:"text-gray-600 mt-1 firm-search-form-subtitle",children:"Describe the type of companies you're looking for in plain English"})]})}),e.jsxs("button",{onClick:()=>R(!0),className:"firm-search-history-btn flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-blue-600 transition-all border border-transparent hover:border-blue-200/60 hover:bg-white/60",children:[e.jsx(be,{className:"w-4 h-4"}),"History"]})]}),e.jsxs("div",{className:"mb-6 firm-search-examples",children:[e.jsx("p",{className:"text-sm text-gray-500 mb-3",children:"Try an example or write your own"}),e.jsx("div",{className:"flex flex-wrap gap-2 firm-search-example-chips",children:Yt.map(t=>e.jsx("button",{onClick:()=>lt(t.query,t.id),className:`px-3 py-1.5 bg-white/50 backdrop-blur-sm border border-black/[0.08] rounded-full text-sm text-gray-600 
                                         hover:bg-white/90 hover:text-blue-600 hover:border-blue-200/60
                                         transition-all duration-150`,children:t.label},t.id))})]}),e.jsxs("div",{className:"relative firm-search-textarea-wrapper",children:[e.jsx("textarea",{ref:fe,value:z,onChange:t=>A(t.target.value),onKeyDown:ct,onFocus:()=>pe(null),placeholder:"e.g., Mid-sized investment banks in New York focused on healthcare M&A...",rows:4,disabled:C||!c,className:`w-full p-4 pr-14 text-base border-2 rounded-2xl firm-search-textarea
                                     text-gray-900 placeholder-gray-400 resize-none
                                     transition-all duration-150 disabled:opacity-50
                                     border-gray-200 hover:border-gray-300
                                     focus:border-blue-400 focus:bg-blue-50/20 focus:ring-1 focus:ring-blue-400/20
                                     ${at!==null?"bg-blue-50/30 border-blue-300":""}`}),e.jsx("button",{onClick:()=>le(),disabled:!K||C||!c,className:`
                            absolute bottom-4 right-4 w-10 h-10 rounded-full
                            flex items-center justify-center transition-all duration-200
                            ${K&&!C&&c?"bg-blue-600 text-white shadow-md hover:scale-105":"bg-gray-100 text-gray-300 cursor-not-allowed"}
                          `,children:C?e.jsx(ae,{className:"w-5 h-5 animate-spin"}):e.jsx(Ct,{className:"w-5 h-5"})})]}),e.jsx("p",{className:"mt-2 text-xs text-gray-400",children:"We'll convert this into structured filters automatically."}),e.jsxs("div",{className:"mt-3 flex flex-wrap items-center gap-x-1 text-sm",children:[e.jsx("span",{className:"text-gray-500",children:"Include"}),e.jsxs("span",{className:`font-medium ${Se?"text-green-600":"text-gray-900"}`,children:["industry",Se&&e.jsx(ye,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsxs("span",{className:`font-medium ${ge?"text-green-600":"text-gray-900"}`,children:["location",ge&&e.jsx(ye,{className:"w-3 h-3 inline ml-0.5"})]}),e.jsx("span",{className:"text-gray-400",children:"(required),"}),e.jsx("span",{className:"text-gray-500",children:"and optionally size, focus areas, and keywords."})]}),X&&e.jsxs("div",{className:"mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3",children:[e.jsx(ce,{className:"h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"}),e.jsx("p",{className:"text-red-700 text-sm",children:X})]}),e.jsxs("div",{className:"mt-8 pt-8 border-t border-black/[0.06] firm-search-quantity-section",children:[e.jsx("h3",{className:"text-base font-semibold text-gray-900 mb-1 firm-search-quantity-title",children:"How many companies do you want to find?"}),e.jsx("p",{className:"text-sm text-gray-500 mb-5 firm-search-quantity-subtitle",children:"Companies are saved to your Company Tracker for easy access."}),e.jsxs("div",{className:"firm-search-quantity-card",children:[e.jsxs("div",{className:"flex items-center justify-between gap-4",children:[e.jsx("span",{className:"text-sm font-medium text-gray-500 whitespace-nowrap",children:"Quantity:"}),e.jsx("div",{className:"flex items-center gap-2 firm-search-quantity-buttons flex-1",children:Kt.map(t=>e.jsx("button",{onClick:()=>st(t.value),disabled:C||t.value>Fe,className:`
                                  px-4 py-2 rounded-full font-semibold text-sm transition-all duration-150 firm-search-quantity-btn flex-1
                                  ${v===t.value?"bg-blue-600 text-white shadow-sm":"bg-white/60 backdrop-blur-sm text-gray-600 border border-black/[0.08] hover:border-blue-200/60 hover:text-blue-600 hover:bg-white/90"}
                                  ${t.value>Fe?"opacity-40 cursor-not-allowed":""}
                                `,children:t.value},t.value))}),e.jsxs("span",{className:"text-sm text-gray-500 whitespace-nowrap min-w-[80px] text-right",children:[v*q," credits"]})]}),m.credits!==void 0&&m.credits<v*q&&e.jsxs("p",{className:"text-xs text-amber-600 mt-3 flex items-center gap-1",children:[e.jsx(ce,{className:"w-3 h-3"}),"Insufficient credits. You need ",v*q," but have ",m.credits,"."]})]})]}),e.jsxs("div",{className:"mt-8 firm-search-cta",children:[e.jsx("button",{ref:Q,onClick:()=>le(),disabled:!K||C||!c||(m.credits??0)<v*q||(m.credits??0)===0,className:`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3 mx-auto firm-search-find-btn
                            transition-all duration-200 transform
                            ${!K||C||!c||(m.credits??0)<v*q||(m.credits??0)===0?"bg-gray-300 text-gray-500 cursor-not-allowed":"bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-100"}
                          `,children:C?e.jsxs(e.Fragment,{children:[e.jsx(ae,{className:"w-5 h-5 animate-spin"}),"Searching..."]}):e.jsxs(e.Fragment,{children:["Find Companies",e.jsx(St,{className:"w-5 h-5"})]})}),e.jsx("div",{className:"mt-3 text-center",children:(m.credits??0)===0?e.jsxs("div",{children:[e.jsx("p",{className:"text-xs text-red-500",children:"No credits remaining"}),e.jsx("button",{onClick:()=>u("/pricing"),className:"text-xs text-primary hover:underline mt-1",children:"Upgrade for more credits →"})]}):(m.credits??0)<50?e.jsxs("p",{className:"text-xs text-orange-500",children:["⚠ ",m.credits," credits remaining"]}):e.jsxs("p",{className:"text-xs text-muted-foreground",children:[m.credits," credits remaining"]})}),z&&!K&&e.jsxs("p",{className:"text-center text-sm text-amber-600 mt-4 flex items-center justify-center gap-1",children:[e.jsx(ce,{className:"w-4 h-4"}),"Please include both an industry and location in your search"]})]}),S.length>0&&!w&&e.jsx("div",{className:"mt-6 flex justify-center",children:e.jsxs(Ot,{children:[e.jsx(Ut,{asChild:!0,children:e.jsxs("button",{className:"flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors",children:[e.jsx(be,{className:"w-4 h-4"}),e.jsx("span",{children:"Recent Searches"}),S.length>0&&e.jsxs("span",{className:"text-xs text-gray-400",children:["(",S.length,")"]})]})}),e.jsxs(Je,{align:"start",side:"bottom",className:"w-80",children:[e.jsx(Ze,{children:"Recent Searches"}),e.jsx(ve,{}),S.slice(0,3).map(t=>e.jsxs(je,{onClick:()=>ke(t),className:"flex flex-col items-start gap-1 py-3 px-3 cursor-pointer",children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2 w-full",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500",children:[t.resultsCount," companies • ",new Date(t.createdAt).toLocaleDateString()]})]},t.id)),S.length>3&&e.jsxs(e.Fragment,{children:[e.jsx(ve,{}),e.jsxs(je,{onClick:()=>R(!0),className:"text-center justify-center",children:["View all (",S.length,")"]})]})]})]})})]})]})]}),e.jsx(De,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid rgba(37, 99, 235, 0.08)",borderRadius:"14px",maxWidth:"900px",margin:"0 auto",boxShadow:"0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 border-b border-gray-100 mb-6",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold text-gray-900",children:[p.length," ",p.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm text-gray-500 mt-1",children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(de,{onClick:()=>{ee.current=!1,_()},variant:"outline",size:"sm",className:"gap-2 border-gray-300 text-gray-700 hover:bg-gray-50",disabled:Z,children:[Z?e.jsx(ae,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),p.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(de,{onClick:()=>ue(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Qe,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(de,{onClick:dt,className:`gap-2 ${m.tier==="free"?"bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60":"bg-gray-900 hover:bg-gray-800"}`,disabled:m.tier==="free",title:m.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(kt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),Z?e.jsx(zt,{variant:"card",count:3}):p.length>0?e.jsx(Wt,{firms:p,onViewContacts:it,onDelete:nt,deletingId:et}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(ie,{className:"h-8 w-8 text-gray-900"})}),e.jsx("h3",{className:"text-lg font-semibold text-gray-900 mb-2",children:"No companies yet"}),e.jsx("p",{className:"text-sm text-gray-500 mb-6",children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>J("firm-search"),className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"Find Companies"})]})]})]})})]})})]}),H&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold text-gray-900",children:"Search History"}),e.jsx("button",{onClick:()=>R(!1),className:"p-2 hover:bg-gray-100 rounded-lg",children:e.jsx(Ft,{className:"w-5 h-5 text-gray-500"})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:U?e.jsx("div",{className:"py-8 text-center",children:e.jsx(ae,{className:"h-6 w-6 text-gray-400 animate-spin mx-auto"})}):S.length===0?e.jsxs("div",{className:"py-8 text-center text-gray-500",children:[e.jsx(be,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):S.map(t=>e.jsxs("div",{onClick:()=>ke(t),className:"flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 cursor-pointer transition-colors",children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-gray-900 text-sm line-clamp-2",children:t.query}),e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(Ve,{className:"w-4 h-4 text-gray-400"})]},t.id))})]})}),C&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200",children:[e.jsxs("div",{className:"w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6 relative",children:[e.jsx("div",{className:"absolute inset-0 bg-gray-200/50 rounded-2xl animate-pulse"}),e.jsx(ie,{className:"w-10 h-10 text-gray-900 relative z-10"})]}),e.jsx("h3",{className:"text-2xl font-bold text-gray-900 mb-2",children:"Searching for companies"}),e.jsx("p",{className:"text-gray-600 mb-6 text-sm min-h-[20px]",children:(f==null?void 0:f.step)||`Finding ${v} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full bg-gray-100 rounded-full h-3 overflow-hidden shadow-inner",children:e.jsx("div",{className:"bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden",style:{width:f?`${Math.max(2,Math.min(98,f.current/f.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium text-blue-600",children:f?`${f.current} of ${f.total} companies`:"Starting..."}),e.jsx("span",{className:"text-gray-500",children:f?`${Math.round(f.current/f.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs text-gray-400 mt-4",children:"This usually takes 10-20 seconds"})]})}),$&&p.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn",children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(Et,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold text-gray-900 mb-1",children:["Found ",p.length," companies!"]}),e.jsx("p",{className:"text-gray-600 mb-2",children:"Matching your criteria"}),e.jsx("p",{className:"text-sm text-blue-600 font-medium mb-6",children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{L(!1),J("firm-library")},className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"View Companies →"}),e.jsx("button",{onClick:()=>{L(!1),A(""),b(!1)},className:"px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors",children:"Search again"})]})]})}),e.jsx(Ie,{open:tt,onOpenChange:ue,children:e.jsxs(Le,{children:[e.jsxs(Re,{children:[e.jsx(ze,{children:"Delete All Companies?"}),e.jsxs(Pe,{children:["This will permanently remove all ",p.length," ",p.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(Me,{children:[e.jsx($e,{children:"Cancel"}),e.jsx(He,{onClick:ot,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Ie,{open:rt,onOpenChange:xe,children:e.jsxs(Le,{children:[e.jsxs(Re,{children:[e.jsx(ze,{children:"Upgrade to Export CSV"}),e.jsx(Pe,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(Me,{children:[e.jsx($e,{children:"Cancel"}),e.jsx(He,{onClick:mt,className:"bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),k==="firm-search"&&e.jsx(Ht,{originalButtonRef:Q,onClick:()=>le(),isLoading:C,disabled:!K||C||!c||(m.credits??0)<v*q,buttonClassName:"rounded-full",children:e.jsx("span",{children:"Find Companies"})})]});return h?Ee:e.jsx(At,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(Tt,{}),e.jsxs($t,{children:[e.jsx(Dt,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#F8FAFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Instrument Serif', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#64748B",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Pt,{videoId:"n_AYHEJSXrE"})})]}),Ee]})]})]})})};export{ir as default};
