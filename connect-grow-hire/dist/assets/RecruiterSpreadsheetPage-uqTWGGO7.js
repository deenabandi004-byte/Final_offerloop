import{r as a,j as e,aJ as de,aO as Fe,aP as Ue,ak as B,aK as Me,an as Le,ah as Ie,L as Te,p as Ae,ar as De}from"./vendor-react-BrZ-WZRu.js";import{R as Pe}from"./RecruiterSpreadsheet-BaEdiVXj.js";import{S as Be,A as He,a as _e}from"./AppHeader-fDBkgA9j.js";import{T as ze,c as ce}from"./tabs-z-lQ2xm7.js";import{u as Je,h as me,b as ue,t as u,s as Oe}from"./index-dQMVckWW.js";import{d as ge,e as Ve,r as $e,l as We,m as Ge,u as qe}from"./vendor-firebase-D7hJdl6b.js";import{A as Ye,i as Ke}from"./resumeFileTypes-B1GfhC9L.js";import{M as Xe}from"./MainContentWrapper-CSzHHS03.js";import{V as Qe}from"./VideoDemo-BfvEAfGq.js";import{P as Ze}from"./ProGate-MtEPuJhG.js";import{S as er}from"./StickyCTA-D5PypqpG.js";import{f as he}from"./firebaseApi-Dt9UzdVh.js";const gr=()=>{const{user:n}=Je(),[g,v]=a.useState("find-hiring-managers"),[E,H]=a.useState(null),[_,z]=a.useState(null),[k,J]=a.useState(!1),F=a.useRef(null),[d,O]=a.useState(""),[S,V]=a.useState(""),[U,$]=a.useState(""),[W,G]=a.useState(""),[M,q]=a.useState(""),[c,w]=a.useState(!1),[xe,L]=a.useState(!1),[pe,I]=a.useState(0),[T]=a.useState(2),[Y,fe]=a.useState(0),[A,K]=a.useState(!1),X=a.useRef(null),[Q,be]=a.useState(0),[ye,je]=a.useState(0),Z=t=>{if(!t||t.trim().length===0)return!1;const s=["javascript is disabled","javascript is required","enable javascript","please enable javascript","browser not supported","loading...","please wait"],l=t.toLowerCase().trim();return!s.some(p=>l.includes(p))},ve=t=>{try{return new URL(t),!0}catch{return!1}},ee=a.useCallback(async()=>{if(n!=null&&n.uid)try{const t=ge(me,"users",n.uid),s=await Ve(t);if(s.exists()){const l=s.data();H(l.resumeUrl||null),z(l.resumeFileName||null)}}catch(t){console.error("Failed to load saved resume:",t)}},[n==null?void 0:n.uid]);a.useEffect(()=>{ee()},[ee]);const we=async t=>{if(!(n!=null&&n.uid))throw new Error("User not authenticated");J(!0);try{const s=$e(Oe,`resumes/${n.uid}/${t.name}`);await We(s,t);const l=await Ge(s),p=ge(me,"users",n.uid);await qe(p,{resumeUrl:l,resumeFileName:t.name,resumeUpdatedAt:new Date().toISOString()}),H(l),z(t.name),u({title:"Resume saved",description:"Your resume has been uploaded and saved to your account."})}catch(s){const l=s instanceof Error?s.message:"Failed to save resume";throw u({title:"Upload failed",description:l,variant:"destructive"}),s}finally{J(!1)}},Ne=async t=>{var l;const s=(l=t.target.files)==null?void 0:l[0];if(s){if(!Ke(s)){u({title:"Invalid file type",description:"Please upload a PDF, DOCX, or DOC file.",variant:"destructive"});return}if(s.size>10*1024*1024){u({title:"File Too Large",description:"Please upload a file smaller than 10MB.",variant:"destructive"});return}try{await we(s)}catch{}t.target.value=""}},ke=d.trim()||M.trim(),C=E&&ke&&!c,re=async()=>{var s,l,p,te;if(!C||!n)return;w(!0),I(0);const t=setInterval(()=>{I(h=>h>=90?(clearInterval(t),90):h+10)},200);try{let h=S,b=U,D=W,N=M;if(d&&d.trim())try{const i=await ue.parseJobUrl({url:d});if(i.job){i.job.company&&!h&&(h=i.job.company);const y=i.job.title;y&&!b&&Z(y)&&(b=y),i.job.location&&!D&&(D=i.job.location),i.job.description&&!N&&(N=i.job.description)}else i.error&&(console.warn("Failed to parse job URL:",i.error),u({title:"Could not parse job URL",description:"Please paste the job description instead.",variant:"default"}))}catch(i){console.error("Error parsing job URL:",i)}if(!N||!N.trim()){u({title:"Job description required",description:"Please provide a job description or paste a job URL.",variant:"destructive"}),clearInterval(t),w(!1);return}const o=await ue.findHiringManagers({company:h,jobTitle:b,jobDescription:N,location:D,jobUrl:d||void 0,maxResults:T,generateEmails:!0,createDrafts:!0});if(console.log("🔍 API Response:",JSON.stringify(o,null,2)),console.log("🔍 Hiring managers found:",(s=o.hiringManagers)==null?void 0:s.length),console.log("🔍 First manager raw:",(l=o.hiringManagers)==null?void 0:l[0]),clearInterval(t),I(100),o.error){u({title:"Error finding hiring managers",description:o.error,variant:"destructive"}),w(!1);return}if(o.hiringManagers&&o.hiringManagers.length>0)try{const i=new Map;o.draftsCreated&&Array.isArray(o.draftsCreated)&&o.draftsCreated.forEach(r=>{const x=r.recruiter_email||r.recruiterEmail;x&&i.set(x.toLowerCase(),r)});const y=o.hiringManagers.map(r=>{const x=r.Email||r.email||r.WorkEmail||r.work_email||"",m={firstName:r.FirstName||r.firstName||r.first_name||"",lastName:r.LastName||r.lastName||r.last_name||"",linkedinUrl:r.LinkedIn||r.linkedin||r.linkedinUrl||r.linkedin_url||"",email:x,company:r.Company||r.company||h,jobTitle:r.Title||r.title||r.jobTitle||r.job_title||"",location:`${r.City||r.city||""}${(r.City||r.city)&&(r.State||r.state)?", ":""}${r.State||r.state||""}`.trim()||"",dateAdded:new Date().toISOString(),status:"Not Contacted"},ie=r.Phone||r.phone,ne=r.WorkEmail||r.work_email||r.workEmail,le=r.PersonalEmail||r.personal_email||r.personalEmail,P=b,oe=d;if(ie&&(m.phone=ie),ne&&(m.workEmail=ne),le&&(m.personalEmail=le),P&&Z(P)&&(m.associatedJobTitle=P),oe&&(m.associatedJobUrl=oe),x){const f=i.get(x.toLowerCase());f&&(f.draft_id&&(m.gmailDraftId=f.draft_id),f.message_id&&(m.gmailMessageId=f.message_id),f.draft_url&&(m.gmailDraftUrl=f.draft_url))}return m});console.log("📋 Converted to Firebase format:",JSON.stringify(y,null,2));const se=await he.getRecruiters(n.uid),Re=new Set(se.map(r=>r.email).filter(Boolean)),Ee=new Set(se.map(r=>r.linkedinUrl).filter(Boolean)),j=y.filter(r=>{const x=r.email&&Re.has(r.email),m=r.linkedinUrl&&Ee.has(r.linkedinUrl);return!x&&!m});console.log("💾 About to save these recruiters:",j.length,JSON.stringify(j,null,2)),j.length>0?(await he.bulkCreateRecruiters(n.uid,j),be(r=>r+j.length),console.log(`✅ Saved ${j.length} hiring manager(s) to tracker`),je(r=>r+1),v("hiring-manager-tracker")):console.log("⚠️ All hiring managers were duplicates, nothing saved")}catch(i){console.error("Error saving hiring managers to tracker:",i),u({title:"Error saving to tracker",description:"Hiring managers were found but couldn't be saved. Please try again.",variant:"destructive"})}else console.log("⚠️ No hiring managers in response to save");const R=((p=o.hiringManagers)==null?void 0:p.length)||0,ae=((te=o.hiringManagers)==null?void 0:te.length)||0;fe(R),R>0?u({title:`Found ${R} hiring manager${R!==1?"s":""}!`,description:o.draftsCreated&&o.draftsCreated.length>0?`${ae} saved to tracker. Draft emails saved to your Gmail.`:`${ae} saved to tracker.`}):u({title:"No hiring managers found",description:"Try adjusting your search criteria or company name.",variant:"default"}),w(!1),L(!0)}catch(h){clearInterval(t),w(!1);const b=h instanceof Error?h.message:"Failed to find hiring managers";u({title:"Error",description:b,variant:"destructive"})}},Se=()=>{L(!1),v("hiring-manager-tracker")},Ce=()=>{L(!1),O(""),V(""),$(""),G(""),q("")};return e.jsxs(Be,{children:[e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(He,{}),e.jsxs(Xe,{children:[e.jsx(_e,{title:""}),e.jsx(Ze,{title:"Find Hiring Manager",description:"Find the recruiters and hiring managers behind any job posting. Paste a URL and get direct contact info in seconds.",videoId:"TIERqtjc1tk",children:e.jsx("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#F8FAFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:e.jsxs("div",{children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Instrument Serif', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Hiring Managers"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#64748B",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Paste a job posting URL and we'll find the recruiters and hiring managers for that role."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Qe,{videoId:"TIERqtjc1tk"})})]}),e.jsx("div",{style:{display:"flex",justifyContent:"center",marginBottom:"36px"},children:e.jsxs("div",{style:{display:"inline-flex",gap:"0",background:"#F0F4FD",borderRadius:"12px",padding:"4px",margin:"0 auto"},children:[e.jsxs("button",{onClick:()=>v("find-hiring-managers"),style:{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"9px",border:"none",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"14px",fontWeight:500,transition:"all 0.15s ease",background:g==="find-hiring-managers"?"#2563EB":"transparent",color:g==="find-hiring-managers"?"white":"#64748B",boxShadow:g==="find-hiring-managers"?"0 1px 3px rgba(37, 99, 235, 0.2)":"none"},children:[e.jsx(de,{className:"h-4 w-4"}),"Find Hiring Managers"]}),e.jsxs("button",{onClick:()=>v("hiring-manager-tracker"),style:{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"9px",border:"none",cursor:"pointer",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"14px",fontWeight:500,transition:"all 0.15s ease",background:g==="hiring-manager-tracker"?"#2563EB":"transparent",color:g==="hiring-manager-tracker"?"white":"#64748B",boxShadow:g==="hiring-manager-tracker"?"0 1px 3px rgba(37, 99, 235, 0.2)":"none"},children:[e.jsx(Fe,{className:"h-4 w-4"}),"Hiring Manager Tracker",Q>0&&e.jsx("span",{style:{marginLeft:"6px",padding:"2px 8px",borderRadius:"6px",background:g==="hiring-manager-tracker"?"rgba(255, 255, 255, 0.2)":"rgba(37, 99, 235, 0.08)",color:g==="hiring-manager-tracker"?"white":"#2563EB",fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"11px",fontWeight:600,letterSpacing:"0.03em"},children:Q})]})]})}),e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(ze,{value:g,onValueChange:v,className:"w-full",children:[e.jsx(ce,{value:"find-hiring-managers",className:"mt-0",children:e.jsxs("div",{className:"bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden animate-fadeInUp recruiter-search-form-card",style:{animationDelay:"200ms"},children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsxs("div",{className:"p-8 recruiter-search-form-content",children:[e.jsxs("div",{className:"mb-8",children:[e.jsx("h2",{className:"text-xl font-semibold text-gray-900 mb-2",children:"Find Hiring Managers"}),e.jsx("p",{className:"text-gray-600",children:"Paste a job posting URL and we'll find the recruiters and hiring managers for that role."})]}),e.jsxs("div",{className:"mb-6",children:[e.jsxs("div",{className:"relative group",children:[e.jsx("div",{className:"absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none",children:e.jsx(Ue,{className:"h-5 w-5 text-gray-400 group-focus-within:text-blue-600 transition-colors"})}),e.jsx("input",{type:"url",value:d,onChange:t=>{O(t.target.value),t.target.value.trim()&&K(!1)},placeholder:"Paste the job posting URL (LinkedIn, Greenhouse, Lever, etc.)",disabled:c,className:`w-full pl-12 pr-12 py-4 text-base border-2 border-gray-300 rounded-2xl
                                       text-gray-900 placeholder-gray-400 bg-white
                                       hover:border-gray-400
                                       focus:border-blue-400 focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20
                                       transition-all duration-150 disabled:opacity-50`}),d&&ve(d)&&e.jsx("div",{className:"absolute inset-y-0 right-0 pr-4 flex items-center",children:e.jsx(B,{className:"h-5 w-5 text-green-500"})})]}),e.jsx("p",{className:"mt-2 text-xs text-gray-400",children:"We'll extract all details automatically from the job posting."})]}),e.jsx("div",{className:"mb-6",children:e.jsx("button",{type:"button",onClick:()=>K(!A),className:"text-sm text-gray-600 hover:text-blue-700 transition-all duration-150 flex items-center gap-1.5 group underline decoration-gray-300 hover:decoration-blue-400",children:A?e.jsx(e.Fragment,{children:e.jsx("span",{children:"Hide manual entry"})}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"Or enter details manually"}),e.jsx("span",{className:"text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity",children:"→"})]})})}),A&&!d&&e.jsxs("div",{className:"mb-8 pt-6 border-t border-gray-100",children:[e.jsx("p",{className:"text-sm text-gray-600 mb-5",children:"Use this if a job posting URL isn't available."}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-4 mb-4",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Company"}),e.jsxs("div",{className:"relative",children:[e.jsx("div",{className:"absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none",children:e.jsx(Me,{className:"h-4 w-4 text-gray-400"})}),e.jsx("input",{type:"text",value:S,onChange:t=>V(t.target.value),placeholder:"e.g. Google, Stripe",disabled:c,className:`block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed`})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Job Title"}),e.jsxs("div",{className:"relative",children:[e.jsx("div",{className:"absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none",children:e.jsx(Le,{className:"h-4 w-4 text-gray-400"})}),e.jsx("input",{type:"text",value:U,onChange:t=>$(t.target.value),placeholder:"e.g. Product Manager",disabled:c,className:`block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed`})]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Location"}),e.jsxs("div",{className:"relative",children:[e.jsx("div",{className:"absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none",children:e.jsx(Ie,{className:"h-4 w-4 text-gray-400"})}),e.jsx("input",{type:"text",value:W,onChange:t=>G(t.target.value),placeholder:"e.g. New York, NY",disabled:c,className:`block w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl
                                             text-gray-900 placeholder-gray-400 text-sm
                                             hover:border-gray-300
                                             focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                             transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed`})]})]})]}),e.jsxs("div",{children:[e.jsxs("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:["Job Description ",e.jsx("span",{className:"text-red-400",children:"*"})]}),e.jsx("textarea",{value:M,onChange:t=>q(t.target.value),placeholder:"Paste the job description or role summary here.",rows:4,disabled:c,className:`block w-full px-4 py-3 border border-gray-200 rounded-xl
                                         text-gray-900 placeholder-gray-400 text-sm resize-none
                                         hover:border-gray-300
                                         focus:bg-blue-50/20 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400
                                         transition-all duration-150 disabled:bg-gray-100 disabled:cursor-not-allowed`})]})]}),e.jsx("div",{className:"mb-8 pt-6 border-t border-gray-100",children:e.jsx("p",{className:"text-xs text-gray-400 text-center",children:"Draft emails saved automatically to Gmail • Verified emails • Auto-saved to Hiring Manager Tracker"})}),e.jsxs("div",{className:"mt-8 pt-8 border-t border-gray-100",children:[e.jsx("div",{className:"mb-6 text-center",children:e.jsxs("p",{className:"text-sm text-gray-500",children:["Will find ",T," hiring managers • ",15*T," credits"]})}),e.jsx("div",{className:"flex justify-center",children:e.jsx("button",{ref:X,onClick:re,disabled:!C,className:`
                            w-full md:w-auto px-8 py-4 rounded-full font-semibold text-lg
                            flex items-center justify-center gap-3
                            transition-all duration-150
                            ${C?"bg-blue-600 text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100":"bg-gray-300 text-gray-500 cursor-not-allowed"}
                          `,children:c?e.jsxs(e.Fragment,{children:[e.jsx(Te,{className:"w-5 h-5 animate-spin"}),"Finding..."]}):e.jsxs(e.Fragment,{children:["Find Hiring Managers",e.jsx(Ae,{className:"w-5 h-5"})]})})}),!E&&e.jsx("p",{className:"text-center text-sm text-gray-500 mt-4",children:"Please upload your resume to continue"})]}),e.jsxs("div",{className:"mt-8 pt-8 border-t border-gray-100",children:[e.jsx("input",{type:"file",accept:Ye.accept,onChange:Ne,className:"hidden",ref:F,disabled:c||k}),E&&_?e.jsxs("div",{className:"flex items-center justify-between p-3 bg-gray-50 rounded-lg",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx(B,{className:"w-5 h-5 text-green-500"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-medium text-gray-900",children:"Resume on file"}),e.jsx("p",{className:"text-xs text-gray-500",children:_})]})]}),e.jsx("button",{onClick:()=>{var t;return(t=F.current)==null?void 0:t.click()},disabled:c||k,className:"text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50",children:k?"Uploading...":"Change"})]}):e.jsxs("div",{onClick:()=>{var t;return(t=F.current)==null?void 0:t.click()},className:"flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer",children:[e.jsx(De,{className:"w-5 h-5 text-gray-400"}),e.jsxs("div",{className:"flex-1",children:[e.jsx("p",{className:"text-sm font-medium text-gray-900",children:k?"Uploading...":"Upload your resume"}),e.jsx("p",{className:"text-xs text-gray-500",children:"Required • Improves match quality"})]})]})]})]})]})}),e.jsx(ce,{value:"hiring-manager-tracker",className:"mt-0",children:e.jsxs("div",{className:"bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fadeInUp",style:{animationDelay:"200ms"},children:[e.jsx("div",{className:"h-1 bg-gray-100"}),e.jsx("div",{className:"p-8",children:e.jsx(Pe,{},ye)})]})})]})})]})})})]}),c&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl",children:[e.jsx("div",{className:"w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(de,{className:"w-8 h-8 text-gray-900 animate-pulse"})}),e.jsx("h3",{className:"text-xl font-semibold text-gray-900 mb-2",children:"Finding hiring managers..."}),e.jsx("p",{className:"text-gray-600 mb-4",children:d?"Analyzing the job posting and identifying decision makers":`Searching for hiring managers at ${S}`}),e.jsx("div",{className:"w-full bg-gray-200 rounded-full h-2",children:e.jsx("div",{className:"bg-blue-600 h-2 rounded-full transition-all duration-300",style:{width:`${pe}%`}})}),e.jsx("p",{className:"text-sm text-gray-500 mt-3",children:"This usually takes 15-30 seconds"})]})}),xe&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl animate-scaleIn",children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(B,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold text-gray-900 mb-1",children:["Found ",Y," hiring manager",Y!==1?"s":"","!"]}),e.jsxs("p",{className:"text-gray-600 mb-2",children:[U||"Role"," at ",S||"Company"]}),e.jsx("p",{className:"text-sm text-gray-600 font-medium mb-6",children:"Draft emails saved to your Gmail"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:Se,className:"px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:shadow-lg transition-all",children:"View Hiring Managers →"}),e.jsx("button",{onClick:Ce,className:"px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors",children:"Search again"})]})]})})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. PAGE/BODY LEVEL - Prevent horizontal overflow */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .recruiter-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          /* 2. ALL MAIN CONTENT CONTAINERS */
          .recruiter-search-container {
            max-width: 100vw;
            width: 100%;
            box-sizing: border-box;
            padding-left: 16px;
            padding-right: 16px;
          }

          /* 3. HEADER SECTION - Ensure padding so text doesn't touch edges */
          .recruiter-search-header {
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          .recruiter-search-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 1.75rem !important;
          }

          .recruiter-search-subtitle {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          /* 4. TAB BARS - Ensure doesn't overflow */
          .recruiter-search-tabs {
            max-width: 100%;
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .recruiter-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .recruiter-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARDS - Full width with proper padding */
          .recruiter-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. ALL CHILD ELEMENTS - Ensure no fixed widths exceed viewport */
          .recruiter-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-page img,
          .recruiter-search-page .recruiter-search-form-card,
          .recruiter-search-page button,
          .recruiter-search-page input,
          .recruiter-search-page textarea,
          .recruiter-search-page select {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .recruiter-search-page p,
          .recruiter-search-page h1,
          .recruiter-search-page h2,
          .recruiter-search-page h3,
          .recruiter-search-page span,
          .recruiter-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }
        }
      `}),g==="find-hiring-managers"&&e.jsx(er,{originalButtonRef:X,onClick:re,isLoading:c,disabled:!C,buttonClassName:"rounded-full",children:e.jsx("span",{children:"Find Hiring Managers"})})]})};export{gr as default};
