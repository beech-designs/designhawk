// DesignHawk Chrome Extension - Content Script
console.log('🦅 DesignHawk loaded on page');

class DesignAnalyzer {
  constructor() {
    this.designTokens = null;
    this.pageElements = [];
    this.analysisResults = {};
  }

  // Extract all design tokens from the current page
  extractDesignTokens() {
    const tokens = {
      colors: new Set(),
      fonts: new Set(),
      spacing: new Set(),
      borderRadius: new Set(),
      shadows: new Set(),
      elements: []
    };

    // Get all elements
    const allElements = document.querySelectorAll('*');
    
    allElements.forEach((element, index) => {
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      // Skip elements that are not visible
      if (rect.width === 0 && rect.height === 0) return;
      
      const elementData = {
        id: element.id || `element-${index}`,
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        position: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        styles: {
          color: computedStyle.color,
          backgroundColor: computedStyle.backgroundColor,
          fontSize: computedStyle.fontSize,
          fontFamily: computedStyle.fontFamily,
          fontWeight: computedStyle.fontWeight,
          lineHeight: computedStyle.lineHeight,
          margin: {
            top: computedStyle.marginTop,
            right: computedStyle.marginRight,
            bottom: computedStyle.marginBottom,
            left: computedStyle.marginLeft
          },
          padding: {
            top: computedStyle.paddingTop,
            right: computedStyle.paddingRight,
            bottom: computedStyle.paddingBottom,
            left: computedStyle.paddingLeft
          },
          borderRadius: computedStyle.borderRadius,
          boxShadow: computedStyle.boxShadow,
          border: computedStyle.border
        }
      };

      tokens.elements.push(elementData);
      
      // Collect unique values
      if (computedStyle.color !== 'rgba(0, 0, 0, 0)') {
        tokens.colors.add(computedStyle.color);
      }
      if (computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        tokens.colors.add(computedStyle.backgroundColor);
      }
      
      tokens.fonts.add(computedStyle.fontFamily);
      
      // Collect spacing values
      Object.values(elementData.styles.margin).forEach(value => {
        if (value !== '0px') tokens.spacing.add(value);
      });
      Object.values(elementData.styles.padding).forEach(value => {
        if (value !== '0px') tokens.spacing.add(value);
      });
      
      if (computedStyle.borderRadius !== '0px') {
        tokens.borderRadius.add(computedStyle.borderRadius);
      }
      
      if (computedStyle.boxShadow !== 'none') {
        tokens.shadows.add(computedStyle.boxShadow);
      }
    });

    // Convert Sets to Arrays
    return {
      colors: Array.from(tokens.colors),
      fonts: Array.from(tokens.fonts),
      spacing: Array.from(tokens.spacing),
      borderRadius: Array.from(tokens.borderRadius),
      shadows: Array.from(tokens.shadows),
      elements: tokens.elements
    };
  }

  // Perform accessibility analysis
  analyzeAccessibility() {
    const issues = [];
    const elements = document.querySelectorAll('*');
    
    elements.forEach(element => {
      // Check for missing alt text on images
      if (element.tagName === 'IMG' && !element.alt) {
        issues.push({
          type: 'missing-alt',
          element: element,
          message: 'Image missing alt text',
          severity: 'high',
          xpath: this.getXPath(element)
        });
      }
      
      // Check for insufficient color contrast
      const style = window.getComputedStyle(element);
      if (element.textContent && element.textContent.trim()) {
        const contrast = this.calculateContrast(style.color, style.backgroundColor);
        if (contrast < 4.5) {
          issues.push({
            type: 'low-contrast',
            element: element,
            message: `Low color contrast ratio: ${contrast.toFixed(2)}`,
            severity: 'medium',
            xpath: this.getXPath(element)
          });
        }
      }
      
      // Check for missing form labels
      if (element.tagName === 'INPUT' && element.type !== 'hidden' && 
          !element.labels.length && !element.getAttribute('aria-label')) {
        issues.push({
          type: 'missing-label',
          element: element,
          message: 'Form input missing label',
          severity: 'high',
          xpath: this.getXPath(element)
        });
      }
      
      // Check for proper heading hierarchy
      if (element.tagName.match(/^H[1-6]$/)) {
        const level = parseInt(element.tagName.charAt(1));
        const prevHeading = this.findPreviousHeading(element);
        if (prevHeading && level > prevHeading + 1) {
          issues.push({
            type: 'heading-hierarchy',
            element: element,
            message: `Heading level ${level} follows H${prevHeading} - consider using H${prevHeading + 1}`,
            severity: 'medium',
            xpath: this.getXPath(element)
          });
        }
      }
    });
    
    return {
      score: Math.max(0, 100 - (issues.length * 5)),
      issues: issues,
      totalElements: elements.length
    };
  }

  // Helper function to calculate color contrast
  calculateContrast(color1, color2) {
    const rgb1 = this.parseRgb(color1);
    const rgb2 = this.parseRgb(color2);
    
    if (!rgb1 || !rgb2) return 21; // Return max contrast if parsing fails
    
    const l1 = this.getLuminance(rgb1);
    const l2 = this.getLuminance(rgb2);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  parseRgb(color) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : null;
  }

  getLuminance([r, g, b]) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  findPreviousHeading(element) {
    let current = element.previousElementSibling;
    while (current) {
      if (current.tagName.match(/^H[1-6]$/)) {
        return parseInt(current.tagName.charAt(1));
      }
      current = current.previousElementSibling;
    }
    return null;
  }

