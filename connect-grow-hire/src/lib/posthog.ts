import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

  if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: '2026-05-30',

      autocapture: true,
      capture_pageview: true,
      capture_pageleave: true,

      persistence: 'localStorage',

      // Session replay: project-level toggle lives in PostHog UI
      // (Project Settings → Replay → Record user sessions). Without that,
      // these options are inert.
      session_recording: {
        // Offerloop forms hold emails, names, resumes — mask every input by
        // default. Devs can opt specific elements OUT with data-ph-no-mask.
        maskAllInputs: true,
        // Mark sensitive non-input text with data-private="true" to mask it.
        maskTextSelector: '[data-private="true"]',
        recordCrossOriginIframes: false,
      },
    })
  } else {
    console.warn('[PostHog] Missing environment variables. PostHog will not be initialized.')
    console.warn('[PostHog] Required: VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST')
  }
}

export default posthog
