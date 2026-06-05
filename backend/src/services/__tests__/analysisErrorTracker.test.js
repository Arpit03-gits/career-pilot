import { test } from 'node:test';
import assert from 'node:assert';
import AnalysisErrorTracker from '../analysisErrorTracker.js';

test('AnalysisErrorTracker - Error Categorization', async (t) => {
  const tracker = new AnalysisErrorTracker({ enableAlerting: false });
  
  await t.test('should categorize network errors', () => {
    const error = new Error('ECONNREFUSED');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'NETWORK_ERROR');
  });
  
  await t.test('should categorize timeout errors', () => {
    const error = new Error('Request timeout');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'TIMEOUT_ERROR');
  });
  
  await t.test('should categorize parse errors', () => {
    const error = new Error('JSON parse error');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'PARSE_ERROR');
  });
  
  await t.test('should categorize auth errors', () => {
    const error = new Error('Unauthorized access');
    error.code = 401;
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'AUTH_ERROR');
  });
  
  await t.test('should categorize permission errors', () => {
    const error = new Error('EACCES permission denied');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'PERMISSION_ERROR');
  });
  
  await t.test('should categorize storage errors', () => {
    const error = new Error('ENOSPC disk full');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'STORAGE_ERROR');
  });
  
  await t.test('should categorize validation errors', () => {
    const error = new Error('validation schema error');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'VALIDATION_ERROR');
  });
  
  await t.test('should default to unknown errors', () => {
    const error = new Error('Some random error');
    const category = tracker.categorizeError(error);
    assert.strictEqual(category, 'UNKNOWN_ERROR');
  });
});

test('AnalysisErrorTracker - Error Tracking', async (t) => {
  await t.test('should track errors with proper metadata', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    const errorId = tracker.trackError({
      error,
      scanId: 'scan-123',
      userId: 'user-456',
      repoUrl: 'https://github.com/test/repo'
    });
    
    assert(errorId);
    assert.strictEqual(tracker.errorLog.length, 1);
    assert.strictEqual(tracker.errorLog[0].scanId, 'scan-123');
    assert.strictEqual(tracker.errorLog[0].userId, 'user-456');
    assert.strictEqual(tracker.errorLog[0].error.message, 'Test error');
  });
  
  await t.test('should track failed scans', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Scan failed');
    
    tracker.trackError({
      error,
      scanId: 'scan-789',
      userId: 'user-456'
    });
    
    const summary = tracker.getFailedScansSummary();
    assert.strictEqual(summary.totalFailedScans, 1);
    assert.strictEqual(summary.scans[0].scanId, 'scan-789');
    assert.strictEqual(summary.scans[0].errorCount, 1);
  });
  
  await t.test('should maintain error log size limit', () => {
    const tracker = new AnalysisErrorTracker({ 
      enableAlerting: false,
      maxLogSize: 5
    });
    
    for (let i = 0; i < 10; i++) {
      tracker.trackError({
        error: new Error(`Error ${i}`),
        scanId: `scan-${i}`,
        userId: 'user-1'
      });
    }
    
    assert.strictEqual(tracker.errorLog.length, 5);
  });
});

test('AnalysisErrorTracker - Error Statistics', async (t) => {
  await t.test('should calculate error statistics', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error1 = new Error('timeout');
    const error2 = new Error('ECONNREFUSED');
    
    tracker.trackError({ error: error1, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error: error2, scanId: 'scan-2', userId: 'user-1' });
    
    const stats = tracker.getErrorStats(360000000);
    assert.strictEqual(stats.totalErrors, 2);
    assert(stats.byCategory['TIMEOUT_ERROR'] > 0);
    assert.strictEqual(stats.byUser['user-1'], 2);
  });
  
  await t.test('should track errors by severity', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const criticalError = new Error('ENOSPC');
    const mediumError = new Error('timeout');
    
    tracker.trackError({ error: criticalError, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error: mediumError, scanId: 'scan-2', userId: 'user-1' });
    
    const stats = tracker.getErrorStats(360000000);
    assert(stats.bySeverity['critical'] > 0);
    assert(stats.bySeverity['high'] > 0);
  });
});

test('AnalysisErrorTracker - Error Resolution', async (t) => {
  await t.test('should resolve errors', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    const errorId = tracker.trackError({
      error,
      scanId: 'scan-123',
      userId: 'user-456'
    });
    
    const resolved = tracker.resolveError(errorId, 'Fixed manually');
    assert.strictEqual(resolved.resolved, true);
    assert.strictEqual(resolved.status, 'resolved');
    assert.strictEqual(resolved.resolution, 'Fixed manually');
  });
  
  await t.test('should throw error when resolving non-existent error', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    assert.throws(() => {
      tracker.resolveError('non-existent-id', 'resolution');
    });
  });
});

