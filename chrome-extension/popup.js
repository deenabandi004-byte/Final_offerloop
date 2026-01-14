// Popup script for Offerloop Chrome Extension with Firebase Auth
console.log('[Offerloop Popup] Loaded');

// Firebase Configuration (same as Offerloop frontend)
const firebaseConfig = {
  apiKey: "AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE",
  authDomain: "offerloop-native.firebaseapp.com",
  projectId: "offerloop-native",
  storageBucket: "offerloop-native.firebasestorage.app",
  messagingSenderId: "184607281467",
  appId: "1:184607281467:web:eab1b0e8be341aa8c5271e"
};

// API Configuration
const API_BASE_URL = 'https://final-offerloop.onrender.com';

// Tab Detection and Switching
function detectMode(url) {
  // Contact mode - LinkedIn profiles only
  if (url && url.match(/linkedin\.com\/in\//)) {
    return 'contact';
  }
  
  // Job mode - job posting URLs
  const jobPatterns = [
    /linkedin\.com\/jobs\//,
    /boards\.greenhouse\.io\//,
    /jobs\.lever\.co\//,
    /\.myworkdayjobs\.com\//,
    /indeed\.com\/(viewjob|jobs)/,
    /handshake\.com\/.*jobs/,
    /joinhandshake\.com\/.*jobs/,
    /app\.joinhandshake\.com\/.*jobs/,
    /glassdoor\.com\/job-listing/,
    /ziprecruiter\.com\/jobs/,
    /wellfound\.com\/jobs/,
    /\/careers\//,
    /\/jobs\//
  ];
  
  if (url) {
    for (const pattern of jobPatterns) {
      if (url.match(pattern)) return 'job';
    }
  }
  
  return 'contact'; // Default to contact
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('hidden', content.id !== `${tabName}-tab`);
  });
  
  // Initialize Job tab when switched to
  if (tabName === 'job') {
    initJobTab();
  }
}

function initTabSwitcher() {
  // Add click handlers for tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// ============================================
// JOB TAB FUNCTIONALITY
// ============================================

let currentJobData = null;

// Initialize Job Tab when switched to
async function initJobTab() {
  console.log('[Offerloop Popup] Initializing Job tab...');
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Update URL display
  const urlTextEl = document.getElementById('job-url-text');
  if (urlTextEl) {
    urlTextEl.textContent = truncateUrl(tab.url);
  }
  
  // Reset UI state
  hideJobResults();
  hideJobError();
  hideJobLoading();
  hideInterviewPrepResults();
  hideInterviewPrepError();
  hideInterviewPrepLoading();
  
  // Request job data from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeJob' });
    console.log('[Offerloop Popup] Scraped job data:', response);
    handleScrapedData(response);
  } catch (error) {
    // Content script not loaded or error - show manual form
    console.log('[Offerloop Popup] Scraping failed:', error);
    currentJobData = { jobUrl: tab.url };
    showManualForm();
  }
}

function handleScrapedData(data) {
  currentJobData = data;
  
  if (data && data.scrapedSuccessfully) {
    // Show scraped info
    const scrapedInfo = document.getElementById('scraped-info');
    const manualForm = document.getElementById('manual-form');
    
    if (scrapedInfo) scrapedInfo.style.display = 'block';
    if (manualForm) manualForm.style.display = 'none';
    
    const titleEl = document.getElementById('scraped-job-title');
    const companyEl = document.getElementById('scraped-company');
    const locationEl = document.getElementById('scraped-location');
    
    if (titleEl) titleEl.textContent = data.jobTitle;
    if (companyEl) companyEl.textContent = data.company;
    
    if (locationEl) {
      if (data.location) {
        locationEl.textContent = data.location;
        locationEl.style.display = 'block';
      } else {
        locationEl.style.display = 'none';
      }
    }
    
    // Enable buttons
    enableJobButtons();
  } else {
    // Show manual form
    showManualForm();
  }
}

function showManualForm() {
  const scrapedInfo = document.getElementById('scraped-info');
  const manualForm = document.getElementById('manual-form');
  
  if (scrapedInfo) scrapedInfo.style.display = 'none';
  if (manualForm) manualForm.style.display = 'block';
  
  // Pre-fill with any partial data we got
  if (currentJobData) {
    const companyInput = document.getElementById('manual-company');
    const titleInput = document.getElementById('manual-job-title');
    const descInput = document.getElementById('manual-description');
    
    if (companyInput && currentJobData.company) {
      companyInput.value = currentJobData.company;
    }
    if (titleInput && currentJobData.jobTitle) {
      titleInput.value = currentJobData.jobTitle;
    }
    if (descInput && currentJobData.description) {
      descInput.value = currentJobData.description;
    }
  }
  
  // Update button state based on form
  updateJobButtonState();
}

function getJobData() {
  // If we have scraped data, use it
  if (currentJobData && currentJobData.scrapedSuccessfully) {
    return currentJobData;
  }
  
  // Otherwise get from manual form
  const companyInput = document.getElementById('manual-company');
  const titleInput = document.getElementById('manual-job-title');
  const descInput = document.getElementById('manual-description');
  
  return {
    company: companyInput?.value.trim() || '',
    jobTitle: titleInput?.value.trim() || '',
    description: descInput?.value.trim() || '',
    jobUrl: currentJobData?.jobUrl || '',
    platform: 'manual'
  };
}

