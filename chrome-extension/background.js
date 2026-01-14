// Background service worker for Offerloop Chrome Extension
console.log('[Offerloop Background] Service worker started');

// Configuration
const API_BASE_URL = 'https://final-offerloop.onrender.com';

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Offerloop Background] Extension installed');
    // Initialize storage
    chrome.storage.local.set({
      isLoggedIn: false,
      authToken: null,
      credits: null,
    });
  }
  
  // Create context menu
  chrome.contextMenus.create({
    id: 'offerloop-add',
    title: 'Add to Offerloop',
    contexts: ['link'],
    targetUrlPatterns: ['*://www.linkedin.com/in/*', '*://linkedin.com/in/*'],
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Offerloop Background] Received message:', request.action);
  
  switch (request.action) {
    case 'addToOfferloop':
      handleAddToOfferloop(request, sendResponse);
      return true; // Keep channel open for async response
      
    case 'importLinkedIn':
      handleImportLinkedIn(request, sendResponse);
      return true;
      
    case 'getCredits':
      handleGetCredits(request, sendResponse);
      return true;
      
    case 'setAuthToken':
      handleSetAuthToken(request, sendResponse);
      return true;
      
    case 'getStatus':
      handleGetStatus(sendResponse);
      return true;
      
    default:
      console.log('[Offerloop Background] Unknown action:', request.action);
      sendResponse({ error: 'Unknown action' });
  }
  
  return true;
});

// Handle add to Offerloop from content script
async function handleAddToOfferloop(request, sendResponse) {
  const { linkedInUrl } = request;
  
  try {
    // Get auth token from storage
    const { authToken, isLoggedIn } = await chrome.storage.local.get(['authToken', 'isLoggedIn']);
    
    if (!isLoggedIn || !authToken) {
      sendResponse({
        success: false,
        error: 'Please sign in to Offerloop first. Click the extension icon to sign in.',
      });
      return;
    }
    
    // Call the LinkedIn import API
    const result = await importLinkedInContact(linkedInUrl, authToken);
    
    if (result.error) {
      sendResponse({
        success: false,
        error: result.error,
      });
    } else {
      sendResponse({
        success: true,
        message: result.message || 'Contact added successfully!',
        contact: result.contact,
        credits_remaining: result.credits_remaining,
      });
    }
  } catch (error) {
    console.error('[Offerloop Background] Error in handleAddToOfferloop:', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to add contact',
    });
  }
}

// Handle import LinkedIn from popup
async function handleImportLinkedIn(request, sendResponse) {
  const { linkedInUrl, authToken } = request;
  
  try {
    if (!authToken) {
      sendResponse({ error: 'Not authenticated' });
      return;
    }
    
    const result = await importLinkedInContact(linkedInUrl, authToken);
    sendResponse(result);
  } catch (error) {
    console.error('[Offerloop Background] Error in handleImportLinkedIn:', error);
    sendResponse({ error: error.message || 'Failed to import contact' });
  }
}

// Import LinkedIn contact via API
async function importLinkedInContact(linkedInUrl, authToken) {
  console.log('[Offerloop Background] Importing LinkedIn contact:', linkedInUrl);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/contacts/import-linkedin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        linkedin_url: linkedInUrl,
      }),
    });
    
    const data = await response.json();
    console.log('[Offerloop Background] API Response:', data);
    
    if (!response.ok) {
      throw new Error(data.message || data.error || `API error: ${response.status}`);
    }
    
    return {
      success: true,
      contact: data.contact,
      message: data.message,
      credits_remaining: data.credits_remaining,
      draft_created: data.draft_created,
      email_found: data.email_found,
    };
  } catch (error) {
    console.error('[Offerloop Background] API Error:', error);
    throw error;
  }
}

// Handle get credits
async function handleGetCredits(request, sendResponse) {
  const { authToken } = request;
  
  try {
    if (!authToken) {
      sendResponse({ error: 'Not authenticated' });
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/check-credits`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      sendResponse({ error: data.message || 'Failed to get credits' });
      return;
    }
    
    sendResponse({
      credits: data.credits,
      maxCredits: data.max_credits,
      tier: data.tier,
    });
  } catch (error) {
    console.error('[Offerloop Background] Error getting credits:', error);
    sendResponse({ error: error.message });
  }
}

// Handle set auth token (can be called from popup after Firebase auth)
async function handleSetAuthToken(request, sendResponse) {
  const { authToken } = request;
  
  try {
    await chrome.storage.local.set({
      authToken: authToken,
      isLoggedIn: !!authToken,
    });
    
    console.log('[Offerloop Background] Auth token updated');
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Offerloop Background] Error setting auth token:', error);
    sendResponse({ error: error.message });
  }
}

// Handle get status
async function handleGetStatus(sendResponse) {
  try {
    const { authToken, isLoggedIn, credits } = await chrome.storage.local.get(['authToken', 'isLoggedIn', 'credits']);
    
    sendResponse({
      isLoggedIn: isLoggedIn || false,
      hasToken: !!authToken,
      credits: credits,
    });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'offerloop-add' && info.linkUrl) {
    // Send message to handle the import
    handleAddToOfferloop({ linkedInUrl: info.linkUrl }, (response) => {
      // Show notification with result
      const message = response.success 
        ? response.message || 'Contact added to Offerloop!'
        : response.error || 'Failed to add contact';
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Offerloop',
        message: message,
      });
    });
  }
});