  getXPath(element) {
    if (element.id) return `id("${element.id}")`;
    if (element === document.body) return '/html/body';
    
    let ix = 0;
    const siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling === element) {
        return this.getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++;
      }
    }
  }

  // Compare with Figma design tokens
  compareWithDesign(figmaTokens) {
    if (!figmaTokens) return null;
    
    const pageTokens = this.extractDesignTokens();
    const comparison = {
      colors: this.compareTokenArrays(
        pageTokens.colors, 
        figmaTokens.colors ? figmaTokens.colors.map(c => c.hex || c) : []
      ),
      fonts: this.compareTokenArrays(
        pageTokens.fonts, 
        figmaTokens.fonts ? figmaTokens.fonts.map(f => f.family || f) : []
      ),
      spacing: this.compareTokenArrays(
        pageTokens.spacing, 
        figmaTokens.spacing ? figmaTokens.spacing.map(s => s.value + 'px' || s) : []
      ),
      overall: 0,
      issues: []
    };
    
    // Calculate overall compliance score
    const scores = [comparison.colors, comparison.fonts, comparison.spacing];
    comparison.overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    
    // Generate issues for non-compliant tokens
    this.generateComplianceIssues(pageTokens, figmaTokens, comparison);
    
    return comparison;
  }

  compareTokenArrays(pageTokens, designTokens) {
    if (!designTokens || designTokens.length === 0) return 100;
    
    let matches = 0;
    pageTokens.forEach(token => {
      if (designTokens.some(designToken => this.tokensMatch(token, designToken))) {
        matches++;
      }
    });
    
    return Math.round((matches / pageTokens.length) * 100);
  }

  tokensMatch(token1, token2) {
    // Normalize tokens for comparison
    if (typeof token1 === 'string' && typeof token2 === 'string') {
      return token1.toLowerCase().trim() === token2.toLowerCase().trim();
    }
    return token1 === token2;
  }

  generateComplianceIssues(pageTokens, figmaTokens, comparison) {
    const issues = [];
    
    // Find colors not in design system
    if (figmaTokens.colors) {
      const designColors = figmaTokens.colors.map(c => c.hex || c);
      pageTokens.colors.forEach(color => {
        if (!designColors.some(designColor => this.tokensMatch(color, designColor))) {
          issues.push({
            type: 'non-standard-color',
            message: `Color ${color} not found in design system`,
            severity: 'medium',
            token: color
          });
        }
      });
    }
    
    // Find fonts not in design system
    if (figmaTokens.fonts) {
      const designFonts = figmaTokens.fonts.map(f => f.family || f);
      pageTokens.fonts.forEach(font => {
        if (!designFonts.some(designFont => this.tokensMatch(font, designFont))) {
          issues.push({
            type: 'non-standard-font',
            message: `Font ${font} not found in design system`,
            severity: 'low',
            token: font
          });
        }
      });
    }
    
    comparison.issues = issues;
  }

  // Visual diff highlighting
  highlightDifferences(differences) {
    // Remove existing highlights
    document.querySelectorAll('.designhawk-highlight').forEach(el => el.remove());
    
    differences.forEach(diff => {
      const elements = diff.xpath ? 
        document.evaluate(diff.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue :
        diff.element;
      
      if (!elements) return;
      
      const highlight = document.createElement('div');
      highlight.className = 'designhawk-highlight';
      highlight.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 2px solid ${diff.severity === 'high' ? '#ff4444' : diff.severity === 'medium' ? '#ffaa00' : '#4444ff'};
        background: ${diff.severity === 'high' ? 'rgba(255,68,68,0.1)' : diff.severity === 'medium' ? 'rgba(255,170,0,0.1)' : 'rgba(68,68,255,0.1)'};
        z-index: 10000;
        box-sizing: border-box;
        border-radius: 4px;
      `;
      
      const rect = elements.getBoundingClientRect();
      highlight.style.left = rect.left + window.scrollX + 'px';
      highlight.style.top = rect.top + window.scrollY + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
      
      // Add tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'designhawk-tooltip';
      tooltip.textContent = diff.message;
      tooltip.style.cssText = `
        position: absolute;
        top: -35px;
        left: 0;
        background: #333;
        color: white;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10001;
        max-width: 250px;
        word-wrap: break-word;
        white-space: normal;
      `;
      
      highlight.appendChild(tooltip);
      document.body.appendChild(highlight);
    });
  }

  clearHighlights() {
    document.querySelectorAll('.designhawk-highlight').forEach(el => el.remove());
  }
}

// Initialize analyzer
const analyzer = new DesignAnalyzer();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'extractTokens':
      try {
        const tokens = analyzer.extractDesignTokens();
        sendResponse({ success: true, data: tokens });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'analyzeAccessibility':
      try {
        const accessibility = analyzer.analyzeAccessibility();
        sendResponse({ success: true, data: accessibility });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'compareDesign':
      try {
        const comparison = analyzer.compareWithDesign(request.figmaTokens);
        sendResponse({ success: true, data: comparison });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'highlightIssues':
      try {
        analyzer.highlightDifferences(request.issues);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'clearHighlights':
      try {
        analyzer.clearHighlights();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Auto-analyze on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🦅 DesignHawk ready for analysis');
  });
} else {
  console.log('🦅 DesignHawk ready for analysis');
}