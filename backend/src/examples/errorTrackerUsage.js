/**
 * Example: How to use AnalysisErrorTracker in your application
 * This file demonstrates integration with the analysis service
 */

import AnalysisErrorTracker from '../services/analysisErrorTracker.js';

// Mock email service for demonstration
const mockEmailService = {
  send: async ({ to, subject, text }) => {
    console.log(`📧 Email would be sent to ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text}`);
  }
};

// Initialize the error tracker
const errorTracker = new AnalysisErrorTracker({
  sentryDSN: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enableAlerting: true,
  maxLogSize: 10000,
  maxRetryAttempts: 3,
  initialRetryDelay: 1000,
  emailAlert: mockEmailService
});

// Example 1: Listen to error events in real-time
errorTracker.on('error', (errorEntry) => {
  console.log(`\n🔴 Error tracked: ${errorEntry.id}`);
  console.log(`   Scan: ${errorEntry.scanId}`);
  console.log(`   User: ${errorEntry.userId}`);
  console.log(`   Category: ${errorEntry.error.category}`);
  console.log(`   Severity: ${errorEntry.error.severity}`);
});

// Example 2: Listen to alert events
errorTracker.on('alert', (alertPayload) => {
  console.log(`\n🚨 Alert triggered: ${alertPayload.alertId}`);
  console.log(`   Severity: ${alertPayload.severity}`);
  console.log(`   Message: ${alertPayload.message}`);
});

// Example 3: Listen to scan recovery
errorTracker.on('scan-recovered', ({ scanId, retryCount }) => {
  console.log(`\n✅ Scan recovered: ${scanId} after ${retryCount} retries`);
});

// Example 4: Simulate different error scenarios
async function demonstrateErrorTracking() {
  console.log('\n====== Error Tracking Demonstration ======\n');

  // Scenario 1: Network error
  try {
    console.log('\n1️⃣  Tracking Network Error...');
    const networkError = new Error('ECONNREFUSED: Connection refused');
    networkError.code = 'ECONNREFUSED';
    
    errorTracker.trackError({
      error: networkError,
      scanId: 'scan-network-001',
      userId: 'user-john-doe',
      repoUrl: 'https://github.com/user/repo1',
      analysisType: 'full'
    });
  } catch (err) {
    console.error('Error tracking failed:', err);
  }

  // Scenario 2: Timeout error
  try {
    console.log('\n2️⃣  Tracking Timeout Error...');
    const timeoutError = new Error('Request timeout after 30 seconds');
    
    errorTracker.trackError({
      error: timeoutError,
      scanId: 'scan-timeout-002',
      userId: 'user-jane-smith',
      repoUrl: 'https://github.com/user/repo2'
    });
  } catch (err) {
    console.error('Error tracking failed:', err);
  }

  // Scenario 3: Critical storage error
  try {
    console.log('\n3️⃣  Tracking Critical Storage Error...');
    const storageError = new Error('ENOSPC: No space left on device');
    
    errorTracker.trackError({
      error: storageError,
      scanId: 'scan-storage-003',
      userId: 'user-alice-wonder',
      repoUrl: 'https://github.com/user/repo3'
    });
  } catch (err) {
    console.error('Error tracking failed:', err);
  }

  // Scenario 4: Authentication error
  try {
    console.log('\n4️⃣  Tracking Authentication Error...');
    const authError = new Error('Unauthorized: Invalid API token');
    authError.code = 401;
    
    errorTracker.trackError({
      error: authError,
      scanId: 'scan-auth-004',
      userId: 'user-bob-builder',
      repoUrl: 'https://github.com/user/repo4'
    });
  } catch (err) {
    console.error('Error tracking failed:', err);
  }

  // Give async operations time to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  // Display statistics
  console.log('\n====== Error Statistics ======\n');
  const stats = errorTracker.getErrorStats(360000000); // 1 hour window
  console.log(`Total Errors: ${stats.totalErrors}`);
  console.log(`\nBy Severity:`, stats.bySeverity);
  console.log(`\nBy Category:`, stats.byCategory);
  console.log(`\nBy User:`, stats.byUser);
  console.log(`\nError Rate: ${stats.errorRate.toFixed(2)} errors/second`);

  // Display failed scans
  console.log('\n====== Failed Scans Summary ======\n');
  const failedScans = errorTracker.getFailedScansSummary();
  console.log(`Total Failed Scans: ${failedScans.totalFailedScans}`);
  console.log('\nFailed Scans Details:');
  failedScans.scans.forEach(scan => {
    console.log(`  - ${scan.scanId}: ${scan.errorCount} error(s)`);
  });

  // Display error log with filters
  console.log('\n====== Filtered Error Logs ======\n');
  const criticalErrors = errorTracker.getErrorLog({ severity: 'critical' });
  console.log(`Critical Severity Errors (${criticalErrors.length}):`);
  criticalErrors.forEach(err => {
    console.log(`  - ${err.error.category}: ${err.error.message}`);
  });

  const user1Errors = errorTracker.getErrorLog({ userId: 'user-john-doe' });
  console.log(`\nErrors for user-john-doe (${user1Errors.length}):`);
  user1Errors.forEach(err => {
    console.log(`  - ${err.error.category}: ${err.error.message}`);
  });
}

