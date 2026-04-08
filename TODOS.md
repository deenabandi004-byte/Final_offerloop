# TODOS

Deferred work tracked across reviews. Items added by /plan-ceo-review.

## Email Personalization Engine (2026-04-08)

### P2: "Why This Email Works" Transparency Panel
- **What:** After generating an email, show which warmth signals and research hooks were used
- **Why:** Builds user trust in AI-generated emails, teaches users what good personalization looks like
- **Pros:** Increases confidence in sending, educational for students learning to network
- **Cons:** Adds UI complexity to email generation flow
- **Context:** warmth_scoring returns signals list, B2 returns hooks with types. Both are already computed during generation, just need to surface them. Display as collapsible section below the email.
- **Effort:** S (human: ~3 hrs / CC: ~20 min)
- **Priority:** P2
- **Depends on:** Phase A email personalization shipping first

### P3: Writing Style Learning
- **What:** Analyze user's past edited emails to learn their voice and match it in future generations
- **Why:** Makes AI emails indistinguishable from user's own writing style
- **Pros:** Highest-quality personalization possible, true moat
- **Cons:** Requires ~10+ edited emails per user for meaningful signal, cold start problem, privacy consideration (analyzing user's writing)
- **Context:** Users edit generated emails before sending. Track edits (diff original vs sent version), extract style patterns (sentence length, formality, vocabulary). Feed back into system prompt as style examples.
- **Effort:** L (human: ~2 weeks / CC: ~2 hrs)
- **Priority:** P3
- **Depends on:** Users actively editing and sending emails for several weeks. Gmail integration for tracking sent versions.
