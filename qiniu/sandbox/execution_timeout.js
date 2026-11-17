const { TimeoutError } = require('./errors');

function validateExecutionTimeout (timeoutMs) {
    if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs < 0)) {
        throw new TypeError('executionTimeoutMs must be a non-negative number');
    }
    if (timeoutMs > 2147483647) {
        throw new RangeError('executionTimeoutMs must not exceed 2147483647 milliseconds');
    }
}

// Termination has its own bounded request so a failed kill cannot leave wait pending.
function startExecutionTimeout (timeoutMs, pid, terminate, onExpire, onTimeout) {
    validateExecutionTimeout(timeoutMs);
    let expired = false;
    let timer;
    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            expired = true;
            const error = new TimeoutError('Sandbox process execution timed out', { pid, timeoutMs });
            onExpire();
            let finished = false;
            const terminationTimeoutMs = 5000;
            const terminationTimer = setTimeout(() => {
                complete(new TimeoutError('Process termination request timed out'));
            }, terminationTimeoutMs);

            function complete (killError) {
                if (finished) return;
                finished = true;
                clearTimeout(terminationTimer);
                if (killError) error.killError = killError;
                onTimeout(error);
            }

            Promise.resolve().then(() => terminate(terminationTimeoutMs))
                .then(() => complete(), complete);
        }, timeoutMs);
    }
    return {
        cancel: function () { clearTimeout(timer); },
        get expired () { return expired; }
    };
}

exports.validateExecutionTimeout = validateExecutionTimeout;
exports.startExecutionTimeout = startExecutionTimeout;
