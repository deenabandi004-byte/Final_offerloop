// Content script for Offerloop LinkedIn integration
console.log('[Offerloop] Content script loaded');

// SVG icon for the button
const OFFERLOOP_ICON = `<img class="offerloop-btn-icon" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="Offerloop" width="16" height="16">`;

// Track active MutationObservers so we can disconnect them on cleanup
let profileObserver = null;
let navigationObserver = null;

// Check if we're on a LinkedIn profile page
function isLinkedInProfilePage() {
  return window.location.href.includes('linkedin.com/in/');
}

// Extract the LinkedIn profile URL (clean version)
function getLinkedInProfileUrl() {
  const url = window.location.href;
  // Remove query params and hash, keep just the profile URL
  const match = url.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+/);
  return match ? match[0] : url.split('?')[0].split('#')[0];
}

// Show toast notification
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.querySelector('.offerloop-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `offerloop-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'offerloop-slide-in 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Create the Offerloop button
function createOfferloopButton() {
  const button = document.createElement('button');
  button.className = 'offerloop-btn';
  button.id = 'offerloop-add-btn';
  button.innerHTML = `${OFFERLOOP_ICON}<span>Offerloop</span>`;
  
  button.addEventListener('click', handleAddToOfferloop);
  
  return button;
}

// Handle button click
async function handleAddToOfferloop(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const button = document.getElementById('offerloop-add-btn');
  if (!button || button.classList.contains('loading')) return;
  
  const linkedInUrl = getLinkedInProfileUrl();
  console.log('[Offerloop] Adding profile:', linkedInUrl);
  
  // Set loading state
  button.classList.add('loading');
  button.innerHTML = `<div class="offerloop-spinner"></div><span>Adding...</span>`;
  
  try {
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'addToOfferloop',
      linkedInUrl: linkedInUrl
    });
    
    if (response.success) {
      button.classList.remove('loading');
      button.classList.add('success');
      button.innerHTML = `${OFFERLOOP_ICON}<span>Added!</span>`;
      showToast(response.message || 'Contact added to Offerloop!', 'success');
      
      // Reset button after 3 seconds
      setTimeout(() => {
        button.classList.remove('success');
        button.innerHTML = `${OFFERLOOP_ICON}<span>Offerloop</span>`;
      }, 3000);
    } else {
      throw new Error(response.error || 'Failed to add contact');
    }
  } catch (error) {
    console.error('[Offerloop] Error:', error);
    button.classList.remove('loading');
    button.innerHTML = `${OFFERLOOP_ICON}<span>Offerloop</span>`;
    showToast(error.message || 'Failed to add contact. Please try again.', 'error');
  }
}

// Find the "More" button on LinkedIn profile
function findMoreButton() {
  // Get ALL "More actions" buttons on the page
  const allMoreBtns = document.querySelectorAll('button[aria-label="More actions"]');
  
  for (const btn of allMoreBtns) {
    // SKIP if it's in the sticky header
    const isInStickyHeader = btn.closest('.scaffold-layout__sticky-header, .global-nav');
    if (isInStickyHeader) {
      continue;
    }
    
    // ONLY accept if it's in the main profile card area
    const isInMainProfile = btn.closest('.scaffold-layout__main, .pv-top-card, main');
    if (isInMainProfile) {
      console.log('[Offerloop] Found main profile More button:', btn);
      return btn;
    }
  }
  
  console.log('[Offerloop] Could not find main profile More button');
  return null;
}

// Inject the Offerloop button
function injectButton() {
  if (document.getElementById('offerloop-add-btn')) {
    console.log('[Offerloop] Button already exists');
    return true;
  }
  
  const moreBtn = findMoreButton();
  
  if (!moreBtn) {
    console.log('[Offerloop] Could not find More button');
    return false;
  }
  
  const button = createOfferloopButton();
  
  // Insert after the More button's parent container
  const insertAfter = moreBtn.closest('.artdeco-dropdown') || moreBtn;
  insertAfter.parentNode.insertBefore(button, insertAfter.nextSibling);
  
  console.log('[Offerloop] Button injected successfully');
  return true;
}

