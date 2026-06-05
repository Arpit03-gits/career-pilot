import Sentry from '@sentry/node';
import { EventEmitter } from 'events';
import { promClient } from 'prom-client';

/**
 * AnalysisErrorTracker - Comprehensive error tracking and alerting system for failed scans
 * Features:
 * - Centralized error logging with Sentry integration
 * - Real-time error categorization and severity levels
 * - Performance metrics tracking
 * - Automated alerting for critical failures
 * - Error recovery and retry mechanisms
 * - Audit trail for compliance and debugging
 */

class AnalysisErrorTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Initialize Sentry
    this.sentryDSN = options.sentryDSN || process.env.SENTRY_DSN;
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.enableAlerting = options.enableAlerting !== false;
    this.alertThreshold = options.alertThreshold || {
      critical: 1,
      high: 5,
      medium: 10
    };
    
    // Initialize Sentry if DSN is provided
    if (this.sentryDSN) {
      Sentry.init({
        dsn: this.sentryDSN,
        environment: this.environment,
        tracesSampleRate: options.tracesSampleRate || 0.1,
        debug: options.debug || false
      });
    }
    
    // Error storage and tracking
    this.errorLog = [];
    this.errorMetrics = new Map();
    this.failedScans = new Map();
    this.alertHistory = [];
    this.maxLogSize = options.maxLogSize || 10000;
    
    // Prometheus metrics
    this.setupMetrics();
    
    // Alert channels configuration
    this.alertChannels = {
      email: options.emailAlert || null,
      slack: options.slackAlert || null,
      webhook: options.webhookAlert || null
    };
    
    // Retry configuration
    this.retryConfig = {
      maxAttempts: options.maxRetryAttempts || 3,
      initialDelay: options.initialRetryDelay || 1000, // ms
      backoffMultiplier: options.backoffMultiplier || 2
    };
    
    // Error categorization
    this.errorCategories = {
      'NETWORK_ERROR': { severity: 'high', recoverable: true },
      'TIMEOUT_ERROR': { severity: 'high', recoverable: true },
      'PARSE_ERROR': { severity: 'medium', recoverable: false },
      'VALIDATION_ERROR': { severity: 'medium', recoverable: false },
      'AUTH_ERROR': { severity: 'high', recoverable: false },
      'STORAGE_ERROR': { severity: 'critical', recoverable: false },
      'PERMISSION_ERROR': { severity: 'high', recoverable: false },
      'UNKNOWN_ERROR': { severity: 'medium', recoverable: false }
    };
  }
  
  /**
   * Setup Prometheus metrics for error tracking
   */
  setupMetrics() {
    this.metrics = {
      errorCount: new promClient.Counter({
        name: 'analysis_errors_total',
        help: 'Total number of analysis errors',
        labelNames: ['severity', 'category', 'userId']
      }),
      failedScans: new promClient.Gauge({
        name: 'analysis_failed_scans',
        help: 'Current number of failed scans',
        labelNames: ['userId']
      }),
      scanDuration: new promClient.Histogram({
        name: 'analysis_scan_duration_seconds',
        help: 'Analysis scan duration in seconds',
        labelNames: ['status', 'userId']
      }),
      errorRate: new promClient.Gauge({
        name: 'analysis_error_rate',
        help: 'Current error rate',
        labelNames: ['timeWindow']
      })
    };
  }
  
  /**
   * Categorize error based on type and message
   * @param {Error} error - The error object
   * @returns {string} - Error category
   */
  categorizeError(error) {
    const message = error.message || '';
    const code = error.code || '';
    
    if (message.includes('timeout') || code === 'ETIMEDOUT') {
      return 'TIMEOUT_ERROR';
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('JSON') || message.includes('parse')) {
      return 'PARSE_ERROR';
    }
    if (message.includes('unauthorized') || message.includes('forbidden') || code === 401 || code === 403) {
      return 'AUTH_ERROR';
    }
    if (message.includes('permission') || message.includes('EACCES')) {
      return 'PERMISSION_ERROR';
    }
    if (message.includes('disk') || message.includes('storage') || message.includes('ENOSPC')) {
      return 'STORAGE_ERROR';
    }
    if (message.includes('validation') || message.includes('schema')) {
      return 'VALIDATION_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }
  
  /**
   * Track an error from a failed scan
   * @param {Object} errorContext - Error context information
   */
  trackError(errorContext) {
    const {
      error,
      scanId,
      userId,
      repoUrl,
      analysisType = 'full',
      timestamp = new Date()
    } = errorContext;
    
    const category = this.categorizeError(error);
    const { severity, recoverable } = this.errorCategories[category];
    
    const errorEntry = {
      id: this.generateErrorId(),
      scanId,
      userId,
      repoUrl,
      analysisType,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack,
        category,
        severity,
        recoverable
      },
      timestamp,
      status: 'tracked',
      retriesAttempted: 0,
      resolved: false
    };
    
    // Add to error log
    this.errorLog.push(errorEntry);
    
    // Maintain log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
    
    // Update metrics
    this.updateErrorMetrics(category, severity, userId);
    this.metrics.errorCount.labels(severity, category, userId).inc();
    
    // Track failed scan
    if (!this.failedScans.has(scanId)) {
      this.failedScans.set(scanId, {
        errors: [],
        firstErrorTime: timestamp,
        lastErrorTime: timestamp,
        retryCount: 0
      });
    }
    
    const scanRecord = this.failedScans.get(scanId);
    scanRecord.errors.push(errorEntry.id);
    scanRecord.lastErrorTime = timestamp;
    
    // Send to Sentry if configured
    if (this.sentryDSN) {
      this.sendToSentry(errorEntry);
    }
    
    // Emit event for real-time listeners
    this.emit('error', errorEntry);
    
    // Check if alert should be triggered
    if (this.enableAlerting && (severity === 'critical' || recoverable === false)) {
      this.triggerAlert(errorEntry);
    }
    
    return errorEntry.id;
  }
  
  /**
   * Update error metrics tracking
   */
  updateErrorMetrics(category, severity, userId) {
    const key = `${category}_${severity}`;
    
    if (!this.errorMetrics.has(key)) {
      this.errorMetrics.set(key, 0);
    }
    
    this.errorMetrics.set(key, this.errorMetrics.get(key) + 1);
    this.metrics.failedScans.labels(userId).set(this.failedScans.size);
  }
  
  /**
   * Send error to Sentry
   */
  sendToSentry(errorEntry) {
    try {
      const { error, scanId, userId, repoUrl, analysisType } = errorEntry;
      
      Sentry.captureException(new Error(error.message), {
        contexts: {
          analysis: {
            scanId,
            userId,
            repoUrl,
            analysisType,
            category: error.category,
            recoverable: error.recoverable
          }
        },
        tags: {
          severity: error.severity,
          category: error.category,
          recoverable: error.recoverable
        },
        level: this.mapSeverityToSentryLevel(error.severity)
      });
    } catch (sentryError) {
      console.error('Failed to send error to Sentry:', sentryError);
    }
  }
  
  /**
   * Map severity level to Sentry level
   */
  mapSeverityToSentryLevel(severity) {
    const levelMap = {
      'critical': 'fatal',
      'high': 'error',
      'medium': 'warning',
      'low': 'info'
    };
    return levelMap[severity] || 'error';
  }
  
  /**
   * Trigger alert for critical errors
   */
  async triggerAlert(errorEntry) {
    const { error, scanId, userId, repoUrl } = errorEntry;
    
    const alertPayload = {
      alertId: this.generateAlertId(),
      timestamp: new Date(),
      scanId,
      userId,
      repoUrl,
      severity: error.severity,
      message: `Failed scan ${scanId}: ${error.message}`,
      category: error.category,
      recoverable: error.recoverable
    };
    
    this.alertHistory.push(alertPayload);
    
    // Send to configured alert channels
    const alertPromises = [];
    
    if (this.alertChannels.email) {
      alertPromises.push(
        this.sendEmailAlert(alertPayload).catch(err => 
          console.error('Email alert failed:', err)
        )
      );
    }
    
    if (this.alertChannels.slack) {
      alertPromises.push(
        this.sendSlackAlert(alertPayload).catch(err => 
          console.error('Slack alert failed:', err)
        )
      );
    }
    
    if (this.alertChannels.webhook) {
      alertPromises.push(
        this.sendWebhookAlert(alertPayload).catch(err => 
          console.error('Webhook alert failed:', err)
        )
      );
    }
    
    await Promise.allSettled(alertPromises);
    this.emit('alert', alertPayload);
  }
  
  /**
   * Send email alert
   */
  async sendEmailAlert(alertPayload) {
    if (!this.alertChannels.email) return;
    
    const emailService = this.alertChannels.email;
    const emailContent = `
      Analysis Scan Failure Alert
      
      Scan ID: ${alertPayload.scanId}
      User ID: ${alertPayload.userId}
      Repository: ${alertPayload.repoUrl}
      Severity: ${alertPayload.severity}
      Category: ${alertPayload.category}
      Recoverable: ${alertPayload.recoverable}
      
      Error: ${alertPayload.message}
      Time: ${alertPayload.timestamp.toISOString()}
    `;
    
    return emailService.send({
      to: process.env.ALERT_EMAIL || 'admin@example.com',
      subject: `[${alertPayload.severity.toUpperCase()}] Analysis Scan Failed`,
      text: emailContent
    });
  }
  
  /**
   * Send Slack alert
   */
  async sendSlackAlert(alertPayload) {
    if (!this.alertChannels.slack) return;
    
    const slackService = this.alertChannels.slack;
    const color = {
      critical: 'danger',
      high: 'warning',
      medium: 'warning',
      low: 'good'
    }[alertPayload.severity] || 'warning';
    
    return slackService.sendMessage({
      attachments: [
        {
          color,
          title: `Analysis Scan Failure - ${alertPayload.severity.toUpperCase()}`,
          fields: [
            { title: 'Scan ID', value: alertPayload.scanId, short: true },
            { title: 'User ID', value: alertPayload.userId, short: true },
            { title: 'Repository', value: alertPayload.repoUrl, short: false },
            { title: 'Category', value: alertPayload.category, short: true },
            { title: 'Recoverable', value: alertPayload.recoverable ? 'Yes' : 'No', short: true },
            { title: 'Error', value: alertPayload.message, short: false }
          ],
          timestamp: Math.floor(alertPayload.timestamp.getTime() / 1000)
        }
      ]
    });
  }
  
  /**
   * Send webhook alert
   */
  async sendWebhookAlert(alertPayload) {
    if (!this.alertChannels.webhook) return;
    
    const webhookUrl = this.alertChannels.webhook;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload)
    });
    
    if (!response.ok) {
      throw new Error(`Webhook alert failed: ${response.statusText}`);
    }
  }
  
  /**
   * Retry failed scan with exponential backoff
   */
  async retryFailedScan(scanId, retryFn) {
    const scanRecord = this.failedScans.get(scanId);
    if (!scanRecord) {
      throw new Error(`Scan ${scanId} not found in failed scans`);
    }
    
    if (scanRecord.retryCount >= this.retryConfig.maxAttempts) {
      throw new Error(`Max retry attempts (${this.retryConfig.maxAttempts}) reached for scan ${scanId}`);
    }
    
    const delay = this.retryConfig.initialDelay * Math.pow(
      this.retryConfig.backoffMultiplier,
      scanRecord.retryCount
    );
    
    await this.sleep(delay);
    
    try {
      scanRecord.retryCount++;
      const result = await retryFn();
      
      // Mark as resolved if retry succeeds
      scanRecord.resolved = true;
      this.failedScans.delete(scanId);
      this.emit('scan-recovered', { scanId, retryCount: scanRecord.retryCount });
      
      return result;
    } catch (error) {
      this.trackError({
        error,
        scanId,
        timestamp: new Date()
      });
      
      if (scanRecord.retryCount >= this.retryConfig.maxAttempts) {
        throw new Error(`Scan ${scanId} failed after ${this.retryConfig.maxAttempts} retry attempts`);
      }
      
      throw error;
    }
  }
  
  /**
   * Get error statistics
   */
  getErrorStats(timeWindowMs = 3600000) {
    const now = Date.now();
    const cutoffTime = now - timeWindowMs;
    
    const recentErrors = this.errorLog.filter(e => e.timestamp.getTime() > cutoffTime);
    
    const stats = {
      totalErrors: recentErrors.length,
      byCategory: {},
      bySeverity: {},
      byUser: {},
      errorRate: recentErrors.length / (timeWindowMs / 1000),
      timeWindow: timeWindowMs
    };
    
    recentErrors.forEach(error => {
      const { category, severity } = error.error;
      const userId = error.userId;
      
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
      stats.byUser[userId] = (stats.byUser[userId] || 0) + 1;
    });
    
    this.metrics.errorRate.labels('1h').set(stats.errorRate);
    
    return stats;
  }
  
  /**
   * Get failed scans summary
   */
  getFailedScansSummary() {
    const summary = {
      totalFailedScans: this.failedScans.size,
      scans: []
    };
    
    this.failedScans.forEach((scanRecord, scanId) => {
      summary.scans.push({
        scanId,
        errorCount: scanRecord.errors.length,
        firstErrorTime: scanRecord.firstErrorTime,
        lastErrorTime: scanRecord.lastErrorTime,
        retryCount: scanRecord.retryCount,
        resolved: scanRecord.resolved
      });
    });
    
    return summary;
  }
  
  /**
   * Resolve an error
   */
  resolveError(errorId, resolution) {
    const errorEntry = this.errorLog.find(e => e.id === errorId);
    if (!errorEntry) {
      throw new Error(`Error ${errorId} not found`);
    }
    
    errorEntry.resolved = true;
    errorEntry.status = 'resolved';
    errorEntry.resolution = resolution;
    
    this.emit('error-resolved', { errorId, resolution });
    
    return errorEntry;
  }
  
  /**
   * Clear failed scans
   */
  clearFailedScans(older) {
    if (older) {
      const cutoffTime = Date.now() - older;
      let cleared = 0;
      
      for (const [scanId, scanRecord] of this.failedScans.entries()) {
        if (scanRecord.lastErrorTime.getTime() < cutoffTime) {
          this.failedScans.delete(scanId);
          cleared++;
        }
      }
      
      return { cleared };
    } else {
      const cleared = this.failedScans.size;
      this.failedScans.clear();
      return { cleared };
    }
  }
  
  /**
   * Get error log
   */
  getErrorLog(filter = {}) {
    let logs = this.errorLog;
    
    if (filter.userId) {
      logs = logs.filter(e => e.userId === filter.userId);
    }
    
    if (filter.severity) {
      logs = logs.filter(e => e.error.severity === filter.severity);
    }
    
    if (filter.category) {
      logs = logs.filter(e => e.error.category === filter.category);
    }
    
    if (filter.resolved !== undefined) {
      logs = logs.filter(e => e.resolved === filter.resolved);
    }
    
    if (filter.limit) {
      logs = logs.slice(-filter.limit);
    }
    
    return logs;
  }
  
  /**
   * Helper methods
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    if (this.sentryDSN) {
      await Sentry.close(2000);
    }
    this.removeAllListeners();
  }
}

export default AnalysisErrorTracker;