test('AnalysisErrorTracker - Error Filtering', async (t) => {
  await t.test('should filter errors by severity', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const criticalError = new Error('ENOSPC');
    const mediumError = new Error('timeout');
    
    tracker.trackError({ error: criticalError, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error: mediumError, scanId: 'scan-2', userId: 'user-1' });
    
    const criticalOnly = tracker.getErrorLog({ severity: 'critical' });
    assert.strictEqual(criticalOnly.length, 1);
    assert.strictEqual(criticalOnly[0].error.severity, 'critical');
  });
  
  await t.test('should filter errors by user', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    tracker.trackError({ error, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error, scanId: 'scan-2', userId: 'user-2' });
    
    const user1Errors = tracker.getErrorLog({ userId: 'user-1' });
    assert.strictEqual(user1Errors.length, 1);
    assert.strictEqual(user1Errors[0].userId, 'user-1');
  });
  
  await t.test('should filter errors by category', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const networkError = new Error('ECONNREFUSED');
    const timeoutError = new Error('timeout');
    
    tracker.trackError({ error: networkError, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error: timeoutError, scanId: 'scan-2', userId: 'user-1' });
    
    const networkErrors = tracker.getErrorLog({ category: 'NETWORK_ERROR' });
    assert.strictEqual(networkErrors.length, 1);
    assert.strictEqual(networkErrors[0].error.category, 'NETWORK_ERROR');
  });
  
  await t.test('should filter by resolved status', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    const errorId = tracker.trackError({ error, scanId: 'scan-1', userId: 'user-1' });
    
    tracker.trackError({ error, scanId: 'scan-2', userId: 'user-1' });
    tracker.resolveError(errorId, 'fixed');
    
    const unresolved = tracker.getErrorLog({ resolved: false });
    assert.strictEqual(unresolved.length, 1);
  });
  
  await t.test('should limit results', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    
    for (let i = 0; i < 10; i++) {
      tracker.trackError({ error, scanId: `scan-${i}`, userId: 'user-1' });
    }
    
    const limited = tracker.getErrorLog({ limit: 3 });
    assert.strictEqual(limited.length, 3);
  });
});

test('AnalysisErrorTracker - Retry Logic', async (t) => {
  await t.test('should retry failed scans', async () => {
    const tracker = new AnalysisErrorTracker({ 
      enableAlerting: false,
      maxRetryAttempts: 3,
      initialRetryDelay: 10
    });
    
    const error = new Error('Temporary failure');
    const scanId = 'scan-retry';
    
    tracker.trackError({ error, scanId, userId: 'user-1' });
    
    let attempts = 0;
    const retryFn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('Still failing');
      }
      return 'Success';
    };
    
    const result = await tracker.retryFailedScan(scanId, retryFn);
    assert.strictEqual(result, 'Success');
    assert.strictEqual(attempts, 2);
  });
  
  await t.test('should throw after max retry attempts', async () => {
    const tracker = new AnalysisErrorTracker({ 
      enableAlerting: false,
      maxRetryAttempts: 2,
      initialRetryDelay: 10
    });
    
    const error = new Error('Persistent failure');
    const scanId = 'scan-retry';
    
    tracker.trackError({ error, scanId, userId: 'user-1' });
    
    const retryFn = async () => {
      throw new Error('Always fails');
    };
    
    try {
      await tracker.retryFailedScan(scanId, retryFn);
      assert.fail('Should have thrown');
    } catch (err) {
      assert(err.message.includes('failed after'));
    }
  });
});

test('AnalysisErrorTracker - Clear Failed Scans', async (t) => {
  await t.test('should clear all failed scans', () => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    const error = new Error('Test error');
    
    tracker.trackError({ error, scanId: 'scan-1', userId: 'user-1' });
    tracker.trackError({ error, scanId: 'scan-2', userId: 'user-1' });
    
    assert.strictEqual(tracker.getFailedScansSummary().totalFailedScans, 2);
    
    const cleared = tracker.clearFailedScans();
    assert.strictEqual(cleared.cleared, 2);
    assert.strictEqual(tracker.getFailedScansSummary().totalFailedScans, 0);
  });
});

test('AnalysisErrorTracker - Event Emission', async (t) => {
  await t.test('should emit error events', (t, done) => {
    const tracker = new AnalysisErrorTracker({ enableAlerting: false });
    
    tracker.on('error', (errorEntry) => {
      assert(errorEntry.id);
      assert.strictEqual(errorEntry.scanId, 'scan-123');
      done();
    });
    
    const error = new Error('Test error');
    tracker.trackError({ error, scanId: 'scan-123', userId: 'user-1' });
  });
  
  await t.test('should emit scan-recovered events', async (t) => {
    const tracker = new AnalysisErrorTracker({ 
      enableAlerting: false,
      initialRetryDelay: 10
    });
    
    const error = new Error('Temporary failure');
    tracker.trackError({ error, scanId: 'scan-123', userId: 'user-1' });
    
    let recoveryEmitted = false;
    tracker.on('scan-recovered', () => {
      recoveryEmitted = true;
    });
    
    await tracker.retryFailedScan('scan-123', async () => 'Success');
    assert(recoveryEmitted);
  });
});