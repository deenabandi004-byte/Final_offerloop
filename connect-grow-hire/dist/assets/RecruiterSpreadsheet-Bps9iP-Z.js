import{u as ue,r as i,j as t,J as q,aO as xe,ai as he,l as K,a1 as S,a3 as pe,I as fe,al as ge,a0 as be}from"./vendor-react-D4h_QE9m.js";import{u as we,t as f,l as je,B as b,I as ve}from"./index-Cgoag3C3.js";import{I as A}from"./input-DMu5SxYl.js";import{A as Ne,a as ye,b as ke,c as Ce,d as Ee,e as Se,f as Ae,g as Te}from"./alert-dialog-BjIrvL_-.js";import{f as R}from"./firebaseApi-BOSIckZb.js";const Y=[{value:"Not Contacted",color:"#A0A0A0",label:"Not Contacted"},{value:"Contacted",color:"#4285F4",label:"Contacted"},{value:"Followed Up",color:"#FB8C00",label:"Followed Up"},{value:"Responded",color:"#34A853",label:"Responded"},{value:"Call Scheduled",color:"#9C27B0",label:"Call Scheduled"},{value:"Rejected",color:"#EA4335",label:"Rejected"},{value:"Hired",color:"#FFD700",label:"Hired"}],_e=()=>{const X=ue(),{user:o}=we(),[m,w]=i.useState([]),[j,_]=i.useState([]),[N,J]=i.useState(""),[F,L]=i.useState(!0),[B,$]=i.useState(null),[c,M]=i.useState(null),[Z,T]=i.useState(!1),[h,z]=i.useState(null),[ee,H]=i.useState(!1),[p,O]=i.useState(new Set),[y,V]=i.useState(new Map),g=i.useRef(new Map),U=i.useRef(!1),v=i.useRef(null),[te,se]=i.useState(!1),[ae,re]=i.useState(!1),oe=e=>({id:e.id,firstName:e.firstName||e.first_name||"",lastName:e.lastName||e.last_name||"",linkedinUrl:e.linkedinUrl||e.linkedin_url||"",email:e.email||"",company:e.company||"",jobTitle:e.jobTitle||e.job_title||"",location:e.location||"",phone:e.phone||"",workEmail:e.workEmail||e.work_email||"",personalEmail:e.personalEmail||e.personal_email||"",associatedJobId:e.associatedJobId||e.associated_job_id,associatedJobTitle:e.associatedJobTitle||e.associated_job_title,associatedJobUrl:e.associatedJobUrl||e.associated_job_url,dateAdded:e.dateAdded||e.date_added||new Date().toISOString(),status:e.status||"Not Contacted",createdAt:e.createdAt||e.created_at,updatedAt:e.updatedAt||e.updated_at,gmailMessageId:e.gmailMessageId||e.gmail_message_id,gmailDraftId:e.gmailDraftId||e.gmail_draft_id,gmailDraftUrl:e.gmailDraftUrl||e.gmail_draft_url}),k=i.useCallback(async()=>{try{if(L(!0),$(null),o){console.log("[RecruiterFetch] Fetching recruiters from Firestore");const e=await R.getRecruiters(o.uid);console.log("[RecruiterFetch] Loaded recruiters from Firestore:",e.length);const s=e.map(oe);w(s),console.log("[RecruiterFetch] Normalized and set recruiters:",s.length)}else console.log("[RecruiterFetch] No user, setting empty array"),w([])}catch(e){console.error("[RecruiterFetch] Error loading recruiters:",e),$(e.message||"Failed to load recruiters"),w([])}finally{L(!1)}},[o]);i.useEffect(()=>{o?k():(w([]),_([]),L(!1))},[o]),i.useEffect(()=>{const e=()=>{!document.hidden&&o&&p.size===0&&(console.log("[RecruiterFetch] Page visible, reloading recruiters"),k())};return document.addEventListener("visibilitychange",e),()=>document.removeEventListener("visibilitychange",e)},[o,p.size]),i.useEffect(()=>{const e=s=>{if(p.size>0||y.size>0)return s.preventDefault(),s.returnValue="You have unsaved changes. Are you sure you want to leave?",s.returnValue};return window.addEventListener("beforeunload",e),()=>{window.removeEventListener("beforeunload",e),U.current=!0}},[p.size,y.size]),i.useEffect(()=>()=>{U.current=!0,g.current.forEach(e=>clearTimeout(e)),g.current.clear()},[]),i.useEffect(()=>{if(!N.trim()){_(m);return}const e=N.toLowerCase(),s=m.filter(a=>[a.firstName,a.lastName,a.email,a.company,a.jobTitle,a.location,a.associatedJobTitle].filter(Boolean).join(" ").toLowerCase().includes(e));_(s)},[N,m]),i.useEffect(()=>{const e=()=>{if(v.current){const s=v.current.scrollWidth>v.current.clientWidth;se(s)}};return e(),window.addEventListener("resize",e),()=>window.removeEventListener("resize",e)},[j]),i.useEffect(()=>{const e=()=>{v.current&&re(v.current.scrollLeft>0)},s=v.current;if(s)return s.addEventListener("scroll",e),()=>s.removeEventListener("scroll",e)},[]);const P=(e,s)=>{M({row:e,col:s})},W=i.useCallback(async(e,s,a)=>{if(!o||!e||U.current){console.warn("[RecruiterSave] Cannot save: missing user, recruiterId, or unmounting");return}const n=`${e}_${s}`;O(l=>new Set(l).add(n));try{await R.updateRecruiter(o.uid,e,{[s]:a}),O(r=>{const x=new Set(r);return x.delete(n),x}),V(r=>{const x=new Map(r);return x.delete(n),x});const l=g.current.get(n);l&&(clearTimeout(l),g.current.delete(n)),console.log(`[RecruiterSave] ✅ Successfully saved ${s} for recruiter ${e}`)}catch(l){console.error("[RecruiterSave] Error updating recruiter:",l),O(r=>{const x=new Set(r);return x.delete(n),x}),f({title:"Failed to save changes",description:`Could not save ${s}. Your changes may be lost. Please try again.`,variant:"destructive"}),await k()}},[o,k]),C=(e,s,a)=>{if(!o){f({title:"Not signed in",description:"Please sign in to save changes.",variant:"destructive"});return}if(!e){console.error("[RecruiterSave] Cannot save: missing recruiter ID"),f({title:"Cannot save",description:"Recruiter ID is missing. Please refresh the page.",variant:"destructive"});return}const n=m.map(d=>d.id===e?{...d,[s]:a}:d);w(n);const l=`${e}_${s}`;V(d=>new Map(d).set(l,{recruiterId:e,field:s,value:a}));const r=g.current.get(l);r&&clearTimeout(r);const x=setTimeout(()=>{W(e,s,a)},500);g.current.set(l,x)},D=async()=>{if(M(null),y.size>0&&o&&!U.current){const e=Array.from(y.entries());e.forEach(([a])=>{const n=g.current.get(a);n&&(clearTimeout(n),g.current.delete(a))});const s=e.map(([,a])=>W(a.recruiterId,a.field,a.value));await Promise.allSettled(s)}},ne=async(e,s)=>{if(window.confirm(`Are you sure you want to delete ${s}? This action cannot be undone.`))try{o&&e&&await R.deleteRecruiter(o.uid,e),w(a=>a.filter(n=>n.id!==e)),f({title:"Recruiter Deleted",description:`${s} has been removed from your recruiters.`})}catch(a){console.error("Error deleting recruiter:",a),f({title:"Error",description:"Failed to delete recruiter. Please try again.",variant:"destructive"})}},ie=e=>{const s=e.email||e.workEmail;if(!s)return"#";const a=encodeURIComponent(`Inquiry about ${e.associatedJobTitle||"position"}`),n=encodeURIComponent(`Hi ${e.firstName||""},

I hope this email finds you well...`);return`https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(s)}&su=${a}&body=${n}`},le=e=>{const s=e.email||e.workEmail;if(!s)return"#";const a=encodeURIComponent(`Inquiry about ${e.associatedJobTitle||"position"}`),n=encodeURIComponent(`Hi ${e.firstName||""},

I hope this email finds you well...`);return`mailto:${s}?subject=${a}&body=${n}`},de=e=>{z(e),T(!0)},G=e=>{if(!h)return;if(!(h.email||h.workEmail)){f({title:"No email address",description:"No email address available for this recruiter.",variant:"destructive"}),T(!1),z(null);return}if(e==="apple")window.open(le(h),"_blank"),f({title:"Reminder",description:"Please attach your resume before sending."});else{const a=h.gmailMessageId,n=h.gmailDraftId;let l=h.gmailDraftUrl;a||n||l?(a?(l=`https://mail.google.com/mail/u/0/#drafts?compose=${a}`,window.open(l,"_blank")):l?window.open(l,"_blank"):n&&(l=`https://mail.google.com/mail/u/0/#draft/${n}`,window.open(l,"_blank")),f({title:"Opening Draft",description:"Opening your saved draft with resume attached."})):(window.open(ie(h),"_blank"),f({title:"Reminder",description:"Please attach your resume before sending."}))}T(!1),z(null)},I=e=>{if(e.firstName&&e.lastName)return`${e.firstName} ${e.lastName}`;if(e.firstName)return e.firstName;if(e.lastName)return e.lastName;if(e.email)return e.email.split("@")[0];if(e.linkedinUrl){const s=e.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);return s?s[1]:"Unknown Recruiter"}return"Unknown Recruiter"},ce=()=>{if(!m||m.length===0)return;if((o==null?void 0:o.tier)==="free"){H(!0);return}const s=["First Name","Last Name","Email","LinkedIn","Title","Company","Location","Phone","Work Email","Personal Email","Associated Job Title","Associated Job URL","Status","Date Added"].join(","),a=m.map(d=>{const u=Q=>{if(!Q)return"";const E=String(Q);return E.includes(",")||E.includes('"')||E.includes(`
`)?`"${E.replace(/"/g,'""')}"`:E};return[u(d.firstName),u(d.lastName),u(d.email),u(d.linkedinUrl),u(d.jobTitle),u(d.company),u(d.location),u(d.phone),u(d.workEmail),u(d.personalEmail),u(d.associatedJobTitle),u(d.associatedJobUrl),u(d.status),u(d.dateAdded)].join(",")}),n=[s,...a].join(`
`),l=new Blob([n],{type:"text/csv;charset=utf-8;"}),r=document.createElement("a"),x=URL.createObjectURL(l);r.setAttribute("href",x),r.setAttribute("download",`recruiter_spreadsheet_${new Date().toISOString().split("T")[0]}.csv`),r.style.visibility="hidden",document.body.appendChild(r),r.click(),document.body.removeChild(r)},me=async()=>{if(window.confirm("Are you sure you want to delete all recruiters? This action cannot be undone."))try{o&&(await R.clearAllRecruiters(o.uid),w([]))}catch(e){console.error("Error clearing recruiters:",e),$("Failed to clear recruiters")}};return F?t.jsx("div",{className:"space-y-4",children:t.jsx(je,{variant:"contacts",count:5})}):t.jsxs("div",{className:"space-y-4 recruiter-spreadsheet-page",children:[m.length>0&&t.jsxs("div",{className:"flex justify-between items-center bg-card rounded-lg border border-border p-4 recruiter-info-card",children:[t.jsxs("div",{children:[t.jsxs("div",{className:"flex items-center gap-2",children:[t.jsxs("p",{className:"text-sm font-medium text-foreground",children:[m.length," recruiter",m.length!==1?"s":""," saved"]}),p.size>0&&t.jsxs("div",{className:"flex items-center gap-1.5 text-xs text-blue-600",children:[t.jsx(q,{className:"h-3 w-3 animate-spin"}),t.jsxs("span",{children:["Saving ",p.size," change",p.size!==1?"s":"","..."]})]}),p.size===0&&y.size===0&&m.length>0&&t.jsxs("div",{className:"flex items-center gap-1 text-xs text-green-600",children:[t.jsx(xe,{className:"h-3 w-3"}),t.jsx("span",{children:"All changes saved"})]})]}),t.jsx("p",{className:"text-xs text-muted-foreground mt-0.5",children:"Export your recruiters to CSV for further analysis"})]}),t.jsxs("div",{className:"flex gap-2 recruiter-action-buttons",children:[t.jsxs(b,{onClick:ce,disabled:(o==null?void 0:o.tier)==="free",className:`gap-2 recruiter-export-btn ${(o==null?void 0:o.tier)==="free"?"bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-60":"bg-blue-600 hover:bg-blue-700"}`,title:(o==null?void 0:o.tier)==="free"?"Upgrade to Pro or Elite to export CSV":"Export recruiters to CSV",children:[t.jsx(he,{className:"h-4 w-4"}),"Export CSV"]}),t.jsxs(b,{variant:"outline",size:"sm",onClick:k,disabled:F,className:"relative overflow-hidden border-border text-foreground hover:bg-secondary recruiter-refresh-btn",children:[t.jsx(q,{className:"h-4 w-4"}),t.jsx(ve,{isLoading:F})]}),t.jsx(b,{variant:"outline",size:"sm",onClick:me,className:"text-destructive border-destructive hover:bg-destructive/10 recruiter-delete-btn",children:t.jsx(K,{className:"h-4 w-4"})})]})]}),B&&t.jsx("div",{className:"bg-destructive/10 border border-destructive text-destructive px-6 py-3 rounded-lg",children:B}),m.length===0?t.jsxs("div",{className:"bg-card rounded-lg border border-border p-12 text-center",children:[t.jsx(S,{className:"h-10 w-10 text-muted-foreground mx-auto mb-4"}),t.jsx("p",{className:"text-foreground mb-2",children:"No recruiters to display yet"}),t.jsx("p",{className:"text-sm text-muted-foreground",children:'Recruiters found from "Find Recruiters" will automatically appear here'})]}):t.jsxs("div",{className:"bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border overflow-hidden recruiter-table-wrapper",children:[t.jsx("div",{className:"px-6 py-4 border-b border-border bg-muted recruiter-section-header",children:t.jsxs("div",{className:"flex items-center justify-between",children:[t.jsxs("div",{className:"flex items-center space-x-2 recruiter-section-header-content",children:[t.jsx(S,{className:"h-5 w-5 text-blue-400"}),t.jsxs("span",{className:"font-medium text-foreground recruiter-section-header-text",children:[j.length," ",j.length===1?"recruiter":"recruiters",N&&` (filtered from ${m.length})`]})]}),t.jsx("div",{className:"flex items-center gap-3 recruiter-scroll-hint",children:te&&!ae&&t.jsxs("div",{className:"swipe-hint flex items-center gap-1.5 text-sm font-bold text-black",children:[t.jsx("span",{children:"Scroll"}),t.jsx(pe,{className:"h-4 w-4 swipe-hint-arrow"})]})})]})}),t.jsx("div",{className:"px-6 py-4 border-b border-border bg-background recruiter-search-section",children:t.jsxs("div",{className:"relative w-80 recruiter-search-wrapper",children:[t.jsx(fe,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"}),t.jsx(A,{type:"text",placeholder:"Search recruiters...",value:N,onChange:e=>J(e.target.value),className:"pl-10 bg-muted border-border text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary recruiter-search-input"})]})}),j.length===0&&m.length>0&&N&&t.jsxs("div",{className:"px-6 py-12 text-center",children:[t.jsx("p",{className:"text-muted-foreground mb-2",children:"No recruiters match your search."}),t.jsx("button",{onClick:()=>J(""),className:"text-sm text-blue-600 hover:text-blue-700 underline",children:"Clear search"})]}),j.length>0&&t.jsx("div",{ref:v,className:"overflow-x-auto recruiter-table-container",children:t.jsxs("table",{className:"min-w-full divide-y divide-border recruiter-table",children:[t.jsx("thead",{className:"bg-muted",children:t.jsxs("tr",{children:[t.jsx("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Recruiter"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"LinkedIn"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Email"}),t.jsx("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Company"}),t.jsx("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Title"}),t.jsx("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Associated Job"}),t.jsx("th",{scope:"col",className:"px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Status"}),t.jsx("th",{scope:"col",className:"px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider",children:"Actions"})]})}),t.jsx("tbody",{className:"bg-background divide-y divide-border",children:j.map((e,s)=>{const a=Y.find(r=>r.value===e.status),n=e.id||"",l=n&&Array.from(p).some(r=>r.startsWith(n+"_"));return t.jsxs("tr",{className:`hover:bg-secondary transition-colors ${l?"bg-blue-50/50 dark:bg-blue-950/20":""}`,children:[t.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:t.jsxs("div",{className:"flex items-center",children:[t.jsx("div",{className:"flex-shrink-0 h-10 w-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30",children:t.jsx(ge,{className:"h-5 w-5 text-blue-400"})}),t.jsx("div",{className:"ml-4 flex-1",children:(c==null?void 0:c.row)===s&&(c==null?void 0:c.col)==="name"?t.jsxs("div",{className:"space-y-1",children:[t.jsx(A,{value:e.firstName,onChange:r=>C(e.id,"firstName",r.target.value),onBlur:D,placeholder:"First name",className:"text-sm h-8 bg-background border-input text-foreground",autoFocus:!0}),t.jsx(A,{value:e.lastName,onChange:r=>C(e.id,"lastName",r.target.value),onBlur:D,placeholder:"Last name",className:"text-sm h-8 bg-background border-input text-foreground"})]}):t.jsx("div",{onClick:()=>P(s,"name"),className:"cursor-text",children:t.jsx("div",{className:"text-sm font-medium text-foreground",children:I(e)})})})]})}),t.jsx("td",{className:"px-4 py-4 whitespace-nowrap",children:e.linkedinUrl?t.jsxs("a",{href:e.linkedinUrl.startsWith("http")?e.linkedinUrl:`https://${e.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline text-sm",children:[t.jsx(be,{className:"h-4 w-4"}),t.jsx("span",{className:"truncate max-w-[200px]",children:e.linkedinUrl.replace(/^https?:\/\//g,"")})]}):t.jsx("span",{className:"text-muted-foreground",children:"—"})}),t.jsx("td",{className:"px-4 py-4 whitespace-nowrap",children:e.email?t.jsx("span",{className:"text-sm text-foreground",children:e.email}):t.jsx("span",{className:"text-muted-foreground",children:"—"})}),t.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:(c==null?void 0:c.row)===s&&(c==null?void 0:c.col)==="company"?t.jsx(A,{value:e.company,onChange:r=>C(e.id,"company",r.target.value),onBlur:D,className:"text-sm h-8 bg-background border-input text-foreground",autoFocus:!0}):t.jsx("div",{onClick:()=>P(s,"company"),className:"cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground",children:e.company||t.jsx("span",{className:"text-muted-foreground",children:"—"})})}),t.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:(c==null?void 0:c.row)===s&&(c==null?void 0:c.col)==="jobTitle"?t.jsx(A,{value:e.jobTitle,onChange:r=>C(e.id,"jobTitle",r.target.value),onBlur:D,className:"text-sm h-8 bg-background border-input text-foreground",autoFocus:!0}):t.jsx("div",{onClick:()=>P(s,"jobTitle"),className:"cursor-text hover:bg-muted rounded px-2 py-1 text-sm text-foreground",children:e.jobTitle||t.jsx("span",{className:"text-muted-foreground",children:"—"})})}),t.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:e.associatedJobTitle?t.jsxs("div",{className:"text-sm text-foreground",children:[t.jsx("div",{className:"font-medium",children:e.associatedJobTitle}),e.associatedJobUrl&&t.jsx("a",{href:e.associatedJobUrl,target:"_blank",rel:"noopener noreferrer",className:"text-xs text-blue-600 hover:underline",children:"View Job"})]}):t.jsx("span",{className:"text-muted-foreground",children:"—"})}),t.jsx("td",{className:"px-6 py-4 whitespace-nowrap",children:t.jsx("select",{value:e.status,onChange:r=>C(e.id,"status",r.target.value),className:"flex-1 text-xs bg-background border-input text-foreground focus:ring-1 focus:ring-blue-500 cursor-pointer rounded px-2 py-1",style:{color:a==null?void 0:a.color},children:Y.map(r=>t.jsx("option",{value:r.value,style:{color:r.color,backgroundColor:"#ffffff"},children:r.label},r.value))})}),t.jsx("td",{className:"px-6 py-4 whitespace-nowrap text-right",children:t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[e.email||e.workEmail?t.jsx(b,{size:"sm",variant:"ghost",onClick:()=>de(e),className:"hover:bg-muted text-muted-foreground hover:text-foreground",title:`Email ${I(e)}`,children:t.jsx(S,{className:"h-4 w-4 text-blue-600"})}):t.jsx("span",{className:"text-muted-foreground",children:"—"}),t.jsx(b,{variant:"ghost",size:"sm",onClick:r=>{r.stopPropagation(),ne(e.id,I(e))},className:"h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50",title:"Delete recruiter",children:t.jsx(K,{className:"h-4 w-4"})})]})})]},e.id)})})]})}),j.length>0&&t.jsx("div",{className:"px-6 py-4 border-t border-border bg-muted recruiter-helper-text",children:t.jsx("div",{className:"flex justify-between items-center text-sm text-muted-foreground",children:t.jsx("p",{className:"text-center flex-1 recruiter-helper-text-content",children:"Click on cells to edit recruiter information"})})})]}),Z&&h&&t.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50",children:t.jsxs("div",{className:"bg-card rounded-lg p-6 max-w-md w-full mx-4 border border-border shadow-lg",children:[t.jsx("h3",{className:"text-xl font-semibold text-foreground mb-4",children:"Choose Email App"}),t.jsxs("p",{className:"text-muted-foreground mb-6",children:["Send email to ",I(h)]}),t.jsxs("div",{className:"flex gap-3",children:[t.jsx(b,{onClick:()=>G("apple"),className:"flex-1 bg-muted hover:bg-muted/80 text-foreground py-6",children:t.jsxs("div",{className:"flex flex-col items-center gap-2",children:[t.jsx(S,{className:"h-6 w-6"}),t.jsx("span",{children:"Apple Mail"})]})}),t.jsx(b,{onClick:()=>G("gmail"),className:"flex-1 bg-blue-600 hover:bg-blue-700 text-white py-6",children:t.jsxs("div",{className:"flex flex-col items-center gap-2",children:[t.jsx(S,{className:"h-6 w-6"}),t.jsx("span",{children:"Gmail"})]})})]}),t.jsx(b,{onClick:()=>{T(!1),z(null)},variant:"ghost",className:"w-full mt-4 text-muted-foreground hover:text-foreground",children:"Cancel"})]})}),t.jsx(Ne,{open:ee,onOpenChange:H,children:t.jsxs(ye,{children:[t.jsxs(ke,{children:[t.jsx(Ce,{children:"Upgrade to Export CSV"}),t.jsx(Ee,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your recruiters to CSV for further analysis."})]}),t.jsxs(Se,{children:[t.jsx(Ae,{children:"Cancel"}),t.jsx(Te,{onClick:()=>X("/pricing"),className:"bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",children:"Upgrade to Pro/Elite"})]})]})}),t.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. MAIN PAGE CONTAINER */
          .recruiter-spreadsheet-page {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            box-sizing: border-box;
          }

          /* 5. INFO CARD */
          .recruiter-info-card {
            width: 100%;
            max-width: calc(100% - 32px);
            margin: 0 16px;
            box-sizing: border-box;
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 16px !important;
          }

          .recruiter-info-card > div:first-child {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-info-card p,
          .recruiter-info-card span {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
          }

          .recruiter-info-card > div:first-child > div {
            flex-wrap: wrap;
            gap: 8px;
          }

          .recruiter-action-buttons {
            width: 100%;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .recruiter-export-btn {
            flex: 1 1 auto;
            min-width: fit-content;
            padding: 8px 12px !important;
            font-size: 0.75rem;
            box-sizing: border-box;
          }

          .recruiter-refresh-btn,
          .recruiter-delete-btn {
            min-width: 44px;
            min-height: 44px;
            padding: 8px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADER */
          .recruiter-section-header {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-section-header-content {
            flex: 1;
            min-width: 0;
          }

          .recruiter-section-header-text {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          .recruiter-scroll-hint {
            flex-shrink: 0;
          }

          /* 7. SEARCH INPUT */
          .recruiter-search-section {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-search-wrapper {
            width: 100%;
            max-width: calc(100% - 32px);
            margin: 0 auto;
            box-sizing: border-box;
          }

          .recruiter-search-input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          /* 8. ACTION BUTTONS ROW - Already handled in info card above */

          /* 9. SCROLL INDICATOR - Keep within viewport */
          .swipe-hint {
            font-size: 0.75rem !important;
            white-space: nowrap;
          }

          /* 10. TABLE CONTAINER */
          .recruiter-table-wrapper {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            margin: 0;
            overflow: visible;
          }

          .recruiter-table-container {
            width: 100%;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }

          .recruiter-table {
            min-width: 800px;
            width: 100%;
            box-sizing: border-box;
          }

          /* 11. HELPER TEXT */
          .recruiter-helper-text {
            width: 100%;
            max-width: 100%;
            padding: 12px 16px !important;
            box-sizing: border-box;
          }

          .recruiter-helper-text-content {
            width: 100%;
            text-align: left;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.75rem !important;
          }

          /* GENERAL - Ensure all elements use box-sizing */
          .recruiter-spreadsheet-page * {
            box-sizing: border-box;
          }

          /* Prevent page-level horizontal scroll */
          .recruiter-spreadsheet-page {
            overflow-x: hidden;
          }
        }
      `})]})};export{_e as R};
