// Connect timeouts contain at most ten decimal digits.
function executionTimeoutHeaders (procedure, timeoutMs) {
    if (timeoutMs === undefined) return {};
    if (procedure !== '/process.Process/Start') {
        throw new TypeError('executionTimeoutMs can only be set when starting a process');
    }
    if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs < 0 || Math.floor(timeoutMs) !== timeoutMs) {
        throw new TypeError('executionTimeoutMs must be a non-negative integer');
    }
    if (timeoutMs > 9999999999) {
        throw new RangeError('executionTimeoutMs must not exceed 9999999999 milliseconds');
    }
    // A literal zero header expires the RPC before the handler runs.
    return timeoutMs === 0 ? {} : { 'Connect-Timeout-Ms': String(timeoutMs) };
}

exports.executionTimeoutHeaders = executionTimeoutHeaders;