function enableJobButtons() {
  const findBtn = document.getElementById('find-recruiters-btn');
  const coverBtn = document.getElementById('cover-letter-btn');
  const interviewBtn = document.getElementById('interview-prep-btn');
  
  if (findBtn) findBtn.disabled = false;
  if (coverBtn) coverBtn.disabled = false;
  if (interviewBtn) interviewBtn.disabled = false;
}

function updateJobButtonState() {
  const companyInput = document.getElementById('manual-company');
  const titleInput = document.getElementById('manual-job-title');
  
  const company = companyInput?.value.trim() || '';
  const jobTitle = titleInput?.value.trim() || '';
  
  const isValid = company.length > 0 && jobTitle.length > 0;
  
  const findBtn = document.getElementById('find-recruiters-btn');
  const coverBtn = document.getElementById('cover-letter-btn');
  const interviewBtn = document.getElementById('interview-prep-btn');
  
  if (findBtn) findBtn.disabled = !isValid;
  if (coverBtn) coverBtn.disabled = !isValid;
  if (interviewBtn) interviewBtn.disabled = !isValid;
}

function truncateUrl(url) {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.length > 30) {
      path = path.substring(0, 30) + '...';
    }
    return parsed.hostname + path;
  } catch {
    return url ? url.substring(0, 40) + '...' : 'Unknown URL';
  }
}

// ============================================
// FIND & EMAIL RECRUITERS
// ============================================