// Example 5: Retry mechanism with exponential backoff
async function demonstrateRetryMechanism() {
  console.log('\n====== Retry Mechanism Demonstration ======\n');

  const retryTracker = new AnalysisErrorTracker({
    enableAlerting: false,
    maxRetryAttempts: 3,
    initialRetryDelay: 500,
    backoffMultiplier: 2
  });

  // Simulate a failed scan
  const tempError = new Error('Temporary connection issue');
  retryTracker.trackError({
    error: tempError,
    scanId: 'scan-retry-001',
    userId: 'user-test',
    repoUrl: 'https://github.com/test/repo'
  });

  console.log('Attempting to retry failed scan...');

  // Simulate retry logic
  let retryCount = 0;
  const simulatedRetry = async () => {
    retryCount++;
    console.log(`Retry attempt ${retryCount}...`);
    
    if (retryCount < 3) {
      throw new Error('Still experiencing issues');
    }
    
    return { success: true, data: 'Scan completed successfully' };
  };

  try {
    const result = await retryTracker.retryFailedScan('scan-retry-001', simulatedRetry);
    console.log(`✅ Retry successful!`);
    console.log(`Result: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`❌ Retry failed: ${err.message}`);
  }
}

// Example 6: Error resolution workflow
async function demonstrateErrorResolution() {
  console.log('\n====== Error Resolution Workflow ======\n');

  const tracker = new AnalysisErrorTracker({ enableAlerting: false });

  // Track an error
  const errorId = tracker.trackError({
    error: new Error('Sample error for resolution'),
    scanId: 'scan-resolve-001',
    userId: 'user-support',
    repoUrl: 'https://github.com/test/repo'
  });

  console.log(`\n📝 Error tracked with ID: ${errorId}`);
  console.log(`   Status: ${tracker.errorLog[0].status}`);
  console.log(`   Resolved: ${tracker.errorLog[0].resolved}`);

  // Resolve the error
  const resolved = tracker.resolveError(errorId, 'Fixed in version 2.1.0');
  console.log(`\n✅ Error resolved`);
  console.log(`   Status: ${resolved.status}`);
  console.log(`   Resolved: ${resolved.resolved}`);
  console.log(`   Resolution: ${resolved.resolution}`);
}

// Run demonstrations
async function runAllExamples() {
  try {
    await demonstrateErrorTracking();
    await demonstrateRetryMechanism();
    await demonstrateErrorResolution();
    
    console.log('\n✅ All demonstrations completed!');
  } catch (err) {
    console.error('Error running examples:', err);
  } finally {
    // Graceful shutdown
    await errorTracker.shutdown();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export { errorTracker, demonstrateErrorTracking, demonstrateRetryMechanism, demonstrateErrorResolution };