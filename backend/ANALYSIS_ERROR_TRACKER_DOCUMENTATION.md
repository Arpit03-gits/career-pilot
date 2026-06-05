# Analysis Error Tracker & Alerting System

## Overview

The `AnalysisErrorTracker` is a comprehensive error tracking and alerting system designed to monitor, categorize, and respond to failed analysis scans in the Career Pilot backend. It provides real-time error monitoring, automated alerting, retry mechanisms, and detailed analytics.

## Features

### 🔴 Error Categorization
- **Network Errors**: Connection refused, DNS failures
- **Timeout Errors**: Request timeouts
- **Parse Errors**: JSON/XML parsing failures
- **Validation Errors**: Schema or input validation failures
- **Auth Errors**: Authentication and authorization failures
- **Storage Errors**: Disk space or database issues
- **Permission Errors**: Access control violations
- **Unknown Errors**: Uncategorized errors

Each error is assigned a severity level (critical, high, medium, low) and recovery capability indicator.

### 📊 Metrics & Analytics
- Real-time error counting with Prometheus metrics
- Error distribution by category, severity, and user
- Error rate calculation with configurable time windows
- Failed scans tracking and history
- Performance metrics for analysis operations

### 🚨 Multi-Channel Alerting
- **Email Alerts**: Detailed error information
- **Slack Integration**: Real-time notifications with color-coded severity
- **Webhook Support**: Custom integration endpoints

### 🔄 Retry & Recovery
- Exponential backoff strategy
- Configurable retry attempts (default: 3)
- Automatic retry delay calculation
- Recovery tracking and event emission

### 📝 Comprehensive Logging
- Immutable error audit trail
- Configurable log size limits
- Advanced filtering capabilities
- Error resolution tracking

### 🔗 Sentry Integration
- Automatic error reporting to Sentry
- Contextual information attachment
- Severity-based issue grouping
- Stack trace preservation

## Installation

### 1. Add Dependencies

```bash
npm install @sentry/node
```

### 2. Environment Variables

Create or update your `.env` file:

```env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NODE_ENV=production
ALERT_EMAIL=admin@example.com
```

## Usage

### Basic Initialization

```javascript
import AnalysisErrorTracker from './services/analysisErrorTracker.js';

const errorTracker = new AnalysisErrorTracker({
  sentryDSN: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enableAlerting: true
});
```

### Advanced Configuration

```javascript
const errorTracker = new AnalysisErrorTracker({
  sentryDSN: process.env.SENTRY_DSN,
  environment: 'production',
  enableAlerting: true,
  maxLogSize: 10000,
  maxRetryAttempts: 3,
  initialRetryDelay: 1000, // milliseconds
  backoffMultiplier: 2,
  tracesSampleRate: 0.1,
  emailAlert: mailService,
  slackAlert: slackService,
  webhookAlert: 'https://your-webhook-url.com/errors',
  alertThreshold: {
    critical: 1,  // Alert after 1 critical error
    high: 5,      // Alert after 5 high-severity errors
    medium: 10    // Alert after 10 medium-severity errors
  }
});
```

## API Reference

### Core Methods

#### `trackError(errorContext)`

Track an error from a failed scan.

**Parameters:**
```javascript
const errorId = errorTracker.trackError({
  error: Error,           // The error object
  scanId: string,         // Unique scan identifier
  userId: string,         // User performing the scan
  repoUrl: string,        // Repository URL
  analysisType: string,   // Type of analysis (default: 'full')
  timestamp: Date         // Error timestamp (default: now)
});
```

**Returns:** `string` - Unique error ID

**Example:**
```javascript
try {
  await analyzeRepository(repoUrl);
} catch (error) {
  const errorId = errorTracker.trackError({
    error,
    scanId: 'scan-12345',
    userId: 'user-67890',
    repoUrl: 'https://github.com/user/repo'
  });
  console.log(`Error tracked: ${errorId}`);
}
```

#### `retryFailedScan(scanId, retryFn)`

Retry a failed scan with exponential backoff.

**Parameters:**
```javascript
const result = await errorTracker.retryFailedScan(
  'scan-id',
  async () => {
    // Your retry logic here
    return await analyzeRepository(repoUrl);
  }
);
```

**Returns:** `Promise<any>` - Result of successful retry

**Throws:** Error if max attempts exceeded

**Example:**
```javascript
try {
  const result = await errorTracker.retryFailedScan(scanId, async () => {
    return await analyzeRepository(repoUrl);
  });
  console.log('Scan succeeded:', result);
} catch (error) {
  console.error('Scan failed after retries:', error);
}
```