async function handleFindRecruiters() {
  const btn = document.getElementById('find-recruiters-btn');
  const jobData = getJobData();
  
  // Validate
  if (!jobData.company || !jobData.jobTitle) {
    showJobError('Please enter company and job title');
    return;
  }
  
  // Show loading
  if (btn) {
    btn.classList.add('loading');
    btn.disabled = true;
  }
  hideJobError();
  hideJobResults();
  showJobLoading('Finding recruiters...');
  
  try {
    // Get auth token
    const authData = await chrome.storage.local.get(['authToken', 'userEmail']);
    
    if (!authData.authToken) {
      showJobError('Please sign in to use this feature');
      return;
    }
    
    // Call backend API
    const response = await fetch('https://final-offerloop.onrender.com/api/extension/find-recruiters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify({
        company: jobData.company,
        jobTitle: jobData.jobTitle,
        jobDescription: jobData.description || '',
        jobUrl: jobData.jobUrl
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      showJobResults(result);
      if (result.creditsRemaining !== undefined) {
        updateCredits(result.creditsRemaining);
      }
    } else {
      showJobError(result.error || 'Failed to find recruiters. Please try again.');
    }
  } catch (error) {
    console.error('[Offerloop Popup] Find recruiters error:', error);
    showJobError('Something went wrong. Please try again.');
  } finally {
    hideJobLoading();
    if (btn) {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }
}

function showJobResults(result) {
  const resultsDiv = document.getElementById('job-results');
  const detailsDiv = document.getElementById('job-result-details');
  
  // Update result details
  if (detailsDiv) {
    if (result.recruiters && result.recruiters.length > 0) {
      detailsDiv.textContent = `Found ${result.recruiters.length} recruiter${result.recruiters.length > 1 ? 's' : ''} at ${currentJobData?.company || 'this company'}`;
    } else {
      detailsDiv.textContent = 'Contact saved to your library';
    }
  }
  
  if (resultsDiv) resultsDiv.style.display = 'block';
}

function hideJobResults() {
  const resultsDiv = document.getElementById('job-results');
  if (resultsDiv) resultsDiv.style.display = 'none';
}

function showJobLoading(message) {
  const loadingDiv = document.getElementById('job-loading');
  const loadingText = document.getElementById('job-loading-text');
  
  if (loadingText) loadingText.textContent = message || 'Loading...';
  if (loadingDiv) loadingDiv.style.display = 'flex';
}

function hideJobLoading() {
  const loadingDiv = document.getElementById('job-loading');
  if (loadingDiv) loadingDiv.style.display = 'none';
}

function showJobError(message) {
  const errorDiv = document.getElementById('job-error');
  const errorMsg = document.getElementById('job-error-message');
  
  if (errorMsg) errorMsg.textContent = message;
  if (errorDiv) errorDiv.style.display = 'block';
}

function hideJobError() {
  const errorDiv = document.getElementById('job-error');
  if (errorDiv) errorDiv.style.display = 'none';
}

// ============================================
// GENERATE COVER LETTER
// ============================================

function handleGenerateCoverLetter() {
  const jobData = getJobData();
  
  // Validate
  if (!jobData.company || !jobData.jobTitle) {
    showJobError('Please enter company and job title');
    return;
  }
  
  // Build URL with parameters
  const params = new URLSearchParams({
    company: jobData.company,
    title: jobData.jobTitle
  });
  
  if (jobData.description) {
    params.append('description', jobData.description.substring(0, 2000)); // Limit length
  }
  
  if (jobData.jobUrl) {
    params.append('url', jobData.jobUrl);
  }
  
  const coverLetterUrl = `https://www.offerloop.ai/cover-letter?${params.toString()}`;
  
  // Open in new tab
  chrome.tabs.create({ url: coverLetterUrl });
}

// ============================================
// INTERVIEW PREP WORKFLOW
// ============================================

let interviewPrepPollInterval = null;

async function handleInterviewPrep() {
  const btn = document.getElementById('interview-prep-btn');
  const jobData = getJobData();
  
  // Validate - need at least company and job title
  if (!jobData.company || !jobData.jobTitle) {
    showInterviewPrepError('Please enter company and job title');
    return;
  }
  
  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    showInterviewPrepError('Please sign in to use this feature');
    return;
  }
  
  // Show loading state
  btn.classList.add('loading');
  btn.disabled = true;
  hideInterviewPrepResults();
  hideInterviewPrepError();
  showInterviewPrepLoading('Starting Interview Prep...');
  
  try {
    // Build request body
    // If we have a job URL from a supported platform, use URL mode
    // Otherwise use manual mode with company + job title
    let requestBody = {};
    
    const supportedJobUrlPatterns = [
      /linkedin\.com\/jobs/,
      /indeed\.com/,
      /greenhouse\.io/,
      /lever\.co/,
      /myworkdayjobs\.com/
    ];
    
    const hasJobUrl = jobData.jobUrl && supportedJobUrlPatterns.some(p => p.test(jobData.jobUrl));
    
    if (hasJobUrl) {
      requestBody = { job_posting_url: jobData.jobUrl };
    } else {
      requestBody = {
        company_name: jobData.company,
        job_title: jobData.jobTitle
      };
    }
    
    console.log('[Offerloop Popup] Starting Interview Prep with:', requestBody);
    
    // Step 1: Start the prep
    const startResponse = await fetch(`${API_BASE_URL}/api/interview-prep/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to start Interview Prep');
    }
    
    const responseData = await startResponse.json();
    const prepId = responseData.id;
    
    console.log('[Offerloop Popup] Interview Prep started with ID:', prepId);
    
    if (!prepId) {
      throw new Error('No prep ID returned from server');
    }
    
    // Step 2: Poll for completion
    pollInterviewPrepStatus(prepId, authData.authToken, btn, jobData);
    
  } catch (error) {
    console.error('[Offerloop Popup] Interview Prep error:', error);
    showInterviewPrepError(error.message || 'Something went wrong. Please try again.');
    hideInterviewPrepLoading();
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function pollInterviewPrepStatus(prepId, authToken, btn, jobData) {
  let attempts = 0;
  const maxAttempts = 90; // 3 minutes max (90 * 2 seconds) - Interview Prep may take longer due to Reddit scraping
  
  // Clear any existing poll
  if (interviewPrepPollInterval) {
    clearInterval(interviewPrepPollInterval);
  }
  
  const statusMessages = {
    'processing': 'Initializing...',
    'parsing_job_posting': 'Parsing job posting...',
    'extracting_requirements': 'Extracting requirements...',
    'scraping_reddit': 'Scraping Reddit for insights...',
    'processing_content': 'Processing interview insights...',
    'generating_pdf': 'Generating PDF...',
    'completed': 'Interview Prep ready!',
    'failed': 'Generation failed'
  };
  
  interviewPrepPollInterval = setInterval(async () => {
    attempts++;
    
    if (attempts > maxAttempts) {
      clearInterval(interviewPrepPollInterval);
      interviewPrepPollInterval = null;
      hideInterviewPrepLoading();
      showInterviewPrepError('Prep is taking longer than expected. Check the Interview Library for results.');
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }
    
    try {
      const statusResponse = await fetch(`${API_BASE_URL}/api/interview-prep/status/${prepId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!statusResponse.ok) {
        throw new Error('Failed to check status');
      }
      
      const statusData = await statusResponse.json();
      console.log('[Offerloop Popup] Interview Prep poll status:', statusData.status);
      
      // Update loading message based on status
      const loadingMessage = statusMessages[statusData.status] || statusData.progress || 'Processing...';
      updateInterviewPrepLoadingText(loadingMessage);
      
      if (statusData.status === 'completed' && statusData.pdfUrl) {
        // Success!
        clearInterval(interviewPrepPollInterval);
        interviewPrepPollInterval = null;
        
        hideInterviewPrepLoading();
        showInterviewPrepResults(statusData, jobData);
        triggerInterviewPrepPdfDownload(statusData.pdfUrl, jobData.company, jobData.jobTitle);
        
        btn.classList.remove('loading');
        btn.disabled = false;
        
        // Refresh credits
        try {
          const creditsResponse = await chrome.runtime.sendMessage({
            action: 'getCredits',
            authToken: authToken,
          });
          if (creditsResponse.credits !== undefined) {
            updateCredits(creditsResponse.credits);
          }
        } catch (e) {
          console.log('[Offerloop Popup] Could not refresh credits:', e);
        }
        
      } else if (statusData.status === 'failed') {
        // Failed
        clearInterval(interviewPrepPollInterval);
        interviewPrepPollInterval = null;
        
        hideInterviewPrepLoading();
        showInterviewPrepError(statusData.error || 'Interview Prep failed. Please try again.');
        
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      // If still "processing", "scraping_reddit", or "generating_pdf", continue polling
      
    } catch (error) {
      console.error('[Offerloop Popup] Interview Prep polling error:', error);
      // Don't stop polling on transient errors, just log
    }
  }, 2000); // Poll every 2 seconds
}

