import{j as t}from"./vendor-react-D81Bzby8.js";import{S as r,A as e,a as n}from"./AppHeader-Bls-m8Hm.js";import{M as i}from"./MainContentWrapper-FildVK-T.js";import{S as a}from"./ContactDirectory-Dqbyg5BL.js";const m=()=>t.jsxs(r,{children:[t.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[t.jsx(e,{}),t.jsxs(i,{children:[t.jsx(n,{title:""}),t.jsx("main",{style:{background:"#F8FAFF",flex:1,overflowY:"auto"},className:"networking-tracker-page",children:t.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 networking-tracker-container",style:{maxWidth:"900px",margin:"0 auto"},children:[t.jsx("h1",{className:"text-[28px] sm:text-[42px] networking-tracker-title",style:{fontFamily:"'Instrument Serif', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Networking Tracker"}),t.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#64748B",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"All contacts you've found, saved, or contacted."}),t.jsx(a,{})]})})]})]}),t.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. MAIN PAGE CONTAINER / WRAPPER */
          .networking-tracker-page {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
            padding: 0;
          }

          .networking-tracker-container {
            width: 100%;
            max-width: 100vw;
            padding: 0 !important;
            margin: 0;
            box-sizing: border-box;
          }

          /* 2. HEADER CONTENT WRAPPER - Only target title, let component handle its own padding */
          .networking-tracker-container {
            padding-left: 16px !important;
            padding-right: 16px !important;
            padding-top: 16px !important;
            padding-bottom: 16px !important;
          }

          /* 3. PAGE TITLE */
          .networking-tracker-title {
            width: 100%;
            max-width: 100%;
            font-size: 1.5rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            margin: 0 0 16px 0 !important;
            padding: 0 !important;
            box-sizing: border-box;
          }

          /* Ensure no negative margins or transforms */
          .networking-tracker-title * {
            margin: 0;
            transform: none;
          }
        }
      `})]});export{m as default};