#### `getErrorStats(timeWindowMs)`

Get error statistics for a time window.

**Parameters:**
- `timeWindowMs` (number, default: 3600000): Time window in milliseconds

**Returns:** Object with error statistics
```javascript
{
  totalErrors: number,
  byCategory: { [category]: count },
  bySeverity: { [severity]: count },
  byUser: { [userId]: count },
  errorRate: number,
  timeWindow: number
}
```

**Example:**
```javascript
const hourlyStats = errorTracker.getErrorStats(3600000); // 1 hour
console.log(`Errors in last hour: ${hourlyStats.totalErrors}`);
console.log(`Error rate: ${hourlyStats.errorRate} errors/second`);
```

#### `getFailedScansSummary()`

Get summary of currently failed scans.

**Returns:** Object with failed scans information
```javascript
{
  totalFailedScans: number,
  scans: [
    {
      scanId: string,
      errorCount: number,
      firstErrorTime: Date,
      lastErrorTime: Date,
      retryCount: number,
      resolved: boolean
    }
  ]
}
```

**Example:**
```javascript
const summary = errorTracker.getFailedScansSummary();
console.log(`Failed scans: ${summary.totalFailedScans}`);
summary.scans.forEach(scan => {
  console.log(`${scan.scanId}: ${scan.errorCount} errors`);
});
```

#### `getErrorLog(filter)`

Retrieve error logs with optional filtering.

**Parameters:**
```javascript
const errors = errorTracker.getErrorLog({
  userId: string,      // Optional: filter by user
  severity: string,    // Optional: 'critical', 'high', 'medium', 'low'
  category: string,    // Optional: error category
  resolved: boolean,   // Optional: true/false
  limit: number        // Optional: limit results
});
```

**Returns:** Array of error entries

**Example:**
```javascript
// Get all unresolved critical errors
const critical = errorTracker.getErrorLog({
  severity: 'critical',
  resolved: false
});

// Get last 10 errors for a user
const userErrors = errorTracker.getErrorLog({
  userId: 'user-123',
  limit: 10
});
```

#### `resolveError(errorId, resolution)`

Mark an error as resolved.

**Parameters:**
```javascript
const resolved = errorTracker.resolveError(
  'err_1234567890_abc123',
  'Fixed in version 2.1.0'
);
```

**Returns:** Resolved error entry

**Example:**
```javascript
try {
  const error = errorTracker.resolveError(errorId, 'Manual fix applied');
  console.log(`Error resolved: ${error.resolution}`);
} catch (error) {
  console.error('Error not found');
}
```

#### `clearFailedScans(older)`

Clear failed scans from tracking.

**Parameters:**
- `older` (number, optional): Only clear scans older than this time in milliseconds

**Returns:** Object with count of cleared scans

**Example:**
```javascript
// Clear all failed scans
const result = errorTracker.clearFailedScans();
console.log(`Cleared ${result.cleared} scans`);

// Clear scans older than 24 hours
const dayInMs = 24 * 60 * 60 * 1000;
const result = errorTracker.clearFailedScans(dayInMs);
```

#### `shutdown()`

Gracefully shutdown the error tracker and close Sentry connection.

**Example:**
```javascript
process.on('SIGTERM', async () => {
  await errorTracker.shutdown();
  process.exit(0);
});
```

### Event Listeners

#### `'error'` Event

Emitted when an error is tracked.

```javascript
errorTracker.on('error', (errorEntry) => {
  console.log(`Error ${errorEntry.id} tracked`);
  console.log(`Category: ${errorEntry.error.category}`);
  console.log(`Severity: ${errorEntry.error.severity}`);
});
```

#### `'alert'` Event

Emitted when an alert is triggered.

```javascript
errorTracker.on('alert', (alertPayload) => {
  console.log(`Alert triggered: ${alertPayload.alertId}`);
  console.log(`Message: ${alertPayload.message}`);
});
```

#### `'scan-recovered'` Event

Emitted when a scan is successfully recovered via retry.

```javascript
errorTracker.on('scan-recovered', ({ scanId, retryCount }) => {
  console.log(`Scan ${scanId} recovered after ${retryCount} retries`);
});
```

#### `'error-resolved'` Event

Emitted when an error is manually resolved.

```javascript
errorTracker.on('error-resolved', ({ errorId, resolution }) => {
  console.log(`Error ${errorId} resolved: ${resolution}`);
});
```

## Integration Examples

### With Analysis Service