function showInterviewPrepLoading(message) {
  const loadingDiv = document.getElementById('interview-prep-loading');
  const loadingText = document.getElementById('interview-prep-loading-text');
  
  if (loadingText) loadingText.textContent = message || 'Generating Interview Prep...';
  if (loadingDiv) loadingDiv.style.display = 'flex';
}

function hideInterviewPrepLoading() {
  const loadingDiv = document.getElementById('interview-prep-loading');
  if (loadingDiv) loadingDiv.style.display = 'none';
}

function updateInterviewPrepLoadingText(message) {
  const loadingText = document.getElementById('interview-prep-loading-text');
  if (loadingText) loadingText.textContent = message;
}

function showInterviewPrepResults(data, jobData) {
  const resultsDiv = document.getElementById('interview-prep-results');
  const detailsDiv = document.getElementById('interview-prep-details');
  const downloadLink = document.getElementById('interview-prep-download-link');
  
  // Show job details
  const company = data.jobDetails?.company_name || jobData?.company || 'Company';
  const title = data.jobDetails?.job_title || jobData?.jobTitle || 'Position';
  detailsDiv.textContent = `${title} at ${company}`;
  detailsDiv.style.display = 'block';
  
  // Set download link
  if (data.pdfUrl && downloadLink) {
    downloadLink.href = data.pdfUrl;
  }
  
  if (resultsDiv) resultsDiv.style.display = 'block';
}

function hideInterviewPrepResults() {
  const resultsDiv = document.getElementById('interview-prep-results');
  if (resultsDiv) resultsDiv.style.display = 'none';
}

function showInterviewPrepError(message) {
  const errorDiv = document.getElementById('interview-prep-error');
  const errorMsg = document.getElementById('interview-prep-error-message');
  
  if (errorMsg) errorMsg.textContent = message;
  if (errorDiv) errorDiv.style.display = 'block';
}

function hideInterviewPrepError() {
  const errorDiv = document.getElementById('interview-prep-error');
  if (errorDiv) errorDiv.style.display = 'none';
}

function triggerInterviewPrepPdfDownload(pdfUrl, company, jobTitle) {
  // Create a sanitized filename
  const sanitizedCompany = (company || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const sanitizedTitle = (jobTitle || 'role')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const filename = `interview-prep-${sanitizedCompany}-${sanitizedTitle}.pdf`;
  
  // Use Chrome downloads API
  chrome.downloads.download({
    url: pdfUrl,
    filename: filename,
    saveAs: false // Auto-save to downloads folder
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Offerloop Popup] Interview Prep download error:', chrome.runtime.lastError);
      // Fallback: open PDF in new tab
      chrome.tabs.create({ url: pdfUrl });
    } else {
      console.log('[Offerloop Popup] Interview Prep PDF download started, ID:', downloadId);
    }
  });
}

// ============================================
// JOB TAB EVENT LISTENERS
// ============================================

function initJobTabListeners() {
  // Find & Email Recruiters button
  const findBtn = document.getElementById('find-recruiters-btn');
  if (findBtn) {
    findBtn.addEventListener('click', handleFindRecruiters);
  }
  
  // Generate Cover Letter button
  const coverBtn = document.getElementById('cover-letter-btn');
  if (coverBtn) {
    coverBtn.addEventListener('click', handleGenerateCoverLetter);
  }
  
  // Interview Prep button
  const interviewBtn = document.getElementById('interview-prep-btn');
  if (interviewBtn) {
    interviewBtn.addEventListener('click', handleInterviewPrep);
  }
  
  // Manual form input listeners
  const companyInput = document.getElementById('manual-company');
  const titleInput = document.getElementById('manual-job-title');
  
  if (companyInput) {
    companyInput.addEventListener('input', updateJobButtonState);
  }
  if (titleInput) {
    titleInput.addEventListener('input', updateJobButtonState);
  }
}

// Initialize Firebase
let firebaseApp = null;
let firebaseAuth = null;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.error('[Offerloop Popup] Firebase SDK not loaded');
    return false;
  }
  
  try {
    // Check if Firebase is already initialized
    if (firebase.apps.length === 0) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
      console.log('[Offerloop Popup] Firebase initialized');
    } else {
      firebaseApp = firebase.apps[0];
      console.log('[Offerloop Popup] Using existing Firebase app');
    }
    
    firebaseAuth = firebase.auth();
    return true;
  } catch (error) {
    console.error('[Offerloop Popup] Firebase init error:', error);
    return false;
  }
}

// DOM Elements
const elements = {
  loginSection: null,
  noProfileSection: null,
  profileSection: null,
  loginBtn: null,
  signOutBtn: null,
  findEmailBtn: null,
  retryBtn: null,
  profileUrl: null,
  resultsSection: null,
  loadingSection: null,
  errorSection: null,
  loadingText: null,
  errorText: null,
  resultName: null,
  resultEmail: null,
  resultStatus: null,
  successLinksSection: null,
  openDraftLink: null,
  creditsCount: null,
};

// State
let currentState = {
  isLoggedIn: false,
  authToken: null,
  linkedInUrl: null,
  isProfilePage: false,
  credits: null,
  user: null,
};

