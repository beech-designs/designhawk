// DesignHawk Chrome Extension - Background Service Worker
console.log('🦅 DesignHawk background service worker loaded');

class BackgroundService {
  constructor() {
    this.apiEndpoint = 'https://designhawk-api.herokuapp.com/api';
    this.init();
  }

  init() {
    // Listen for extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    
    // Listen for messages from content script and popup
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    
    // Set up context menu
    this.setupContextMenu();
  }

  handleInstall(details) {
    console.log('DesignHawk installed:', details.reason);
    
    if (details.reason === 'install') {
      // Show welcome page or setup
      chrome.tabs.create({
        url: 'https://designhawk.com/welcome'
      });
    }
    
    // Initialize storage with default values
    chrome.storage.local.set({
      settings: {
        autoAnalyze: false,
        highlightOnLoad: false,
        apiEndpoint: this.apiEndpoint
      },
      analysisHistory: []
    });
  }

  async handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'syncWithFigma':
        return this.syncWithFigma(request.data);
      
      case 'uploadAnalysis':
        return this.uploadAnalysis(request.data);
      
      case 'fetchDesignTokens':
        return this.fetchDesignTokens(request.projectId);
      
      case 'saveAnalysisHistory':
        return this.saveAnalysisHistory(request.data);
        
      case 'getAnalysisHistory':
        return this.getAnalysisHistory();
        
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    // Only proceed if the tab has finished loading
    if (changeInfo.status !== 'complete') return;
    
    // Check if auto-analyze is enabled
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings?.autoAnalyze) {
        // Automatically run analysis on page load
        this.runAutoAnalysis(tabId, tab.url);
      }
    });
  }

  setupContextMenu() {
    chrome.contextMenus.create({
      id: 'designhawk-analyze',
      title: 'Analyze with DesignHawk',
      contexts: ['page']
    });
    
    chrome.contextMenus.create({
      id: 'designhawk-highlight-element',
      title: 'Highlight Design Issues',
      contexts: ['all']
    });
    
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      switch (info.menuItemId) {
        case 'designhawk-analyze':
          this.runQuickAnalysis(tab.id);
          break;
        case 'designhawk-highlight-element':
          this.highlightElement(tab.id, info);
          break;
      }
    });
  }

  async syncWithFigma(data) {
    try {
      const response = await fetch(`${this.apiEndpoint}/sync/figma`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          timestamp: new Date().toISOString(),
          source: 'chrome-extension'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error('Figma sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  async uploadAnalysis(analysisData) {
    try {
      const response = await fetch(`${this.apiEndpoint}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...analysisData,
          timestamp: new Date().toISOString(),
          source: 'chrome-extension'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Save to local history
      this.saveAnalysisHistory({
        url: analysisData.url,
        timestamp: new Date().toISOString(),
        summary: result.summary
      });
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Analysis upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  async fetchDesignTokens(projectId) {
    try {
      const response = await fetch(`${this.apiEndpoint}/tokens/${projectId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const tokens = await response.json();
      return { success: true, data: tokens };
    } catch (error) {
      console.error('Token fetch failed:', error);
      return { success: false, error: error.message };
    }
  }

  async saveAnalysisHistory(data) {
    try {
      const result = await chrome.storage.local.get(['analysisHistory']);
      const history = result.analysisHistory || [];
      
      // Add new analysis to history (keep last 50)
      history.unshift(data);
      const trimmedHistory = history.slice(0, 50);
      
      await chrome.storage.local.set({ analysisHistory: trimmedHistory });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getAnalysisHistory() {
    try {
      const result = await chrome.storage.local.get(['analysisHistory']);
      return { success: true, data: result.analysisHistory || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async runAutoAnalysis(tabId, url) {
    try {
      // Skip certain URLs
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
        return;
      }
      
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'extractTokens'
      });
      
      if (response && response.success) {
        // Save analysis result
        this.saveAnalysisHistory({
          url: url,
          timestamp: new Date().toISOString(),
          summary: {
            colors: response.data.colors?.length || 0,
            fonts: response.data.fonts?.length || 0,
            elements: response.data.elements?.length || 0
          },
          auto: true
        });
      }
    } catch (error) {
      console.error('Auto analysis failed:', error);
    }
  }

  async runQuickAnalysis(tabId) {
    try {
      // Open popup or show notification
      chrome.action.openPopup();
    } catch (error) {
      console.error('Quick analysis failed:', error);
    }
  }

  async highlightElement(tabId, info) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'highlightElement',
        x: info.x,
        y: info.y
      });
    } catch (error) {
      console.error('Element highlight failed:', error);
    }
  }

  // Badge management
  updateBadge(tabId, text, color = '#024A43') {
    chrome.action.setBadgeText({
      tabId: tabId,
      text: text
    });
    
    chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: color
    });
  }

  clearBadge(tabId) {
    chrome.action.setBadgeText({
      tabId: tabId,
      text: ''
    });
  }

  // Notification management
  showNotification(title, message, type = 'basic') {
    chrome.notifications.create({
      type: type,
      iconUrl: 'icon48.png',
      title: title,
      message: message
    });
  }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BackgroundService;
}