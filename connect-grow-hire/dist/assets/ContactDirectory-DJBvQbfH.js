const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-DsmIO8lc.js","assets/vendor-react-BrZ-WZRu.js","assets/vendor-dates-E7FZUXjG.js","assets/vendor-utils-B2rm_Apj.js","assets/vendor-firebase-D7hJdl6b.js","assets/index-ChUYIPb6.css"])))=>i.map(i=>d[i]);
import{u as ie,a as le,b as q,l as ve,B as j,I as ke,_ as W}from"./index-DsmIO8lc.js";import{r as c,j as t,u as Se,I as Ce,ai as De,J as Ee,l as re,a1 as P,al as _e,a0 as se,L as Ie,Z as Te}from"./vendor-react-BrZ-WZRu.js";import{I as U}from"./input-PpZQ76Ie.js";import{A as Ae,a as Ue,b as Re,c as ze,d as Be,e as Fe,f as Le,g as $e}from"./alert-dialog-B9jyPOfT.js";import{f as E}from"./firebaseApi-cBsyo_rV.js";const Oe=()=>{const{user:x}=ie(),[n,k]=c.useState(!1),[p,l]=c.useState(!1);c.useEffect(()=>{x&&!n&&!p&&u()},[x,n,p]);const u=async()=>{if(x){l(!0);try{const f=`firebase_migration_${x.uid}`;if(localStorage.getItem(f)){k(!0),l(!1);return}console.log("Starting Firebase migration for user:",x.uid);const _=localStorage.getItem("professionalInfo");if(_)try{const g=JSON.parse(_);await E.saveProfessionalInfo(x.uid,g),console.log("Migrated professional info to Firestore")}catch(g){console.error("Failed to migrate professional info:",g)}const v=Object.keys(localStorage).filter(g=>g.startsWith("contacts_"));for(const g of v)try{const y=localStorage.getItem(g);if(y){const w=JSON.parse(y);Array.isArray(w)&&w.length>0&&(await E.bulkCreateContacts(x.uid,w),console.log(`Migrated ${w.length} contacts from ${g}`))}}catch(y){console.error(`Failed to migrate contacts from ${g}:`,y)}localStorage.setItem(f,"true"),k(!0),console.log("Firebase migration completed successfully")}catch(f){console.error("Firebase migration failed:",f)}finally{l(!1)}}};return{migrationComplete:n,migrationInProgress:p,isLoading:p,migrateLocalStorageData:u}},Pe=({contactId:x,contactEmail:n,gmailThreadId:k,hasUnreadReply:p=!1,notificationsMuted:l=!1,onStateChange:u})=>{const{toast:f}=le(),[_,v]=c.useState(!1),g=async o=>{if(o.stopPropagation(),!k){f({title:"No Gmail Thread",description:"No email has been sent to this contact yet.",variant:"destructive"});return}v(!0);try{if(p){const b=await q.generateReplyDraft(x);if("error"in b)throw new Error(b.error);window.open(b.gmailUrl,"_blank"),f({title:"Reply Draft Created",description:"Opening Gmail with your draft reply..."}),u==null||u()}else window.open(`https://mail.google.com/mail/u/0/#inbox/${k}`,"_blank")}catch(b){f({title:"Error",description:b instanceof Error?b.message:"Failed to open Gmail thread",variant:"destructive"})}finally{v(!1)}},y=async o=>{o.stopPropagation();try{const b=await q.muteContactNotifications(x,!l);if("error"in b)throw new Error(b.error);f({title:l?"Notifications Enabled":"Notifications Muted",description:l?`You'll receive notifications for ${n}`:`Notifications muted for ${n}`}),u==null||u()}catch{f({title:"Error",description:"Failed to toggle notifications",variant:"destructive"})}},w=()=>l?"Notifications muted":p?"Reply received — open thread":"View sent thread",L=()=>l?"/bell_mute.jpg":p?"/bell_notification.jpg":"/bell.jpg",C=()=>{const o="h-5 w-5 cursor-pointer transition-all duration-200 object-contain";return l?`${o} opacity-60 hover:opacity-80`:p?`${o} animate-pulse`:`${o} hover:opacity-80`};return t.jsxs("div",{className:"relative group",children:[t.jsx("div",{className:"relative flex items-center justify-center",onClick:l?y:g,onContextMenu:o=>{o.preventDefault(),y(o)},children:t.jsx("img",{src:L(),alt:w(),className:C(),title:w(),style:p?{filter:"drop-shadow(0 0 4px rgba(34, 212, 197, 0.6))"}:void 0})}),t.jsxs("span",{className:"absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg",children:[w(),t.jsxs("span",{className:"block text-[10px] text-gray-400 mt-0.5",children:["Right-click to ",l?"unmute":"mute"]})]})]})},oe=[{value:"Not Contacted",color:"#6B7280",label:"Not Contacted"},{value:"Contacted",color:"#3B82F6",label:"Contacted"},{value:"Followed Up",color:"#F59E0B",label:"Followed Up"},{value:"Responded",color:"#10B981",label:"Responded"},{value:"Call Scheduled",color:"#8B5CF6",label:"Call Scheduled"},{value:"Rejected",color:"#EF4444",label:"Rejected"},{value:"Hired",color:"#F59E0B",label:"Hired"}],qe=()=>{const x=Se(),{user:n}=ie(),{isLoading:k}=Oe(),{toast:p}=le(),[l,u]=c.useState([]),[f,_]=c.useState([]),[v,g]=c.useState(""),[y,w]=c.useState(!0),[L,C]=c.useState(null),[o,b]=c.useState(null),[ne,M]=c.useState(!1),[S,G]=c.useState(null),[ce,K]=c.useState(!1),[de,me]=c.useState({}),[Me,Q]=c.useState(!1),[Y,Z]=c.useState(new Set),ue=c.useRef(null),J=c.useRef(!1),X=c.useRef(0),$=()=>n?`contacts_${n.uid}`:"contacts_anonymous",pe=e=>{const r=(...h)=>{for(const N of h){const d=e[N];if(d!=null&&d!=="")return String(d).trim()}};console.log("[DEBUG] Raw server contact:",JSON.stringify(e,null,2));const s=r("emailSubject","email_subject"),a=r("emailBody","email_body","emailContent","email_content");return console.log("[DEBUG] Normalized emailSubject:",s),console.log("[DEBUG] Normalized emailBody:",a?`${a.substring(0,100)}...`:"MISSING"),{id:e.id,firstName:e.firstName||e.first_name||"",lastName:e.lastName||e.last_name||"",linkedinUrl:e.linkedinUrl||e.linkedin_url||"",email:e.email||"",company:e.company||"",jobTitle:e.jobTitle||e.job_title||"",college:e.college||"",location:e.location||"",firstContactDate:e.firstContactDate||e.first_contact_date||"",status:e.status||"Not Contacted",lastContactDate:e.lastContactDate||e.last_contact_date||"",emailSubject:s,emailBody:a,gmailDraftId:e.gmailDraftId||e.gmail_draft_id||"",gmailDraftUrl:e.gmailDraftUrl||e.gmail_draft_url||"",createdAt:e.createdAt||e.created_at,updatedAt:e.updatedAt||e.updated_at,gmailThreadId:e.gmailThreadId||e.gmail_thread_id,gmailMessageId:e.gmailMessageId||e.gmail_message_id,hasUnreadReply:e.hasUnreadReply||e.has_unread_reply||!1,notificationsMuted:e.notificationsMuted||e.notifications_muted||!1,draftCreatedAt:e.draftCreatedAt,lastChecked:e.lastChecked,mutedAt:e.mutedAt}},R=async()=>{try{if(w(!0),C(null),n){const r=(await E.getContacts(n.uid)).map(pe);u(r)}else{const e=localStorage.getItem($());if(e)try{const r=JSON.parse(e);u(Array.isArray(r)?r:[])}catch(r){console.error("Error parsing stored contacts:",r),u([])}else u([])}}catch(e){console.error("Error loading contacts:",e),C("Failed to load contacts"),u([])}finally{w(!1)}},he=async e=>{try{n||localStorage.setItem($(),JSON.stringify(e))}catch(r){console.error("Error saving contacts:",r)}},ge=e=>Object.fromEntries(Object.entries(e).filter(([,r])=>r!==void 0)),ee=async e=>{try{const r=new Date().toLocaleDateString("en-US"),s=e.map(a=>ge({firstName:a.FirstName??a.firstName??"",lastName:a.LastName??a.lastName??"",linkedinUrl:a.LinkedIn??a.linkedinUrl??"",email:a.Email??a.email??"",company:a.Company??a.company??"",jobTitle:a.Title??a.jobTitle??"",college:a.College??a.college??"",location:`${a.City??""}${a.City&&a.State?", ":""}${a.State??""}`.trim()||a.location||"",firstContactDate:r,status:"Not Contacted",lastContactDate:r,emailSubject:a.email_subject??a.emailSubject??void 0,emailBody:a.email_body??a.emailBody??void 0,gmailThreadId:a.gmailThreadId??a.gmail_thread_id??void 0,gmailMessageId:a.gmailMessageId??a.gmail_message_id??void 0,hasUnreadReply:!1,notificationsMuted:!1}));if(n)await E.bulkCreateContacts(n.uid,s),await R();else{const a=[...l];s.forEach(i=>{a.some(N=>N.email&&i.email&&N.email.toLowerCase()===i.email.toLowerCase())||a.push({...i,id:`local_${Date.now()}_${Math.random()}`,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}),u(a),await he(a)}}catch(r){console.error("Error adding contacts:",r),C("Failed to add contacts")}},V=c.useCallback(async()=>{const e=Date.now();if(!(e-X.current<3e4)&&!(J.current||!n)){J.current=!0,Q(!0),X.current=e;try{const r=l.filter(a=>a.gmailThreadId&&!a.notificationsMuted&&a.id).map(a=>a.id).filter(Boolean);if(r.length===0)return;const s=await q.batchCheckReplies(r);"results"in s&&me(s.results)}catch(r){console.error("Error checking replies:",r)}finally{J.current=!1,Q(!1)}}},[n,l]);c.useEffect(()=>{if(!n||l.length===0)return;const e=setTimeout(()=>{V()},2e3),r=setInterval(()=>{V()},12e4);return()=>{clearTimeout(e),clearInterval(r)}},[n,l.length]),c.useEffect(()=>(window.addContactsToDirectory=ee,()=>{delete window.addContactsToDirectory}),[ee]),c.useEffect(()=>{if(!v.trim()){_(l);return}const e=l.filter(r=>Object.values(r).some(s=>s==null?void 0:s.toString().toLowerCase().includes(v.toLowerCase())));_(e)},[v,l]);const I=async(e,r,s)=>{try{if(u(a=>a.map(i=>{if(i.id===e){const h={...i,[r]:s};return r==="status"&&s!==i.status&&(h.lastContactDate=new Date().toLocaleDateString("en-US")),h}return i})),n&&e&&!e.startsWith("local_")){const a={[r]:s};r==="status"&&(a.lastContactDate=new Date().toLocaleDateString("en-US")),await E.updateContact(n.uid,e,a)}}catch(a){console.error("Error updating contact:",a),C("Failed to update contact")}},O=(e,r)=>{r==="status"||r==="actions"||b({row:e,col:r})},z=()=>{b(null)},xe=async(e,r)=>{if(window.confirm(`Are you sure you want to delete ${r}? This action cannot be undone.`))try{if(n&&e&&!e.startsWith("local_")&&await E.deleteContact(n.uid,e),u(s=>s.filter(a=>a.id!==e)),!n){const s=l.filter(a=>a.id!==e);localStorage.setItem($(),JSON.stringify(s))}p({title:"Contact Deleted",description:`${r} has been removed from your contacts.`})}catch(s){console.error("Error deleting contact:",s),p({title:"Error",description:"Failed to delete contact. Please try again.",variant:"destructive"})}},fe=async e=>{var r;if(!(!e.id||!e.email)){Z(s=>new Set(s).add(e.id));try{const{auth:s}=await W(async()=>{const{auth:m}=await import("./index-DsmIO8lc.js").then(function(T){return T.q});return{auth:m}},__vite__mapDeps([0,1,2,3,4,5])),a=await((r=s.currentUser)==null?void 0:r.getIdToken(!0));if(!a)throw new Error("Not authenticated");const h={contacts:[{FirstName:e.firstName||"",LastName:e.lastName||"",Email:e.email,Company:e.company||"",Title:e.jobTitle||""}],resumeText:"",userProfile:{},careerInterests:[]};try{const{doc:m,getDoc:T}=await W(async()=>{const{doc:B,getDoc:A}=await import("./vendor-firebase-D7hJdl6b.js").then(function(F){return F.D});return{doc:B,getDoc:A}},__vite__mapDeps([4,1,2])),{db:D}=await W(async()=>{const{db:B}=await import("./index-DsmIO8lc.js").then(function(A){return A.q});return{db:B}},__vite__mapDeps([0,1,2,3,4,5]));if(s.currentUser){const B=m(D,"users",s.currentUser.uid),A=await T(B);if(A.exists()){const F=A.data();h.resumeText=F.resumeText||(F.resumeParsed?JSON.stringify(F.resumeParsed):"")}}}catch{}const N=window.location.hostname==="localhost"?"http://localhost:5001":"https://www.offerloop.ai",d=await fetch(`${N}/api/emails/generate-and-draft`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a}`},body:JSON.stringify(h)});if(!d.ok){const m=await d.json().catch(()=>({}));throw new Error((m==null?void 0:m.error)||`HTTP ${d.status}`)}p({title:"Gmail draft created!",description:`Draft created for ${e.firstName||e.email}. Check your Gmail Drafts.`}),await R()}catch(s){p({title:"Draft creation failed",description:(s==null?void 0:s.message)||"Something went wrong",variant:"destructive"})}finally{Z(s=>{const a=new Set(s);return a.delete(e.id),a})}}},te=e=>{var h,N;const r=(h=e.emailSubject)==null?void 0:h.trim(),s=(N=e.emailBody)==null?void 0:N.trim(),a=r&&r.length>0?r:`Question about your work at ${e.company||"your company"}`,i=s&&s.length>0?s:`Hi ${e.firstName||"there"},

I'd love to connect and learn more about your work.

Best regards`;return{subject:a,body:i}},be=e=>{const r=e.email;if(!r)return"#";const{subject:s,body:a}=te(e);return`mailto:${encodeURIComponent(r)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(a.replace(/\n/g,`\r
`))}`},ye=e=>{const r=e.email;if(!r)return"#";const{subject:s,body:a}=te(e);return`https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=1&to=${encodeURIComponent(r)}&su=${encodeURIComponent(s)}&body=${encodeURIComponent(a)}`},we=e=>{G(e),M(!0)},ae=e=>{if(S){if(e==="apple")window.open(be(S),"_blank"),p({title:"Reminder",description:"Please attach your resume before sending."});else{const r=S.gmailMessageId,s=S.gmailDraftId;let a=S.gmailDraftUrl;r||s||a?(r?(a=`https://mail.google.com/mail/u/0/#drafts?compose=${r}`,window.open(a,"_blank")):a?window.open(a,"_blank"):s&&(a=`https://mail.google.com/mail/u/0/#draft/${s}`,window.open(a,"_blank")),p({title:"Opening Draft",description:"Opening your saved draft with resume attached."})):(window.open(ye(S),"_blank"),p({title:"Reminder",description:"Please attach your resume before sending."}))}M(!1),G(null)}},H=e=>{if(e.firstName&&e.lastName)return`${e.firstName} ${e.lastName}`;if(e.firstName)return e.firstName;if(e.lastName)return e.lastName;if(e.email)return e.email.split("@")[0];if(e.linkedinUrl){const r=e.linkedinUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);return r?r[1]:"Unknown Contact"}return"Unknown Contact"},Ne=()=>{if(!l||l.length===0)return;if((n==null?void 0:n.tier)==="free"){K(!0);return}const r=["First Name","Last Name","Email","LinkedIn","Job Title","Company","Location","College","Status","First Contact Date","Last Contact Date","Email Subject","Email Body","Gmail Draft URL"].join(","),s=l.map(d=>{const m=T=>{if(!T)return"";const D=String(T);return D.includes(",")||D.includes('"')||D.includes(`
`)?`"${D.replace(/"/g,'""')}"`:D};return[m(d.firstName),m(d.lastName),m(d.email),m(d.linkedinUrl),m(d.jobTitle),m(d.company),m(d.location),m(d.college),m(d.status),m(d.firstContactDate),m(d.lastContactDate),m(d.emailSubject),m(d.emailBody),m(d.gmailDraftUrl)].join(",")}),a=[r,...s].join(`
`),i=new Blob([a],{type:"text/csv;charset=utf-8;"}),h=document.createElement("a"),N=URL.createObjectURL(i);h.setAttribute("href",N),h.setAttribute("download",`contact_library_${new Date().toISOString().split("T")[0]}.csv`),h.style.visibility="hidden",document.body.appendChild(h),h.click(),document.body.removeChild(h)},je=async()=>{if(window.confirm("Are you sure you want to delete all contacts? This action cannot be undone."))try{n?(await E.clearAllContacts(n.uid),u([])):(localStorage.removeItem($()),u([]))}catch(e){console.error("Error clearing contacts:",e),C("Failed to clear contacts")}};return c.useEffect(()=>{k||R()},[n,k]),k||y?t.jsx("div",{className:"space-y-4",children:t.jsx(ve,{variant:"contacts",count:5})}):t.jsxs("div",{className:"space-y-6 contact-directory-page",children:[t.jsxs("div",{className:"flex items-center justify-between gap-4 contact-directory-controls-row",children:[t.jsxs("div",{className:"relative flex-1 max-w-sm contact-directory-search",children:[t.jsx(Ce,{className:"absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4"}),t.jsx(U,{type:"text",placeholder:"Search contacts...",value:v,onChange:e=>g(e.target.value),className:"pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-blue-500 hover:border-gray-400 transition-colors"})]}),t.jsxs("div",{className:"flex items-center gap-3 contact-directory-actions",children:[t.jsxs("span",{className:"text-sm text-gray-500 contact-directory-count",children:[l.length," contact",l.length!==1?"s":""]}),t.jsxs(j,{variant:"outline",size:"sm",onClick:Ne,disabled:l.length===0,className:"gap-2 border-gray-300 hover:border-gray-400 contact-directory-export-btn",children:[t.jsx(De,{className:"h-4 w-4"}),"Export CSV"]}),t.jsxs(j,{variant:"outline",size:"sm",onClick:R,disabled:y,className:"relative overflow-hidden border-gray-300 hover:border-gray-400 contact-directory-refresh-btn",children:[t.jsx(Ee,{className:"h-4 w-4"}),t.jsx(ke,{isLoading:y})]}),t.jsx(j,{variant:"outline",size:"sm",onClick:je,disabled:l.length===0,className:"text-red-600 border-gray-300 hover:border-red-300 hover:bg-red-50 contact-directory-delete-btn",children:t.jsx(re,{className:"h-4 w-4"})})]})]}),L&&t.jsx("div",{className:"bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm",children:L}),l.length===0?t.jsxs("div",{className:"border border-gray-200 rounded-lg p-12 text-center bg-white",children:[t.jsx("div",{className:"w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:t.jsx(P,{className:"h-6 w-6 text-gray-400"})}),t.jsx("p",{className:"text-gray-900 font-medium mb-2",children:"No contacts saved yet"}),t.jsx("p",{className:"text-sm text-gray-500 mb-6",children:"Use the Find People search to discover and save contacts"}),t.jsx(j,{onClick:()=>x("/contact-search"),className:"bg-blue-600 hover:bg-blue-700 text-white",children:"Find People"})]}):t.jsxs("div",{className:"border border-gray-200 rounded-lg bg-white overflow-hidden contact-directory-table-wrapper",children:[t.jsx("div",{ref:ue,className:"overflow-x-auto overflow-y-visible contact-directory-table-container",style:{maxWidth:"100%",WebkitOverflowScrolling:"touch"},children:t.jsxs("table",{className:"min-w-[1400px] w-full contact-directory-table",children:[t.jsx("thead",{children:t.jsxs("tr",{className:"border-b border-gray-200",children:[t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide contact-directory-name-header",children:"Contact"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide",children:"LinkedIn"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap",children:"Email"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide",children:"Company"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide",children:"Role"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide",children:"Location"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[180px]",children:"Status"}),t.jsx("th",{scope:"col",className:"px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide",children:"Actions"})]})}),t.jsx("tbody",{className:"bg-white",children:f.map((e,r)=>{var a;const s=oe.find(i=>i.value===e.status);return t.jsxs("tr",{className:"border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors",children:[t.jsx("td",{className:"px-4 py-3 whitespace-nowrap contact-directory-name-cell",children:t.jsxs("div",{className:"flex items-center gap-3",children:[t.jsx("div",{className:"w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0",children:t.jsx(_e,{className:"h-4 w-4 text-blue-500"})}),(o==null?void 0:o.row)===r&&(o==null?void 0:o.col)==="name"?t.jsxs("div",{className:"space-y-1",children:[t.jsx(U,{value:e.firstName,onChange:i=>I(e.id,"firstName",i.target.value),onBlur:z,placeholder:"First name",className:"text-sm h-7 border-gray-300",autoFocus:!0}),t.jsx(U,{value:e.lastName,onChange:i=>I(e.id,"lastName",i.target.value),onBlur:z,placeholder:"Last name",className:"text-sm h-7 border-gray-300"})]}):t.jsx("div",{onClick:()=>O(r,"name"),className:"cursor-pointer",children:t.jsx("span",{className:"text-sm font-medium text-gray-900",children:H(e)})})]})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap",children:e.linkedinUrl?t.jsxs("a",{href:e.linkedinUrl.startsWith("http")?e.linkedinUrl:`https://${e.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",className:"inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm",children:[t.jsx(se,{className:"h-3 w-3"}),"View"]}):t.jsx("span",{className:"text-gray-300",children:"—"})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap",children:e.email?t.jsx("span",{className:"text-sm text-gray-700",children:e.email}):t.jsx("span",{className:"text-gray-300",children:"—"})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap",children:(o==null?void 0:o.row)===r&&(o==null?void 0:o.col)==="company"?t.jsx(U,{value:e.company,onChange:i=>I(e.id,"company",i.target.value),onBlur:z,className:"text-sm h-7 border-gray-300",autoFocus:!0}):t.jsx("div",{onClick:()=>O(r,"company"),className:"cursor-pointer text-sm text-gray-700",children:e.company||t.jsx("span",{className:"text-gray-300",children:"—"})})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap",children:(o==null?void 0:o.row)===r&&(o==null?void 0:o.col)==="jobTitle"?t.jsx(U,{value:e.jobTitle,onChange:i=>I(e.id,"jobTitle",i.target.value),onBlur:z,className:"text-sm h-7 border-gray-300",autoFocus:!0}):t.jsx("div",{onClick:()=>O(r,"jobTitle"),className:"cursor-pointer text-sm text-gray-700",children:e.jobTitle||t.jsx("span",{className:"text-gray-300",children:"—"})})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap",children:(o==null?void 0:o.row)===r&&(o==null?void 0:o.col)==="location"?t.jsx(U,{value:e.location,onChange:i=>I(e.id,"location",i.target.value),onBlur:z,className:"text-sm h-7 border-gray-300",autoFocus:!0}):t.jsx("div",{onClick:()=>O(r,"location"),className:"cursor-pointer text-sm text-gray-700",children:e.location||t.jsx("span",{className:"text-gray-300",children:"—"})})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap min-w-[180px]",children:t.jsxs("div",{className:"flex items-center gap-2 min-w-[180px]",children:[t.jsx("select",{value:e.status,onChange:i=>I(e.id,"status",i.target.value),className:"text-xs bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer hover:border-gray-400 transition-colors flex-shrink-0 min-w-[150px]",style:{color:s==null?void 0:s.color},children:oe.map(i=>t.jsx("option",{value:i.value,style:{color:i.color},children:i.label},i.value))}),e.gmailThreadId&&e.id&&t.jsx(Pe,{contactId:e.id,contactEmail:e.email,gmailThreadId:e.gmailThreadId,hasUnreadReply:((a=de[e.id])==null?void 0:a.isUnread)||!1,notificationsMuted:e.notificationsMuted||!1,onStateChange:()=>{R(),V()}})]})}),t.jsx("td",{className:"px-4 py-3 whitespace-nowrap text-right",children:t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[e.email?t.jsx(j,{size:"sm",variant:"ghost",onClick:()=>we(e),className:"text-gray-400 hover:text-blue-600 hover:bg-blue-50",children:t.jsx(P,{className:"h-4 w-4"})}):t.jsx("span",{className:"text-gray-300",children:"—"}),e.email&&e.id&&(e.gmailDraftId?t.jsx(j,{size:"sm",variant:"ghost",onClick:()=>window.open(e.gmailDraftUrl||"https://mail.google.com/mail/#drafts","_blank"),className:"text-green-600 hover:text-green-700 hover:bg-green-50",title:"Open Gmail draft",children:t.jsx(se,{className:"h-4 w-4"})}):t.jsx(j,{size:"sm",variant:"ghost",onClick:()=>fe(e),disabled:Y.has(e.id),className:"text-gray-400 hover:text-purple-600 hover:bg-purple-50",title:"Create Gmail draft",children:Y.has(e.id)?t.jsx(Ie,{className:"h-4 w-4 animate-spin"}):t.jsx(Te,{className:"h-4 w-4"})})),t.jsx(j,{variant:"ghost",size:"sm",onClick:i=>{i.stopPropagation(),xe(e.id,H(e))},className:"h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50",title:"Delete contact",children:t.jsx(re,{className:"h-4 w-4"})})]})})]},e.id)})})]})}),f.length===0&&l.length>0&&v&&t.jsxs("div",{className:"px-6 py-12 text-center",children:[t.jsx("p",{className:"text-gray-500 mb-2",children:"No contacts match your search."}),t.jsx("button",{onClick:()=>g(""),className:"text-sm text-blue-600 hover:text-blue-700",children:"Clear search"})]})]}),ne&&S&&t.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:t.jsxs("div",{className:"bg-white rounded-lg p-6 max-w-md w-full mx-4 border border-gray-200",children:[t.jsx("h3",{className:"text-lg font-semibold text-gray-900 mb-4",children:"Choose Email App"}),t.jsxs("p",{className:"text-gray-600 mb-6 text-sm",children:["Send email to ",H(S)]}),t.jsxs("div",{className:"flex gap-3",children:[t.jsx(j,{onClick:()=>ae("apple"),variant:"outline",className:"flex-1 py-6",children:t.jsxs("div",{className:"flex flex-col items-center gap-2",children:[t.jsx(P,{className:"h-5 w-5"}),t.jsx("span",{className:"text-sm",children:"Apple Mail"})]})}),t.jsx(j,{onClick:()=>ae("gmail"),className:"flex-1 py-6 bg-blue-600 hover:bg-blue-700",children:t.jsxs("div",{className:"flex flex-col items-center gap-2",children:[t.jsx(P,{className:"h-5 w-5"}),t.jsx("span",{className:"text-sm",children:"Gmail"})]})})]}),t.jsx(j,{onClick:()=>{M(!1),G(null)},variant:"ghost",className:"w-full mt-4 text-gray-500",children:"Cancel"})]})}),t.jsx(Ae,{open:ce,onOpenChange:K,children:t.jsxs(Ue,{children:[t.jsxs(Re,{children:[t.jsx(ze,{children:"Upgrade to Export CSV"}),t.jsx(Be,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your contacts to CSV."})]}),t.jsxs(Fe,{children:[t.jsx(Le,{children:"Cancel"}),t.jsx($e,{onClick:()=>x("/pricing"),className:"bg-blue-600 hover:bg-blue-700",children:"Upgrade"})]})]})}),t.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. PAGE HEADER SECTION - Width 100%, padding 16px */
          .contact-directory-page {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            box-sizing: border-box;
            padding: 0;
          }

          .contact-directory-header-text {
            width: 100%;
            max-width: 100%;
            padding: 0 16px;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
            margin: 0;
          }

          /* 2. CONTROLS ROW - Separate from table, fixed width */
          .contact-directory-controls-row {
            width: 100%;
            max-width: 100%;
            padding: 0 16px;
            box-sizing: border-box;
            flex-wrap: wrap;
            gap: 8px;
            position: relative;
            z-index: 10;
            background: white;
            margin: 0;
            overflow: hidden;
          }

          .contact-directory-search {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            flex: 1 1 100%;
          }

          .contact-directory-search input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .contact-directory-actions {
            width: 100%;
            max-width: 100%;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
            box-sizing: border-box;
            display: flex;
            margin: 0;
          }

          .contact-directory-count {
            width: 100%;
            flex-basis: 100%;
            flex-shrink: 0;
            white-space: nowrap;
            margin-bottom: 4px;
            box-sizing: border-box;
          }

          /* Buttons - reduce padding or use icon-only on mobile */
          .contact-directory-export-btn {
            flex: 1 1 auto;
            min-width: fit-content;
            padding: 8px 10px !important;
            font-size: 0.75rem;
            box-sizing: border-box;
            max-width: 100%;
            white-space: nowrap;
          }

          /* Make "Export CSV" button smaller - reduce text if needed */
          .contact-directory-export-btn svg {
            width: 14px;
            height: 14px;
          }

          .contact-directory-refresh-btn,
          .contact-directory-delete-btn {
            min-width: 44px;
            min-height: 44px;
            padding: 8px !important;
            box-sizing: border-box;
            flex-shrink: 0;
          }

          /* Hide text in icon buttons, keep icons */
          .contact-directory-refresh-btn > span:not(.lucide),
          .contact-directory-delete-btn > span:not(.lucide) {
            display: none;
          }

          /* 3. TABLE CONTAINER - Separate scroll container */
          .contact-directory-table-wrapper {
            width: 100%;
            max-width: 100vw;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          .contact-directory-table-container {
            width: 100%;
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }

          /* 4. TABLE STRUCTURE - Horizontal scroll, sticky first column */
          .contact-directory-table {
            min-width: 800px;
            width: 100%;
            box-sizing: border-box;
          }

          .contact-directory-name-header {
            position: sticky;
            left: 0;
            background: white;
            z-index: 5;
            box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
          }

          .contact-directory-name-cell {
            position: sticky;
            left: 0;
            background: white;
            z-index: 4;
            box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
          }

          /* Ensure sticky cells have proper background on hover */
          .contact-directory-table tbody tr:hover .contact-directory-name-cell {
            background: #f9fafb;
          }

          /* 5. SEARCH INPUT - Full width */
          .contact-directory-search {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            margin: 0;
          }

          .contact-directory-search input {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            margin: 0;
          }

          /* 6. GENERAL - Prevent page-level horizontal scroll */
          .contact-directory-page {
            overflow-x: hidden;
            max-width: 100vw;
            width: 100%;
          }

          .contact-directory-page > * {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Ensure all header elements use box-sizing */
          .contact-directory-page * {
            box-sizing: border-box;
          }

          /* Remove any negative margins or transforms that cause overflow */
          .contact-directory-page * {
            margin-left: 0;
            margin-right: 0;
          }

          .contact-directory-controls-row *,
          .contact-directory-actions *,
          .contact-directory-search * {
            transform: none;
            position: static;
          }
        }
      `})]})};export{qe as S};
