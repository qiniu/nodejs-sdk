/**
 * @typedef RetryPolicyContext
 * @property {any} result
 * @property {Error | null} error
 * @property {boolean} retried
 * @property {...any}
 */

/**
 * @class
 * @constructor
 */
function RetryPolicy () {
}

/**
 * @param {RetryPolicyContext} _context
 * @returns {boolean}
 */
RetryPolicy.prototype.isImportant = function (_context) {
    return false;
};

/**
 * @abstract
 * @param {RetryPolicyContext} _context
 * @returns {Promise<void>}
 */
RetryPolicy.prototype.initContext = function (_context) {
    throw new Error('Method not implemented.');
};

/**
 * @abstract
 * @param {RetryPolicyContext} _context
 * @returns {boolean}
 */
RetryPolicy.prototype.shouldRetry = function (_context) {
    throw new Error('Method not implemented.');
};

/**
 * @abstract
 * @param {RetryPolicyContext} _context
 * @returns {Promise<void>}
 */
RetryPolicy.prototype.prepareRetry = function (_context) {
    throw new Error('Method not implemented.');
};

RetryPolicy.prototype.afterRetry = function () {
    return Promise.resolve();
};

exports.RetryPolicy = RetryPolicy;