// Initialize DOM elements
function initElements() {
  elements.loginSection = document.getElementById('loginSection');
  elements.noProfileSection = document.getElementById('noProfileSection');
  elements.profileSection = document.getElementById('profileSection');
  elements.loginBtn = document.getElementById('loginBtn');
  elements.signOutBtn = document.getElementById('signOutBtn');
  elements.findEmailBtn = document.getElementById('findEmailBtn');
  elements.retryBtn = document.getElementById('retryBtn');
  elements.profileUrl = document.getElementById('profileUrl');
  elements.resultsSection = document.getElementById('resultsSection');
  elements.loadingSection = document.getElementById('loadingSection');
  elements.errorSection = document.getElementById('errorSection');
  elements.loadingText = document.getElementById('loadingText');
  elements.errorText = document.getElementById('errorText');
  elements.resultName = document.getElementById('resultName');
  elements.resultEmail = document.getElementById('resultEmail');
  elements.resultStatus = document.getElementById('resultStatus');
  elements.successLinksSection = document.getElementById('successLinksSection');
  elements.openDraftLink = document.getElementById('openDraftLink');
  elements.creditsCount = document.getElementById('creditsCount');
}

// ============================================
// COFFEE CHAT PREP WORKFLOW
// ============================================

let coffeeChatPollInterval = null;

// Coffee Chat Prep handler - Full workflow
async function handleCoffeeChatPrep() {
  const btn = document.getElementById('coffeeChatBtn');
  
  // Get current LinkedIn URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const linkedinUrl = tab?.url;
  
  // Validate we're on a LinkedIn profile
  if (!linkedinUrl || !linkedinUrl.match(/linkedin\.com\/in\//)) {
    showCoffeeChatError('Please navigate to a LinkedIn profile first');
    return;
  }
  
  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    showCoffeeChatError('Please sign in to use this feature');
    return;
  }
  
  // Show loading state
  btn.classList.add('loading');
  btn.disabled = true;
  hideCoffeeChatResults();
  hideCoffeeChatError();
  showCoffeeChatLoading('Starting Coffee Chat Prep...');
  
  try {
    // Step 1: Start the prep
    console.log('[Offerloop Popup] Starting Coffee Chat Prep for:', linkedinUrl);
    
    const startResponse = await fetch(`${API_BASE_URL}/api/coffee-chat-prep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify({ linkedinUrl })
    });
    
    if (!startResponse.ok) {
      const errorData = await startResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to start Coffee Chat Prep');
    }
    
    const responseData = await startResponse.json();
    const prepId = responseData.prepId || responseData.id;
    
    console.log('[Offerloop Popup] Prep started with ID:', prepId);
    
    if (!prepId) {
      throw new Error('No prep ID returned from server');
    }
    
    // Step 2: Poll for completion
    pollCoffeeChatStatus(prepId, authData.authToken, btn);
    
  } catch (error) {
    console.error('[Offerloop Popup] Coffee Chat Prep error:', error);
    showCoffeeChatError(error.message || 'Something went wrong. Please try again.');
    hideCoffeeChatLoading();
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function pollCoffeeChatStatus(prepId, authToken, btn) {
  let attempts = 0;
  const maxAttempts = 90; // 3 minutes max (90 * 2 seconds)
  
  // Clear any existing poll
  if (coffeeChatPollInterval) {
    clearInterval(coffeeChatPollInterval);
  }
  
  const statusMessages = {
    'processing': 'Initializing...',
    'enriching_profile': 'Enriching profile data...',
    'fetching_news': 'Fetching recent news...',
    'building_context': 'Building user context...',
    'extracting_hometown': 'Extracting location...',
    'generating_content': 'Generating content...',
    'generating_pdf': 'Generating PDF...',
    'completed': 'Coffee Chat Prep ready!',
    'failed': 'Generation failed'
  };
  
  coffeeChatPollInterval = setInterval(async () => {
    attempts++;
    
    if (attempts > maxAttempts) {
      clearInterval(coffeeChatPollInterval);
      coffeeChatPollInterval = null;
      hideCoffeeChatLoading();
      showCoffeeChatError('Prep is taking longer than expected. Check the Coffee Chat Library for results.');
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }
    
    try {
      const statusResponse = await fetch(`${API_BASE_URL}/api/coffee-chat-prep/${prepId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!statusResponse.ok) {
        throw new Error('Failed to check status');
      }
      
      const statusData = await statusResponse.json();
      console.log('[Offerloop Popup] Poll status:', statusData.status);
      
      // Update loading message based on status
      const loadingMessage = statusMessages[statusData.status] || 'Processing...';
      updateCoffeeChatLoadingText(loadingMessage);
      
      if (statusData.status === 'completed' && statusData.pdfUrl) {
        // Success!
        clearInterval(coffeeChatPollInterval);
        coffeeChatPollInterval = null;
        
        hideCoffeeChatLoading();
        showCoffeeChatResults(statusData);
        triggerPdfDownload(statusData.pdfUrl, statusData.contactData);
        
        btn.classList.remove('loading');
        btn.disabled = false;
        
        // Refresh credits
        try {
          const creditsResponse = await chrome.runtime.sendMessage({
            action: 'getCredits',
            authToken: authToken,
          });
          if (creditsResponse.credits !== undefined) {
            updateCredits(creditsResponse.credits);
          }
        } catch (e) {
          console.log('[Offerloop Popup] Could not refresh credits:', e);
        }
        
      } else if (statusData.status === 'failed') {
        // Failed
        clearInterval(coffeeChatPollInterval);
        coffeeChatPollInterval = null;
        
        hideCoffeeChatLoading();
        showCoffeeChatError(statusData.error || 'Coffee Chat Prep failed. Please try again.');
        
        btn.classList.remove('loading');
        btn.disabled = false;
      }
      // If still processing, continue polling
      
    } catch (error) {
      console.error('[Offerloop Popup] Polling error:', error);
      // Don't stop polling on transient errors, just log
    }
  }, 2000); // Poll every 2 seconds
}