// Initialize on profile pages
function init() {
  if (!isLinkedInProfilePage()) {
    console.log('[Offerloop] Not a profile page, skipping');
    return;
  }
  
  console.log('[Offerloop] Profile page detected, injecting button...');
  
  // Try to inject immediately
  if (!injectButton()) {
    // Retry with increasing delays (LinkedIn loads dynamically)
    const delays = [500, 1000, 2000, 3000, 5000];
    delays.forEach(delay => {
      setTimeout(() => {
        if (!document.getElementById('offerloop-add-btn')) {
          injectButton();
        }
      }, delay);
    });
  }
  
  // Also watch for navigation changes (LinkedIn is an SPA)
  // Disconnect any previous profile observer before creating a new one
  // to prevent multiple observers stacking up on each SPA navigation
  if (profileObserver) {
    profileObserver.disconnect();
    profileObserver = null;
    console.log('[Offerloop] Disconnected previous profile observer');
  }

  profileObserver = new MutationObserver((mutations) => {
    if (isLinkedInProfilePage() && !document.getElementById('offerloop-add-btn')) {
      injectButton();
    }
  });

  profileObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ============================================
// JOB SCRAPING FUNCTIONS
// ============================================

// Helper: Find first matching selector with text content
function findFirst(selectors) {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  
  for (const selector of selectorList) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 1000) {
          return text;
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Helper: Convert string to Title Case
function titleCase(str) {
  if (!str) return null;
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// --------------------------------------------
// LINKEDIN JOBS SCRAPER
// --------------------------------------------
function scrapeLinkedInJobs() {
  const selectors = {
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.topcard__title',
      'h1[class*="job-title"]',
      '.jobs-details h1'
    ],
    company: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      '.topcard__org-name-link',
      '.job-details-jobs-unified-top-card__primary-description-container a',
      '.jobs-details-top-card__company-url'
    ],
    location: [
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '.jobs-details-top-card__bullet'
    ],
    description: [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '#job-details',
      '.jobs-description-content__text'
    ]
  };

  return {
    jobTitle: findFirst(selectors.jobTitle),
    company: findFirst(selectors.company),
    location: findFirst(selectors.location),
    description: findFirst(selectors.description),
    platform: 'linkedin-jobs'
  };
}

// --------------------------------------------
// HANDSHAKE SCRAPER
// --------------------------------------------
function scrapeHandshake() {
  const selectors = {
    jobTitle: [
      '[data-hook="job-title"]',
      'h1[class*="style__title"]',
      '.style__jobTitle___',
      'h1[class*="JobTitle"]',
      '.job-details h1',
      '[data-testid="job-title"]',
      'h1'
    ],
    company: [
      '[data-hook="employer-name"]',
      'a[data-hook="employer-link"]',
      '.style__employerName___',
      'a[href*="/employers/"]',
      '[class*="EmployerName"]',
      '[data-testid="employer-name"]'
    ],
    location: [
      '[data-hook="job-location"]',
      '.style__location___',
      '[class*="Location"]',
      '[data-testid="job-location"]'
    ],
    description: [
      '[data-hook="job-description"]',
      '.style__description___',
      '[class*="Description"]',
      '.job-description',
      '[data-testid="job-description"]'
    ]
  };

  return {
    jobTitle: findFirst(selectors.jobTitle),
    company: findFirst(selectors.company),
    location: findFirst(selectors.location),
    description: findFirst(selectors.description),
    platform: 'handshake'
  };
}

// --------------------------------------------
// GREENHOUSE SCRAPER
// --------------------------------------------
function scrapeGreenhouse() {
  // Company often in URL: boards.greenhouse.io/COMPANY/jobs/123
  const pathParts = window.location.pathname.split('/');
  const companyFromUrl = pathParts[1];

  const selectors = {
    jobTitle: [
      '.app-title',
      'h1.heading',
      '.job__title h1',
      'h1'
    ],
    company: [
      '.company-name',
      '[class*="company"]'
    ],
    location: [
      '.location',
      '.body--metadata .location',
      '[class*="location"]'
    ],
    description: [
      '#content',
      '.content',
      '#app_body',
      '[class*="description"]'
    ]
  };

  return {
    jobTitle: findFirst(selectors.jobTitle),
    company: findFirst(selectors.company) || titleCase(companyFromUrl),
    location: findFirst(selectors.location),
    description: findFirst(selectors.description),
    platform: 'greenhouse'
  };
}

// --------------------------------------------
// LEVER SCRAPER
// --------------------------------------------
function scrapeLever() {
  // Company in URL: jobs.lever.co/COMPANY/job-id
  const pathParts = window.location.pathname.split('/');
  const companyFromUrl = pathParts[1];

  const selectors = {
    jobTitle: [
      '.posting-headline h2',
      'h1.posting-title',
      '.posting-header h2',
      'h2'
    ],
    location: [
      '.posting-categories .sort-by-location',
      '.location',
      '[class*="location"]'
    ],
    description: [
      '.posting-page',
      '.section-wrapper',
      '[data-qa="job-description"]'
    ]
  };

  return {
    jobTitle: findFirst(selectors.jobTitle),
    company: titleCase(companyFromUrl),
    location: findFirst(selectors.location),
    description: findFirst(selectors.description),
    platform: 'lever'
  };
}

// --------------------------------------------
// INDEED SCRAPER
// --------------------------------------------
function scrapeIndeed() {
  const selectors = {
    jobTitle: [
      '.jobsearch-JobInfoHeader-title',
      'h1[class*="JobTitle"]',
      '.icl-u-xs-mb--xs',
      'h1[data-testid="jobsearch-JobInfoHeader-title"]'
    ],
    company: [
      '[data-company-name="true"]',
      '.jobsearch-CompanyInfoContainer a',
      '.icl-u-lg-mr--sm',
      '[data-testid="inlineHeader-companyName"]'
    ],
    location: [
      '[data-testid="job-location"]',
      '[data-testid="inlineHeader-companyLocation"]',
      '.jobsearch-JobInfoHeader-subtitle > div:last-child'
    ],
    description: [
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '[data-testid="job-description"]'
    ]
  };

  return {
    jobTitle: findFirst(selectors.jobTitle),
    company: findFirst(selectors.company),
    location: findFirst(selectors.location),
    description: findFirst(selectors.description),
    platform: 'indeed'
  };
}

// --------------------------------------------
// JSON-LD FALLBACK (Works on many sites)
// --------------------------------------------
function tryJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);

      // Handle single JobPosting
      if (data['@type'] === 'JobPosting') {
        return extractFromJobPosting(data);
      }

      // Handle @graph array
      if (data['@graph']) {
        const job = data['@graph'].find(item => item['@type'] === 'JobPosting');
        if (job) return extractFromJobPosting(job);
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

function extractFromJobPosting(job) {
  return {
    jobTitle: job.title,
    company: job.hiringOrganization?.name,
    location: job.jobLocation?.address?.addressLocality ||
              job.jobLocation?.name ||
              (typeof job.jobLocation === 'string' ? job.jobLocation : null),
    description: typeof job.description === 'string' ? job.description : null,
    platform: 'json-ld'
  };
}

// --------------------------------------------
// GENERIC SELECTOR FALLBACK
// --------------------------------------------
function tryGenericSelectors() {
  return {
    jobTitle: findFirst(['h1', '[class*="job-title"]', '[class*="jobtitle"]', '[class*="JobTitle"]']),
    company: findFirst(['[class*="company"]', '[class*="employer"]', '[class*="Company"]', '[class*="Employer"]']),
    location: findFirst(['[class*="location"]', '[class*="Location"]']),
    description: findFirst(['[class*="description"]', '[class*="Description"]', 'article', 'main']),
    platform: 'generic'
  };
}

// --------------------------------------------
// MAIN SCRAPE FUNCTION
// --------------------------------------------
function scrapeJobData() {
  const url = window.location.href;
  let data = null;

  // 1. Try platform-specific scraper
  if (url.includes('linkedin.com/jobs')) {
    data = scrapeLinkedInJobs();
  } else if (url.includes('greenhouse.io')) {
    data = scrapeGreenhouse();
  } else if (url.includes('lever.co')) {
    data = scrapeLever();
  } else if (url.includes('handshake') || url.includes('joinhandshake')) {
    data = scrapeHandshake();
  } else if (url.includes('indeed.com')) {
    data = scrapeIndeed();
  }

  // 2. If platform scraper failed or unknown site, try JSON-LD
  if (!data || !data.company || !data.jobTitle) {
    const jsonLdData = tryJsonLd();
    if (jsonLdData) {
      data = {
        ...data,
        jobTitle: data?.jobTitle || jsonLdData.jobTitle,
        company: data?.company || jsonLdData.company,
        location: data?.location || jsonLdData.location,
        description: data?.description || jsonLdData.description,
        platform: data?.platform || jsonLdData.platform
      };
    }
  }

  // 3. If still missing required fields, try generic selectors
  if (!data || !data.company || !data.jobTitle) {
    const genericData = tryGenericSelectors();
    data = {
      ...data,
      jobTitle: data?.jobTitle || genericData.jobTitle,
      company: data?.company || genericData.company,
      location: data?.location || genericData.location,
      description: data?.description || genericData.description,
      platform: data?.platform || genericData.platform
    };
  }

  // 4. Return result
  return {
    jobTitle: data?.jobTitle || null,
    company: data?.company || null,
    location: data?.location || null,
    description: data?.description || null,
    jobUrl: url,
    platform: data?.platform || 'unknown',
    scrapedSuccessfully: !!(data?.company && data?.jobTitle)
  };
}

// Scrape just the job description (for Cover Letter)
function scrapeJobDescription() {
  // Platform-specific selectors for job descriptions
  const selectors = [
    // LinkedIn
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.jobs-description-content__text',
    '#job-details',
    // Greenhouse
    '#content',
    '.content-intro',
    // Lever
    '.posting-page .content',
    '.section-wrapper',
    // Indeed
    '#jobDescriptionText',
    '.jobsearch-jobDescriptionText',
    // Handshake
    '[data-testid="description"]',
    '.job-description',
    // Generic selectors
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="description-content"]',
    '[id*="description"]',
    'article',
    '.content'
  ];
  
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim().length > 100) {
        console.log('[Offerloop] Found job description using selector:', selector);
        return el.textContent.trim();
      }
    } catch (e) {
      continue;
    }
  }
  
  // Fallback: try to get main content
  const main = document.querySelector('main');
  if (main && main.textContent?.trim().length > 200) {
    return main.textContent.trim();
  }
  
  return null;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle LinkedIn profile URL request
  if (request.action === 'getLinkedInUrl') {
    sendResponse({
      isProfilePage: isLinkedInProfilePage(),
      linkedInUrl: isLinkedInProfilePage() ? getLinkedInProfileUrl() : null
    });
    return true;
  }
  
  // Handle job description scraping (for Cover Letter)
  if (request.action === 'scrapeJobDescription') {
    const description = scrapeJobDescription();
    console.log('[Offerloop] Scraped job description length:', description?.length || 0);
    sendResponse({ description });
    return true;
  }
  
  // Handle job scraping request
  if (request.action === 'scrapeJob') {
    // Add small delay for dynamic content
    setTimeout(() => {
      const jobData = scrapeJobData();
      console.log('[Offerloop] Scraped job data:', jobData);
      sendResponse(jobData);
    }, 500);
    return true; // Keep channel open for async response
  }
  
  return true;
});

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also handle SPA navigation
let lastUrl = location.href;
navigationObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    console.log('[Offerloop] URL changed, re-initializing...');
    setTimeout(init, 500);
  }
});
navigationObserver.observe(document.body, { subtree: true, childList: true });