```javascript
import AnalysisErrorTracker from './services/analysisErrorTracker.js';
import { analyzeRepo } from './analysisService.js';

const errorTracker = new AnalysisErrorTracker({
  sentryDSN: process.env.SENTRY_DSN,
  enableAlerting: true
});

export async function analyzeRepositoryWithTracking(repoUrl, userId) {
  const scanId = generateScanId();
  
  try {
    const result = await analyzeRepo(repoUrl);
    return result;
  } catch (error) {
    // Track the error
    const errorId = errorTracker.trackError({
      error,
      scanId,
      userId,
      repoUrl
    });
    
    // Attempt recovery for transient errors
    if (error.message.includes('timeout') || error.code === 'ECONNREFUSED') {
      try {
        return await errorTracker.retryFailedScan(scanId, () => analyzeRepo(repoUrl));
      } catch (retryError) {
        throw new Error(`Analysis failed after retries: ${retryError.message}`);
      }
    }
    
    throw error;
  }
}
```

### With Express Routes

```javascript
import express from 'express';
import AnalysisErrorTracker from './services/analysisErrorTracker.js';

const router = express.Router();
const errorTracker = new AnalysisErrorTracker({
  sentryDSN: process.env.SENTRY_DSN
});

router.post('/analyze', async (req, res, next) => {
  const { repoUrl, userId } = req.body;
  
  try {
    // Your analysis logic here
  } catch (error) {
    const errorId = errorTracker.trackError({
      error,
      scanId: req.id,
      userId,
      repoUrl
    });
    
    res.status(500).json({
      error: error.message,
      errorId,
      reportedAt: new Date()
    });
  }
});

router.get('/errors/stats', (req, res) => {
  const stats = errorTracker.getErrorStats();
  res.json(stats);
});

router.get('/errors/failed-scans', (req, res) => {
  const summary = errorTracker.getFailedScansSummary();
  res.json(summary);
});
```

## Error Categories Reference

| Category | Severity | Recoverable | Example |
|----------|----------|-------------|----------|
| NETWORK_ERROR | High | Yes | Connection refused, DNS failure |
| TIMEOUT_ERROR | High | Yes | Request timeout |
| PARSE_ERROR | Medium | No | JSON parsing error |
| VALIDATION_ERROR | Medium | No | Schema validation error |
| AUTH_ERROR | High | No | Invalid credentials |
| STORAGE_ERROR | Critical | No | Disk full, database error |
| PERMISSION_ERROR | High | No | Access denied |
| UNKNOWN_ERROR | Medium | No | Unclassified error |

## Metrics

The error tracker exports the following Prometheus metrics:

- `analysis_errors_total`: Counter of total errors by severity and category
- `analysis_failed_scans`: Gauge of current failed scans count
- `analysis_scan_duration_seconds`: Histogram of scan duration
- `analysis_error_rate`: Gauge of error rate per time window

## Testing

Run the unit tests:

```bash
npm test -- backend/src/services/__tests__/analysisErrorTracker.test.js
```

Test coverage includes:
- ✅ Error categorization (8 types)
- ✅ Error tracking and metadata
- ✅ Error statistics and filtering
- ✅ Error resolution workflow
- ✅ Retry mechanism with backoff
- ✅ Event emission
- ✅ Failed scans tracking
- ✅ Log size management

## Best Practices

1. **Always provide context**: Include userId, scanId, and repoUrl for better analysis
2. **Listen to events**: Subscribe to error and alert events for real-time monitoring
3. **Review statistics regularly**: Use getErrorStats() for trend analysis
4. **Resolve errors manually**: Mark errors as resolved when issues are fixed
5. **Clear old scans**: Periodically clear resolved failed scans
6. **Configure alerts appropriately**: Set threshold values based on your requirements
7. **Use Sentry for debugging**: Leverage Sentry's web interface for detailed analysis
8. **Test retry logic**: Ensure retry functions are idempotent

## Troubleshooting

### Alerts not being sent
- Verify Sentry DSN is correctly set
- Check email/Slack service configuration
- Ensure error severity triggers alerting (critical or non-recoverable)

### High error rate
- Review error statistics: `errorTracker.getErrorStats()`
- Check logs by category: `errorTracker.getErrorLog({ category: 'NETWORK_ERROR' })`
- Look for patterns by user: `errorTracker.getErrorLog({ userId: 'user-id' })`

### Memory usage growing
- Check maxLogSize configuration
- Clear old failed scans: `errorTracker.clearFailedScans(olderThanMs)`
- Review retained error entries

## Contributing

To contribute improvements to the error tracker:

1. Add tests for new features
2. Update documentation
3. Ensure backward compatibility
4. Follow existing code style

## License

This feature is part of Career Pilot and follows the same license.