function showCoffeeChatLoading(message) {
  const loadingDiv = document.getElementById('coffeeChatLoading');
  const loadingText = document.getElementById('coffeeChatLoadingText');
  
  if (loadingText) loadingText.textContent = message || 'Generating Coffee Chat Prep...';
  if (loadingDiv) loadingDiv.classList.remove('hidden');
}

function hideCoffeeChatLoading() {
  const loadingDiv = document.getElementById('coffeeChatLoading');
  if (loadingDiv) loadingDiv.classList.add('hidden');
}

function updateCoffeeChatLoadingText(message) {
  const loadingText = document.getElementById('coffeeChatLoadingText');
  if (loadingText) loadingText.textContent = message;
}

function showCoffeeChatResults(data) {
  const resultsDiv = document.getElementById('coffeeChatResults');
  const contactDiv = document.getElementById('coffeeChatContact');
  const downloadLink = document.getElementById('coffeeChatDownloadLink');
  
  // Show contact name if available
  if (data.contactData) {
    const firstName = data.contactData.firstName || '';
    const lastName = data.contactData.lastName || '';
    const fullName = data.contactData.name || `${firstName} ${lastName}`.trim();
    const company = data.contactData.company || '';
    
    if (fullName) {
      const displayText = company ? `${fullName} at ${company}` : fullName;
      contactDiv.textContent = displayText;
      contactDiv.style.display = 'block';
    } else {
      contactDiv.style.display = 'none';
    }
  } else {
    contactDiv.style.display = 'none';
  }
  
  // Set download link
  if (data.pdfUrl && downloadLink) {
    downloadLink.href = data.pdfUrl;
  }
  
  if (resultsDiv) resultsDiv.style.display = 'block';
}

function hideCoffeeChatResults() {
  const resultsDiv = document.getElementById('coffeeChatResults');
  if (resultsDiv) resultsDiv.style.display = 'none';
}

function showCoffeeChatError(message) {
  const errorDiv = document.getElementById('coffeeChatError');
  const errorMsg = document.getElementById('coffeeChatErrorMessage');
  
  if (errorMsg) errorMsg.textContent = message;
  if (errorDiv) errorDiv.style.display = 'block';
}

function hideCoffeeChatError() {
  const errorDiv = document.getElementById('coffeeChatError');
  if (errorDiv) errorDiv.style.display = 'none';
}

function triggerPdfDownload(pdfUrl, contactData) {
  // Create a sanitized filename
  let contactName = 'contact';
  if (contactData) {
    const firstName = contactData.firstName || '';
    const lastName = contactData.lastName || '';
    contactName = contactData.name || `${firstName} ${lastName}`.trim() || 'contact';
  }
  
  const sanitizedName = contactName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const filename = `coffee-chat-prep-${sanitizedName}.pdf`;
  
  // Use Chrome downloads API
  chrome.downloads.download({
    url: pdfUrl,
    filename: filename,
    saveAs: false // Auto-save to downloads folder
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Offerloop Popup] Download error:', chrome.runtime.lastError);
      // Fallback: open PDF in new tab
      chrome.tabs.create({ url: pdfUrl });
    } else {
      console.log('[Offerloop Popup] PDF download started, ID:', downloadId);
    }
  });
}

// Clean up polling if popup closes
window.addEventListener('unload', () => {
  if (coffeeChatPollInterval) {
    clearInterval(coffeeChatPollInterval);
    coffeeChatPollInterval = null;
  }
  if (interviewPrepPollInterval) {
    clearInterval(interviewPrepPollInterval);
    interviewPrepPollInterval = null;
  }
});

// Event Listeners
function initEventListeners() {
  elements.loginBtn?.addEventListener('click', handleLogin);
  elements.signOutBtn?.addEventListener('click', handleSignOut);
  elements.findEmailBtn?.addEventListener('click', handleFindEmail);
  elements.retryBtn?.addEventListener('click', handleFindEmail);
  
  // Coffee Chat Prep button
  document.getElementById('coffeeChatBtn')?.addEventListener('click', handleCoffeeChatPrep);
}

// Show a specific section, hide others
function showSection(sectionName) {
  elements.loginSection?.classList.add('hidden');
  elements.noProfileSection?.classList.add('hidden');
  elements.profileSection?.classList.add('hidden');
  
  switch (sectionName) {
    case 'login':
      elements.loginSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.add('hidden');
      break;
    case 'noProfile':
      elements.noProfileSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.remove('hidden');
      break;
    case 'profile':
      elements.profileSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.remove('hidden');
      break;
  }
}

