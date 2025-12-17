import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
  const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

  if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
      api_host: posthogHost,

      autocapture: false,        // 🚫 no noisy click tracking
      capture_pageview: false,   // 🚫 no automatic pageviews
      capture_pageleave: true,

      persistence: 'localStorage',
    })
  } else {
    console.warn('[PostHog] Missing environment variables. PostHog will not be initialized.')
    console.warn('[PostHog] Required: VITE_PUBLIC_POSTHOG_KEY and VITE_PUBLIC_POSTHOG_HOST')
  }
}

export default posthog
