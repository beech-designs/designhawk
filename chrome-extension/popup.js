// DesignHawk Chrome Extension Popup Script
class DesignHawkPopup {
  constructor() {
    this.figmaTokens = null;
    this.currentAnalysis = null;
    this.comparisonResults = null;
    this.init();
  }

  async init() {
    // Bind event listeners
    document.getElementById('analyzePageBtn').addEventListener('click', () => this.analyzePage());
    document.getElementById('accessibilityBtn').addEventListener('click', () => this.checkAccessibility());
    document.getElementById('connectFigmaBtn').addEventListener('click', () => this.connectToFigma());
    document.getElementById('loadTokensBtn').addEventListener('click', () => this.loadDesignTokens());
    document.getElementById('compareBtn').addEventListener('click', () => this.compareWithDesign());
    document.getElementById('highlightBtn').addEventListener('click', () => this.highlightIssues());
    document.getElementById('exportReportBtn').addEventListener('click', () => this.exportReport());
    document.getElementById('clearHighlightsBtn').addEventListener('click', () => this.clearHighlights());
    
    // Load saved data and current tab info
    await this.loadSavedData();
    await this.loadCurrentTab();
  }

  async loadSavedData() {
    try {
      const result = await chrome.storage.local.get(['figmaTokens', 'analysisResults', 'figmaConnected']);
      
      if (result.figmaTokens) {
        this.figmaTokens = result.figmaTokens;
        this.updateFigmaStatus('Connected to Figma design tokens', 'success');
        document.getElementById('loadTokensBtn').disabled = false;
        document.getElementById('compareBtn').disabled = false;
        this.updateFigmaButton(true);
      }
      
      if (result.analysisResults) {
        this.currentAnalysis = result.analysisResults;
        this.displayResults(result.analysisResults);
      }
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  }

  async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        document.getElementById('currentUrl').textContent = tab.url;
      }
    } catch (error) {
      console.error('Error loading current tab:', error);
      document.getElementById('currentUrl').textContent = 'Unable to load current page';
    }
  }

  async analyzePage() {
    this.showLoading(true);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'extractTokens'
      });
      
      if (response && response.success) {
        const analysis = {
          type: 'page-analysis',
          data: response.data,
          url: tab.url,
          timestamp: new Date().toISOString()
        };
        
        this.currentAnalysis = analysis;
        await chrome.storage.local.set({ analysisResults: analysis });
        
        this.displayResults(analysis);
        this.showActionsSection();
      } else {
        throw new Error(response?.error || 'Failed to analyze page');
      }
      
    } catch (error) {
      this.showError('Failed to analyze page: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async checkAccessibility() {
    this.showLoading(true);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'analyzeAccessibility'
      });
      
      if (response && response.success) {
        const analysis = {
          type: 'accessibility',
          data: response.data,
          url: tab.url,
          timestamp: new Date().toISOString()
        };
        
        this.currentAnalysis = analysis;
        await chrome.storage.local.set({ analysisResults: analysis });
        
        this.displayResults(analysis);
        this.showActionsSection();
        
        // Highlight accessibility issues
        if (response.data.issues && response.data.issues.length > 0) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'highlightIssues',
            issues: response.data.issues
          });
        }
      } else {
        throw new Error(response?.error || 'Failed to check accessibility');
      }
      
    } catch (error) {
      this.showError('Failed to check accessibility: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async connectToFigma() {
    try {
      // Try to load tokens from backend first
      const backendResponse = await this.loadFromBackend();
      
      if (backendResponse.success) {
        this.figmaTokens = backendResponse.data;
        await chrome.storage.local.set({ figmaTokens: this.figmaTokens, figmaConnected: true });
        this.updateFigmaStatus('Successfully connected to Figma via backend', 'success');
        this.updateFigmaButton(true);
        document.getElementById('loadTokensBtn').disabled = false;
        document.getElementById('compareBtn').disabled = false;
        return;
      }
      
      // Fallback: simulate connection with sample tokens
      this.figmaTokens = {
        colors: [
          { name: 'guerrilla-forest', hex: '#142D25', source: 'Design System' },
          { name: 'tropical-forest', hex: '#024A43', source: 'Design System' },
          { name: 'soft-sunset', hex: '#F2E3D8', source: 'Design System' },
          { name: 'holy-cannoli', hex: '#DB783E', source: 'Design System' },
          { name: 'rum-punch', hex: '#AA423A', source: 'Design System' },
          { name: 'silver-bird', hex: '#FBF5F0', source: 'Design System' }
        ],
        fonts: [
          { family: 'Inter', size: 16, weight: 400, source: 'Body Text' },
          { family: 'Inter', size: 24, weight: 600, source: 'Headings' },
          { family: 'Inter', size: 14, weight: 500, source: 'UI Elements' }
        ],
        spacing: [
          { type: 'padding', value: 8, source: 'Small spacing' },
          { type: 'padding', value: 16, source: 'Medium spacing' },
          { type: 'padding', value: 24, source: 'Large spacing' },
          { type: 'padding', value: 32, source: 'XL spacing' }
        ],
        lastSync: new Date().toISOString()
      };
      
      await chrome.storage.local.set({ figmaTokens: this.figmaTokens, figmaConnected: true });
      this.updateFigmaStatus('Connected to Figma design system (demo)', 'success');
      this.updateFigmaButton(true);
      document.getElementById('loadTokensBtn').disabled = false;
      document.getElementById('compareBtn').disabled = false;
      
    } catch (error) {
      this.updateFigmaStatus('Failed to connect to Figma: ' + error.message, 'error');
    }
  }

  async loadFromBackend() {
    try {
      const response = await fetch('https://designhawk-api.herokuapp.com/api/tokens/latest', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.tokens };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async loadDesignTokens() {
    if (!this.figmaTokens) {
      this.updateFigmaStatus('No Figma tokens available. Connect first.', 'error');
      return;
    }
    
    this.displayTokens(this.figmaTokens);
    this.updateFigmaStatus(`Loaded ${this.figmaTokens.colors?.length || 0} colors, ${this.figmaTokens.fonts?.length || 0} fonts`, 'info');
  }

  async compareWithDesign() {
    if (!this.figmaTokens || !this.currentAnalysis) {
      this.showError('Need both Figma tokens and page analysis to compare');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'compareDesign',
        figmaTokens: this.figmaTokens
      });
      
      if (response && response.success) {
        this.comparisonResults = response.data;
        this.displayComparison(response.data);
        document.getElementById('highlightBtn').disabled = false;
      } else {
        throw new Error(response?.error || 'Failed to compare with design');
      }
      
    } catch (error) {
      this.showError('Failed to compare with design: ' + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  async highlightIssues() {
    if (!this.comparisonResults) return;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      await chrome.tabs.sendMessage(tab.id, {
        action: 'highlightIssues',
        issues: this.comparisonResults.issues || []
      });
      
      this.updateFigmaStatus('Issues highlighted on page', 'info');
    } catch (error) {
      this.showError('Failed to highlight issues: ' + error.message);
    }
  }

  async clearHighlights() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      await chrome.tabs.sendMessage(tab.id, {
        action: 'clearHighlights'
      });
      
      this.updateFigmaStatus('Highlights cleared', 'info');
    } catch (error) {
      this.showError('Failed to clear highlights: ' + error.message);
    }
  }

  async exportReport() {
    if (!this.currentAnalysis) {
      this.showError('No analysis data to export');
      return;
    }
    
    const report = {
      url: this.currentAnalysis.url,
      timestamp: this.currentAnalysis.timestamp,
      analysis: this.currentAnalysis.data,
      comparison: this.comparisonResults,
      figmaTokens: this.figmaTokens
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `designhawk-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.updateFigmaStatus('Report exported successfully', 'success');
  }

  displayResults(analysis) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsDiv = document.getElementById('results');
    const tokenCounts = document.getElementById('tokenCounts');
    
    let html = '';
    let countsHtml = '';
    
    switch (analysis.type) {
      case 'page-analysis':
        html = this.formatPageAnalysis(analysis.data);
        countsHtml = this.formatTokenCounts(analysis.data);
        break;
      case 'accessibility':
        html = this.formatAccessibilityResults(analysis.data);
        break;
    }
    
    resultsDiv.innerHTML = html;
    if (countsHtml) {
      tokenCounts.innerHTML = countsHtml;
      tokenCounts.style.display = 'grid';
    }
    resultsSection.style.display = 'block';
  }

  formatPageAnalysis(data) {
    return `
      <div class="metric">
        <span class="label">Elements Analyzed:</span>
        <span class="value">${data.elements?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Unique Colors:</span>
        <span class="value">${data.colors?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Font Families:</span>
        <span class="value">${data.fonts?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Spacing Values:</span>
        <span class="value">${data.spacing?.length || 0}</span>
      </div>
    `;
  }

  formatTokenCounts(data) {
    return `
      <div class="token-stat">
        <div class="number">${data.colors?.length || 0}</div>
        <div class="label">Colors</div>
      </div>
      <div class="token-stat">
        <div class="number">${data.fonts?.length || 0}</div>
        <div class="label">Fonts</div>
      </div>
      <div class="token-stat">
        <div class="number">${data.spacing?.length || 0}</div>
        <div class="label">Spacing</div>
      </div>
      <div class="token-stat">
        <div class="number">${data.borderRadius?.length || 0}</div>
        <div class="label">Radius</div>
      </div>
    `;
  }

  formatAccessibilityResults(data) {
    const scoreClass = data.score >= 90 ? 'good' : data.score >= 70 ? 'warning' : 'error';
    
    let html = `
      <div class="metric">
        <span class="label">Accessibility Score:</span>
        <span class="value ${scoreClass}">${data.score}/100</span>
      </div>
      <div class="metric">
        <span class="label">Issues Found:</span>
        <span class="value ${data.issues?.length > 0 ? 'error' : 'good'}">${data.issues?.length || 0}</span>
      </div>
    `;
    
    if (data.issues && data.issues.length > 0) {
      html += '<div style="margin-top: 12px;"><strong>Issues:</strong></div>';
      data.issues.slice(0, 5).forEach(issue => {
        const severityClass = issue.severity === 'high' ? 'error' : issue.severity === 'medium' ? 'warning' : 'good';
        html += `<div class="metric">
          <span class="label">${issue.type}:</span>
          <span class="value ${severityClass}">${issue.severity}</span>
        </div>`;
      });
    }
    
    return html;
  }

  displayComparison(comparison) {
    const comparisonSection = document.getElementById('comparisonSection');
    const comparisonResults = document.getElementById('comparisonResults');
    
    const html = `
      <div class="metric">
        <span class="label">Overall Compliance:</span>
        <span class="value ${comparison.overall >= 90 ? 'good' : comparison.overall >= 70 ? 'warning' : 'error'}">${comparison.overall}%</span>
      </div>
      <div class="metric">
        <span class="label">Color Compliance:</span>
        <span class="value ${comparison.colors >= 90 ? 'good' : comparison.colors >= 70 ? 'warning' : 'error'}">${comparison.colors}%</span>
      </div>
      <div class="metric">
        <span class="label">Font Compliance:</span>
        <span class="value ${comparison.fonts >= 90 ? 'good' : comparison.fonts >= 70 ? 'warning' : 'error'}">${comparison.fonts}%</span>
      </div>
      <div class="metric">
        <span class="label">Spacing Compliance:</span>
        <span class="value ${comparison.spacing >= 90 ? 'good' : comparison.spacing >= 70 ? 'warning' : 'error'}">${comparison.spacing}%</span>
      </div>
    `;
    
    comparisonResults.innerHTML = html;
    comparisonSection.style.display = 'block';
  }

  displayTokens(tokens) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsDiv = document.getElementById('results');
    
    const html = `
      <div class="metric">
        <span class="label">Design Colors:</span>
        <span class="value">${tokens.colors?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Typography Styles:</span>
        <span class="value">${tokens.fonts?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Spacing Values:</span>
        <span class="value">${tokens.spacing?.length || 0}</span>
      </div>
      <div class="metric">
        <span class="label">Last Synced:</span>
        <span class="value">${new Date(tokens.lastSync).toLocaleTimeString()}</span>
      </div>
    `;
    
    resultsDiv.innerHTML = html;
    resultsSection.style.display = 'block';
  }

  updateFigmaStatus(message, type) {
    const status = document.getElementById('figmaStatus');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 4000);
  }

  updateFigmaButton(connected) {
    const button = document.getElementById('connectFigmaBtn');
    if (connected) {
      button.textContent = '✅ Connected to Figma';
      button.classList.add('figma-connected');
      button.disabled = true;
    } else {
      button.textContent = '🎨 Connect to Figma';
      button.classList.remove('figma-connected');
      button.disabled = false;
    }
  }

  showActionsSection() {
    document.getElementById('actionsSection').style.display = 'block';
  }

  showError(message) {
    this.updateFigmaStatus(message, 'error');
  }

  showLoading(show) {
    document.getElementById('loading').classList.toggle('show', show);
    
    // Disable buttons during loading
    const buttons = document.querySelectorAll('.button');
    buttons.forEach(button => {
      button.disabled = show;
    });
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new DesignHawkPopup();
});