// Show loading state
function showLoading(text = 'Finding email...') {
  elements.loadingSection?.classList.remove('hidden');
  elements.resultsSection?.classList.add('hidden');
  elements.errorSection?.classList.add('hidden');
  if (elements.findEmailBtn) elements.findEmailBtn.disabled = true;
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

// Hide loading state
function hideLoading() {
  elements.loadingSection?.classList.add('hidden');
  if (elements.findEmailBtn) elements.findEmailBtn.disabled = false;
}

// Show error
function showError(message) {
  hideLoading();
  elements.errorSection?.classList.remove('hidden');
  elements.resultsSection?.classList.add('hidden');
  if (elements.errorText) {
    elements.errorText.textContent = message;
  }
}

// Show results
function showResults(contact) {
  hideLoading();
  elements.errorSection?.classList.add('hidden');
  elements.resultsSection?.classList.remove('hidden');
  
  // Parse name
  const fullName = contact.full_name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  elements.resultName.textContent = fullName;
  
  // Email
  const email = contact.email || 'Not found';
  elements.resultEmail.textContent = email;
  
  // Status badge
  if (contact.email) {
    elements.resultStatus.textContent = 'Found';
    elements.resultStatus.classList.remove('no-email');
  } else {
    elements.resultStatus.textContent = 'No Email';
    elements.resultStatus.classList.add('no-email');
  }
  
  // Show success links section
  elements.successLinksSection?.classList.remove('hidden');
}

// Update credits display
function updateCredits(credits) {
  if (elements.creditsCount && credits !== null && credits !== undefined) {
    elements.creditsCount.textContent = credits;
  }
}

// Handle login with Chrome Identity API + Firebase
async function handleLogin() {
  console.log('[Offerloop Popup] Login clicked');
  
  try {
    // Use Chrome Identity API to get Google auth token
    const authToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
    
    console.log('[Offerloop Popup] Got Google auth token');
    
    // Exchange Google token for Firebase credential
    const credential = firebase.auth.GoogleAuthProvider.credential(null, authToken);
    const result = await firebaseAuth.signInWithCredential(credential);
    
    console.log('[Offerloop Popup] Sign-in successful:', result.user.email);
    
    // Get Firebase ID token
    const firebaseToken = await result.user.getIdToken();
    
    // Save to Chrome storage
    await chrome.storage.local.set({
      authToken: firebaseToken,
      isLoggedIn: true,
      userEmail: result.user.email,
      userName: result.user.displayName,
      userPhoto: result.user.photoURL,
    });
    
    currentState.authToken = firebaseToken;
    currentState.isLoggedIn = true;
    currentState.user = result.user;
    
    await checkAndShowContent();
    
  } catch (error) {
    console.error('[Offerloop Popup] Login error:', error);
    showError(error.message || 'Sign-in failed. Please try again.');
  }
}

// Handle sign out
async function handleSignOut() {
  console.log('[Offerloop Popup] Sign out clicked');
  
  try {
    // Sign out from Firebase
    if (firebaseAuth) {
      await firebaseAuth.signOut();
    }
    
    // Revoke Chrome identity token
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log('[Offerloop Popup] Chrome auth token revoked');
        });
      }
    });
    
    // Clear Chrome storage
    await chrome.storage.local.set({
      authToken: null,
      isLoggedIn: false,
      userEmail: null,
      userName: null,
      userPhoto: null,
      credits: null,
    });
    
    // Reset state
    currentState.authToken = null;
    currentState.isLoggedIn = false;
    currentState.user = null;
    currentState.credits = null;
    
    // Show login section
    showSection('login');
    updateCredits('--');
    
  } catch (error) {
    console.error('[Offerloop Popup] Sign out error:', error);
  }
}

// Handle Find Email button click
async function handleFindEmail() {
  if (!currentState.linkedInUrl) {
    showError('No LinkedIn URL detected. Please navigate to a profile page.');
    return;
  }
  
  if (!currentState.authToken) {
    showError('Please sign in to Offerloop first.');
    return;
  }
  
  showLoading('Finding email and generating draft...');
  
  try {
    // Call backend via background script
    const response = await chrome.runtime.sendMessage({
      action: 'importLinkedIn',
      linkedInUrl: currentState.linkedInUrl,
      authToken: currentState.authToken,
    });
    
    console.log('[Offerloop Popup] API Response:', response);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Update credits
    if (response.credits_remaining !== undefined) {
      updateCredits(response.credits_remaining);
      currentState.credits = response.credits_remaining;
      chrome.storage.local.set({ credits: response.credits_remaining });
    }
    
    // Show results
    const contact = response.contact || response;
    showResults({
      full_name: contact.full_name,
      email: contact.email,
      company: contact.company,
      jobTitle: contact.jobTitle || contact.title,
      draft_url: response.draft_url || contact.draft_url,
      gmailDraftUrl: response.gmailDraftUrl,
    });
    
  } catch (error) {
    console.error('[Offerloop Popup] Error:', error);
    showError(error.message || 'Failed to find email. Please try again.');
  }
}

// Get current tab info
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (error) {
    console.error('[Offerloop Popup] Error getting current tab:', error);
    return null;
  }
}

