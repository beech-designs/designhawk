// DesignHawk Figma Plugin - Main Code
console.log('🦅 DesignHawk Figma Plugin loaded');

class DesignTokenExtractor {
  constructor() {
    this.designTokens = {
      colors: [],
      fonts: [],
      spacing: [],
      borderRadius: [],
      shadows: [],
      components: [],
      elements: []
    };
  }

  // Extract design tokens from Figma selection or page
  extractTokens(nodes = null) {
    const nodesToAnalyze = nodes || figma.currentPage.children;
    this.designTokens = {
      colors: [],
      fonts: [],
      spacing: [],
      borderRadius: [],
      shadows: [],
      components: [],
      elements: []
    };

    this.analyzeNodes(nodesToAnalyze);
    this.deduplicateTokens();
    
    return this.designTokens;
  }

  analyzeNodes(nodes) {
    for (const node of nodes) {
      this.analyzeNode(node);
      
      // Recursively analyze children
      if ('children' in node) {
        this.analyzeNodes(node.children);
      }
    }
  }

  analyzeNode(node) {
    // Extract basic node info
    const nodeData = {
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };

    // Extract fills (colors)
    if ('fills' in node && node.fills) {
      node.fills.forEach(fill => {
        if (fill.type === 'SOLID') {
          this.designTokens.colors.push({
            name: this.generateColorName(fill.color),
            hex: this.rgbToHex(fill.color),
            rgb: fill.color,
            opacity: fill.opacity || 1,
            source: `${node.name} (${node.type})`
          });
        }
      });
    }

    // Extract strokes (border colors)
    if ('strokes' in node && node.strokes) {
      node.strokes.forEach(stroke => {
        if (stroke.type === 'SOLID') {
          this.designTokens.colors.push({
            name: this.generateColorName(stroke.color, 'border'),
            hex: this.rgbToHex(stroke.color),
            rgb: stroke.color,
            opacity: stroke.opacity || 1,
            source: `${node.name} border (${node.type})`
          });
        }
      });
    }

    // Extract typography
    if (node.type === 'TEXT') {
      const textNode = node;
      
      // Get font properties
      const fontSize = textNode.fontSize;
      const fontName = textNode.fontName;
      const fontWeight = textNode.fontWeight;
      const lineHeight = textNode.lineHeight;
      const letterSpacing = textNode.letterSpacing;

      this.designTokens.fonts.push({
        family: fontName.family,
        style: fontName.style,
        size: fontSize,
        weight: fontWeight,
        lineHeight: lineHeight,
        letterSpacing: letterSpacing,
        source: `${node.name} (TEXT)`
      });
    }

    // Extract spacing (padding, margins from auto-layout)
    if ('paddingLeft' in node) {
      this.designTokens.spacing.push({
        type: 'padding',
        left: node.paddingLeft,
        right: node.paddingRight,
        top: node.paddingTop,
        bottom: node.paddingBottom,
        source: `${node.name} padding`
      });
    }

    if ('itemSpacing' in node) {
      this.designTokens.spacing.push({
        type: 'gap',
        value: node.itemSpacing,
        source: `${node.name} item spacing`
      });
    }

    // Extract border radius
    if ('cornerRadius' in node && node.cornerRadius) {
      this.designTokens.borderRadius.push({
        value: node.cornerRadius,
        source: `${node.name} corner radius`
      });
    }

    // Extract shadows/effects
    if ('effects' in node && node.effects) {
      node.effects.forEach(effect => {
        if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
          this.designTokens.shadows.push({
            type: effect.type,
            x: effect.offset.x,
            y: effect.offset.y,
            blur: effect.radius,
            spread: effect.spread || 0,
            color: this.rgbToHex(effect.color),
            opacity: effect.color.a || 1,
            source: `${node.name} ${effect.type.toLowerCase()}`
          });
        }
      });
    }