// Cleanup all observers when the page is being unloaded or the extension context
// is invalidated. This prevents leaked observers from accumulating memory in
// long-lived SPA sessions (e.g., LinkedIn).
function cleanupObservers() {
  if (profileObserver) {
    profileObserver.disconnect();
    profileObserver = null;
  }
  if (navigationObserver) {
    navigationObserver.disconnect();
    navigationObserver = null;
  }
  console.log('[Offerloop] Observers cleaned up');
}

window.addEventListener('beforeunload', cleanupObservers);

// Also handle visibility changes — when the document becomes hidden (e.g., tab
// closed or navigated away in some SPA scenarios), pause observing. Resume when
// the tab becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Disconnect observers to free resources while tab is hidden
    if (profileObserver) {
      profileObserver.disconnect();
      console.log('[Offerloop] Profile observer paused (tab hidden)');
    }
    if (navigationObserver) {
      navigationObserver.disconnect();
      console.log('[Offerloop] Navigation observer paused (tab hidden)');
    }
  } else if (document.visibilityState === 'visible') {
    // Reconnect observers when tab becomes visible again
    if (navigationObserver) {
      navigationObserver.observe(document.body, { subtree: true, childList: true });
      console.log('[Offerloop] Navigation observer resumed (tab visible)');
    }
    if (profileObserver) {
      profileObserver.observe(document.body, { childList: true, subtree: true });
      console.log('[Offerloop] Profile observer resumed (tab visible)');
    }
    // Re-check if we need to inject the button (URL may have changed while hidden)
    if (isLinkedInProfilePage() && !document.getElementById('offerloop-add-btn')) {
      injectButton();
    }
  }
});