// Check if on LinkedIn profile
async function checkLinkedInProfile() {
  const tab = await getCurrentTab();
  
  if (!tab?.url) {
    return { isProfilePage: false, linkedInUrl: null };
  }
  
  const url = tab.url;
  const isProfilePage = url.includes('linkedin.com/in/');
  
  if (isProfilePage) {
    // Clean the URL
    const match = url.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+/);
    const linkedInUrl = match ? match[0] : url.split('?')[0].split('#')[0];
    return { isProfilePage: true, linkedInUrl };
  }
  
  return { isProfilePage: false, linkedInUrl: null };
}

// Check auth state and show appropriate content
async function checkAndShowContent() {
  // Check if on LinkedIn profile
  const { isProfilePage, linkedInUrl } = await checkLinkedInProfile();
  currentState.isProfilePage = isProfilePage;
  currentState.linkedInUrl = linkedInUrl;
  
  if (!isProfilePage) {
    console.log('[Offerloop Popup] Not on LinkedIn profile');
    showSection('noProfile');
    return;
  }
  
  console.log('[Offerloop Popup] On LinkedIn profile:', linkedInUrl);
  showSection('profile');
  
  // Update UI with LinkedIn URL
  if (elements.profileUrl && linkedInUrl) {
    const displayUrl = linkedInUrl.replace('https://www.linkedin.com', 'linkedin.com').replace('https://linkedin.com', 'linkedin.com');
    elements.profileUrl.textContent = displayUrl;
  }
  
  // Fetch credits from backend
  if (currentState.authToken) {
    try {
      const creditsResponse = await chrome.runtime.sendMessage({
        action: 'getCredits',
        authToken: currentState.authToken,
      });
      
      if (creditsResponse.credits !== undefined) {
        updateCredits(creditsResponse.credits);
        currentState.credits = creditsResponse.credits;
        chrome.storage.local.set({ credits: creditsResponse.credits });
      }
    } catch (error) {
      console.error('[Offerloop Popup] Error fetching credits:', error);
    }
  }
}

// Load auth state from storage and Firebase
async function loadAuthState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'isLoggedIn', 'credits'], (result) => {
      currentState.authToken = result.authToken || null;
      currentState.isLoggedIn = result.isLoggedIn || false;
      currentState.credits = result.credits || null;
      resolve(result);
    });
  });
}

// Set up Firebase auth state listener
function setupAuthListener() {
  if (!firebaseAuth) return;
  
  firebaseAuth.onAuthStateChanged(async (user) => {
    console.log('[Offerloop Popup] Auth state changed:', user ? user.email : 'signed out');
    
    if (user) {
      // User is signed in
      try {
        const token = await user.getIdToken(true); // Force refresh
        
        // Save to storage
        await chrome.storage.local.set({
          authToken: token,
          isLoggedIn: true,
          userEmail: user.email,
          userName: user.displayName,
          userPhoto: user.photoURL,
        });
        
        currentState.authToken = token;
        currentState.isLoggedIn = true;
        currentState.user = user;
        
        // Update credits display
        if (currentState.credits !== null) {
          updateCredits(currentState.credits);
        }
        
        // Show appropriate content
        await checkAndShowContent();
        
      } catch (error) {
        console.error('[Offerloop Popup] Error getting token:', error);
      }
    } else {
      // User is signed out
      currentState.authToken = null;
      currentState.isLoggedIn = false;
      currentState.user = null;
      
      showSection('login');
    }
  });
}

// Initialize popup
async function init() {
  console.log('[Offerloop Popup] Initializing...');
  
  initElements();
  initEventListeners();
  initTabSwitcher();
  initJobTabListeners();
  
  // Get current tab URL and detect mode
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const mode = detectMode(tab.url);
      switchTab(mode);
      console.log('[Offerloop Popup] Detected mode:', mode, 'for URL:', tab.url);
    }
  } catch (error) {
    console.error('[Offerloop Popup] Error detecting mode:', error);
  }
  
  // Initialize Firebase
  if (!initFirebase()) {
    showError('Failed to initialize Firebase. Please reload.');
    return;
  }
  
  // Set up auth state listener
  setupAuthListener();
  
  // Load stored auth state
  await loadAuthState();
  
  // Update credits display
  if (currentState.credits !== null) {
    updateCredits(currentState.credits);
  }
  
  // Check if already logged in via Firebase
  const currentUser = firebaseAuth?.currentUser;
  
  if (currentUser) {
    console.log('[Offerloop Popup] Already signed in:', currentUser.email);
    
    // Get fresh token
    try {
      const token = await currentUser.getIdToken(true);
      currentState.authToken = token;
      currentState.isLoggedIn = true;
      currentState.user = currentUser;
      
      // Save to storage
      await chrome.storage.local.set({
        authToken: token,
        isLoggedIn: true,
      });
      
      await checkAndShowContent();
    } catch (error) {
      console.error('[Offerloop Popup] Error refreshing token:', error);
      showSection('login');
    }
  } else if (currentState.isLoggedIn && currentState.authToken) {
    // Have stored token but no Firebase user - might be stale
    console.log('[Offerloop Popup] Have stored token, checking validity...');
    await checkAndShowContent();
  } else {
    console.log('[Offerloop Popup] Not logged in');
    showSection('login');
  }
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);