    // Identify components
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      this.designTokens.components.push({
        id: node.id,
        name: node.name,
        type: node.type,
        description: node.description || '',
        width: node.width,
        height: node.height
      });
    }

    // Add to elements list
    this.designTokens.elements.push(nodeData);
  }

  // Helper functions
  rgbToHex(rgb) {
    const r = Math.round(rgb.r * 255);
    const g = Math.round(rgb.g * 255);
    const b = Math.round(rgb.b * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  generateColorName(rgb, prefix = '') {
    const hex = this.rgbToHex(rgb);
    const colorNames = {
      '#000000': 'black',
      '#ffffff': 'white',
      '#ff0000': 'red',
      '#00ff00': 'green',
      '#0000ff': 'blue',
      '#ffff00': 'yellow',
      '#ff00ff': 'magenta',
      '#00ffff': 'cyan',
      '#142D25': 'guerrilla-forest',
      '#024A43': 'tropical-forest',
      '#F2E3D8': 'soft-sunset',
      '#DB783E': 'holy-cannoli',
      '#AA423A': 'rum-punch',
      '#FBF5F0': 'silver-bird'
    };
    
    const baseName = colorNames[hex.toLowerCase()] || hex;
    return prefix ? `${prefix}-${baseName}` : baseName;
  }

  deduplicateTokens() {
    // Remove duplicate colors
    const uniqueColors = [];
    const seenColors = new Set();
    
    this.designTokens.colors.forEach(color => {
      const key = `${color.hex}-${color.opacity}`;
      if (!seenColors.has(key)) {
        seenColors.add(key);
        uniqueColors.push(color);
      }
    });
    this.designTokens.colors = uniqueColors;

    // Remove duplicate fonts
    const uniqueFonts = [];
    const seenFonts = new Set();
    
    this.designTokens.fonts.forEach(font => {
      const key = `${font.family}-${font.style}-${font.size}-${font.weight}`;
      if (!seenFonts.has(key)) {
        seenFonts.add(key);
        uniqueFonts.push(font);
      }
    });
    this.designTokens.fonts = uniqueFonts;

    // Remove duplicate spacing values
    const uniqueSpacing = [];
    const seenSpacing = new Set();
    
    this.designTokens.spacing.forEach(spacing => {
      const key = JSON.stringify(spacing);
      if (!seenSpacing.has(key)) {
        seenSpacing.add(key);
        uniqueSpacing.push(spacing);
      }
    });
    this.designTokens.spacing = uniqueSpacing;
  }

  // Generate CSS custom properties
  generateCSSTokens() {
    let css = ':root {\n';
    
    // Colors
    this.designTokens.colors.forEach((color, index) => {
      const name = color.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      css += `  --color-${name}-${index}: ${color.hex};\n`;
    });
    
    // Fonts
    this.designTokens.fonts.forEach((font, index) => {
      const name = font.family.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      css += `  --font-${name}-${font.size}: ${font.family};\n`;
      css += `  --font-size-${name}-${index}: ${font.size}px;\n`;
      css += `  --font-weight-${name}-${index}: ${font.weight};\n`;
    });
    
    // Spacing
    this.designTokens.spacing.forEach((spacing, index) => {
      if (spacing.type === 'gap') {
        css += `  --spacing-gap-${index}: ${spacing.value}px;\n`;
      } else if (spacing.type === 'padding') {
        css += `  --spacing-padding-${index}: ${spacing.top}px ${spacing.right}px ${spacing.bottom}px ${spacing.left}px;\n`;
      }
    });
    
    css += '}\n';
    return css;
  }

  // Sync with backend
  async syncWithBackend(tokens, projectUrl = '') {
    try {
      const response = await fetch('https://designhawk-api.herokuapp.com/api/sync/figma', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens: tokens,
          projectUrl: projectUrl,
          timestamp: new Date().toISOString(),
          source: 'figma-plugin'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Backend sync failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Plugin initialization
const extractor = new DesignTokenExtractor();

// Show UI
figma.showUI(__html__, { 
  width: 400, 
  height: 700,
  themeColors: true 
});

// Handle UI messages
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'get-selection':
      const selection = figma.currentPage.selection;
      figma.ui.postMessage({
        type: 'selection-info',
        data: {
          count: selection.length,
          elements: selection.map(node => ({
            id: node.id,
            name: node.name,
            type: node.type
          }))
        }
      });
      break;

    case 'analyze-selection':
      try {
        const selectedNodes = figma.currentPage.selection;
        if (selectedNodes.length === 0) {
          figma.ui.postMessage({
            type: 'error',
            data: { message: 'Please select at least one element' }
          });
          return;
        }
        
        const tokens = extractor.extractTokens(selectedNodes);
        figma.ui.postMessage({
          type: 'analysis-complete',
          data: tokens
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'error',
          data: { message: error.message }
        });
      }
      break;

    case 'analyze-page':
      try {
        const tokens = extractor.extractTokens();
        figma.ui.postMessage({
          type: 'analysis-complete',
          data: tokens
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'error',
          data: { message: error.message }
        });
      }
      break;

    case 'export-css':
      try {
        const css = extractor.generateCSSTokens();
        figma.ui.postMessage({
          type: 'css-generated',
          data: { css: css }
        });
      } catch (error) {
        figma.ui.postMessage({
          type: 'error',
          data: { message: error.message }
        });
      }
      break;

    case 'sync-backend':
      try {
        const result = await extractor.syncWithBackend(msg.tokens, msg.projectUrl);
        figma.ui.postMessage({
          type: 'sync-complete',
          data: result
        });
        
        if (result.success) {
          figma.notify('✅ Synced with backend successfully!');
        } else {
          figma.notify('❌ Sync failed: ' + result.error);
        }
      } catch (error) {
        figma.ui.postMessage({
          type: 'error',
          data: { message: error.message }
        });
      }
      break;

    case 'close':
      figma.closePlugin();
      break;
  }
};

// Listen for selection changes
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection-info',
    data: {
      count: selection.length,
      elements: selection.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type
      }))
    }
  });
});