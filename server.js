// DesignHawk Backend API Server
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

class DesignHawkAPI {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.projects = new Map();
    this.analyses = new Map();
    this.tokens = new Map();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors({
      origin: ['https://designhawk.com', 'chrome-extension://*', '*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));
    
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'DesignHawk API'
      });
    });

    // API Routes
    this.app.use('/api', this.createAPIRoutes());
    
    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'DesignHawk API Server',
        version: '1.0.0',
        endpoints: {
          health: '/health',
          tokens: '/api/tokens',
          sync: '/api/sync',
          analysis: '/api/analysis',
          projects: '/api/projects'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Server Error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  createAPIRoutes() {
    const router = express.Router();

    // Tokens endpoints
    router.get('/tokens/latest', this.getLatestTokens.bind(this));
    router.get('/tokens/:projectId', this.getProjectTokens.bind(this));
    router.post('/tokens/:projectId', this.saveProjectTokens.bind(this));

    // Sync endpoints
    router.post('/sync/figma', this.syncFromFigma.bind(this));
    router.post('/sync/chrome', this.syncFromChrome.bind(this));

    // Analysis endpoints
    router.post('/analysis', this.saveAnalysis.bind(this));
    router.get('/analysis/:projectId', this.getProjectAnalyses.bind(this));
    router.post('/analysis/compare', this.compareAnalysis.bind(this));

    // Project endpoints
    router.post('/projects', this.createProject.bind(this));
    router.get('/projects/:id', this.getProject.bind(this));
    router.put('/projects/:id', this.updateProject.bind(this));

    return router;
  }

  // Token management
  async getLatestTokens(req, res) {
    try {
      // Return the most recently updated tokens
      const tokensArray = Array.from(this.tokens.values());
      const latest = tokensArray.sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
      )[0];

      if (!latest) {
        return res.json({
          success: true,
          data: {
            tokens: this.getDefaultTokens(),
            source: 'default',
            updatedAt: new Date().toISOString()
          }
        });
      }

      res.json({
        success: true,
        data: latest
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getProjectTokens(req, res) {
    try {
      const { projectId } = req.params;
      const tokens = this.tokens.get(projectId);

      if (!tokens) {
        return res.status(404).json({
          success: false,
          error: 'Project tokens not found'
        });
      }

      res.json({
        success: true,
        data: tokens
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async saveProjectTokens(req, res) {
    try {
      const { projectId } = req.params;
      const tokens = req.body;

      const tokenData = {
        projectId,
        tokens,
        updatedAt: new Date().toISOString(),
        source: req.headers['user-agent']?.includes('Figma') ? 'figma' : 'chrome'
      };

      this.tokens.set(projectId, tokenData);

      res.json({
        success: true,
        data: tokenData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Sync operations
  async syncFromFigma(req, res) {
    try {
      const { tokens, projectUrl, timestamp } = req.body;
      const projectId = projectUrl ? this.getProjectIdFromUrl(projectUrl) : 'default';

      const syncData = {
        projectId,
        tokens,
        projectUrl,
        timestamp: timestamp || new Date().toISOString(),
        source: 'figma',
        syncId: uuidv4()
      };

      // Save tokens
      this.tokens.set(projectId, syncData);

      // Update project if exists
      if (this.projects.has(projectId)) {
        const project = this.projects.get(projectId);
        project.lastSync = syncData.timestamp;
        project.tokenCount = this.countTokens(tokens);
      }

      res.json({
        success: true,
        data: {
          syncId: syncData.syncId,
          projectId,
          timestamp: syncData.timestamp,
          tokenCount: this.countTokens(tokens)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async syncFromChrome(req, res) {
    try {
      const { analysisData, projectUrl } = req.body;
      const projectId = projectUrl ? this.getProjectIdFromUrl(projectUrl) : 'default';

      const analysisId = uuidv4();
      const analysis = {
        id: analysisId,
        projectId,
        ...analysisData,
        timestamp: new Date().toISOString(),
        source: 'chrome'
      };

      this.analyses.set(analysisId, analysis);

      res.json({
        success: true,
        data: {
          analysisId,
          projectId,
          timestamp: analysis.timestamp
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Analysis operations
  async saveAnalysis(req, res) {
    try {
      const analysis = {
        id: uuidv4(),
        ...req.body,
        timestamp: new Date().toISOString()
      };

      this.analyses.set(analysis.id, analysis);

      res.status(201).json({
        success: true,
        data: analysis
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getProjectAnalyses(req, res) {
    try {
      const { projectId } = req.params;
      const analyses = Array.from(this.analyses.values())
        .filter(analysis => analysis.projectId === projectId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json({
        success: true,
        data: analyses
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async compareAnalysis(req, res) {
    try {
      const { figmaTokens, webTokens } = req.body;
      const comparison = this.performTokenComparison(figmaTokens, webTokens);

      res.json({
        success: true,
        data: comparison
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Project management
  async createProject(req, res) {
    try {
      const { name, url, description } = req.body;
      const projectId = uuidv4();

      const project = {
        id: projectId,
        name,
        url,
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSync: null,
        tokenCount: 0
      };

      this.projects.set(projectId, project);

      res.status(201).json({
        success: true,
        data: project
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getProject(req, res) {
    try {
      const { id } = req.params;
      const project = this.projects.get(id);

      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      // Include recent analyses
      const analyses = Array.from(this.analyses.values())
        .filter(analysis => analysis.projectId === id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      res.json({
        success: true,
        data: {
          ...project,
          recentAnalyses: analyses
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateProject(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const project = this.projects.get(id);
      if (!project) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }

      const updatedProject = {
        ...project,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      this.projects.set(id, updatedProject);

      res.json({
        success: true,
        data: updatedProject
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Helper methods
  getProjectIdFromUrl(url) {
    // Extract project ID from URL or create hash
    const hash = require('crypto').createHash('md5').update(url).digest('hex');
    return hash.substring(0, 8);
  }

  countTokens(tokens) {
    if (!tokens) return 0;
    
    let count = 0;
    if (tokens.colors) count += tokens.colors.length;
    if (tokens.fonts) count += tokens.fonts.length;
    if (tokens.spacing) count += tokens.spacing.length;
    if (tokens.borderRadius) count += tokens.borderRadius.length;
    if (tokens.shadows) count += tokens.shadows.length;
    
    return count;
  }

  getDefaultTokens() {
    return {
      colors: [
        { name: 'guerrilla-forest', hex: '#142D25', source: 'Default System' },
        { name: 'tropical-forest', hex: '#024A43', source: 'Default System' },
        { name: 'soft-sunset', hex: '#F2E3D8', source: 'Default System' },
        { name: 'holy-cannoli', hex: '#DB783E', source: 'Default System' },
        { name: 'rum-punch', hex: '#AA423A', source: 'Default System' },
        { name: 'silver-bird', hex: '#FBF5F0', source: 'Default System' }
      ],
      fonts: [
        { family: 'Inter', size: 16, weight: 400, source: 'Default System' },
        { family: 'Inter', size: 24, weight: 600, source: 'Default System' }
      ],
      spacing: [
        { type: 'padding', value: 8, source: 'Default System' },
        { type: 'padding', value: 16, source: 'Default System' },
        { type: 'padding', value: 24, source: 'Default System' },
        { type: 'padding', value: 32, source: 'Default System' }
      ]
    };
  }

  performTokenComparison(figmaTokens, webTokens) {
    const comparison = {
      colors: this.compareTokenArrays(
        figmaTokens.colors || [],
        webTokens.colors || []
      ),
      fonts: this.compareTokenArrays(
        figmaTokens.fonts || [],
        webTokens.fonts || []
      ),
      spacing: this.compareTokenArrays(
        figmaTokens.spacing || [],
        webTokens.spacing || []
      ),
      overall: 0,
      issues: []
    };

    // Calculate overall score
    const scores = [comparison.colors, comparison.fonts, comparison.spacing];
    comparison.overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Generate issues
    if (comparison.colors < 80) {
      comparison.issues.push({
        type: 'color-compliance',
        severity: 'medium',
        message: `Color compliance is ${comparison.colors}% - consider using more design system colors`
      });
    }

    if (comparison.fonts < 90) {
      comparison.issues.push({
        type: 'font-compliance',
        severity: 'low',
        message: `Font compliance is ${comparison.fonts}% - some fonts may not match design system`
      });
    }

    return comparison;
  }

  compareTokenArrays(designTokens, webTokens) {
    if (!designTokens || designTokens.length === 0) return 100;

    let matches = 0;
    designTokens.forEach(token => {
      const tokenValue = token.hex || token.family || token.value || token;
      if (webTokens.some(webToken => this.tokensMatch(tokenValue, webToken))) {
        matches++;
      }
    });

    return Math.round((matches / designTokens.length) * 100);
  }

  tokensMatch(token1, token2) {
    if (typeof token1 === 'string' && typeof token2 === 'string') {
      return token1.toLowerCase().trim() === token2.toLowerCase().trim();
    }
    return JSON.stringify(token1) === JSON.stringify(token2);
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🦅 DesignHawk API Server running on port ${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
      console.log(`API docs: http://localhost:${this.port}/`);
    });
  }
}

// Start the server
if (require.main === module) {
  const api = new DesignHawkAPI();
  api.start();
}

module.exports = DesignHawkAPI;