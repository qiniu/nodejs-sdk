// internal
// DO NOT use this file, unless you know what you're doing.
// Because its API may make broken change for internal usage.

const fs = require('fs');

const { RetryPolicy } = require('../retry');

exports.TokenExpiredRetryPolicy = TokenExpiredRetryPolicy;
exports.wrapTryCallback = wrapTryCallback;

// --- split to files --- //
/**
 * @typedef {RetryPolicyContext} TokenExpiredRetryPolicyContext
 * @property {string} resumeRecordFilePath
 * @property {'v1' | 'v2' | string} uploadApiVersion
 */

/**
 * @class
 * @extends RetryPolicy
 * @param {Object} options
 * @param {string} options.uploadApiVersion
 * @param {string} options.resumeRecordFilePath
 * @param {number} [options.maxRetryTimes]
 * @constructor
 */
function TokenExpiredRetryPolicy (options) {
    this.id = Symbol(this.constructor.name);
    this.uploadApiVersion = options.uploadApiVersion;
    this.resumeRecordFilePath = options.resumeRecordFilePath;
    this.maxRetryTimes = options.maxRetryTimes || 1;
}

TokenExpiredRetryPolicy.prototype = Object.create(RetryPolicy.prototype);
TokenExpiredRetryPolicy.prototype.constructor = TokenExpiredRetryPolicy;

/**
 * @param {string} resumeRecordFilePath
 * @returns {boolean}
 */
TokenExpiredRetryPolicy.prototype.isResumedUpload = function (resumeRecordFilePath) {
    if (!resumeRecordFilePath) {
        return false;
    }
    return fs.existsSync(resumeRecordFilePath);
};

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
TokenExpiredRetryPolicy.prototype.initContext = function (context) {
    context[this.id] = {
        retriedTimes: 0,
        uploadApiVersion: this.uploadApiVersion,
        resumeRecordFilePath: this.resumeRecordFilePath
    };
    return Promise.resolve();
};

/**
 * @param {Object} context
 * @return {boolean}
 */
TokenExpiredRetryPolicy.prototype.shouldRetry = function (context) {
    const {
        retriedTimes,
        uploadApiVersion,
        resumeRecordFilePath
    } = context[this.id];

    if (
        retriedTimes >= this.maxRetryTimes ||
        !this.isResumedUpload(resumeRecordFilePath)
    ) {
        return false;
    }

    if (!context.result) {
        return false;
    }

    if (uploadApiVersion === 'v1' &&
        context.result.resp.statusCode === 701
    ) {
        return true;
    }

    if (uploadApiVersion === 'v2' &&
        context.result.resp.statusCode === 612
    ) {
        return true;
    }

    return false;
};

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
TokenExpiredRetryPolicy.prototype.prepareRetry = function (context) {
    context[this.id].retriedTimes += 1;
    const resumeRecordFilePath = context[this.id].resumeRecordFilePath;
    return new Promise(resolve => {
        if (!resumeRecordFilePath) {
            resolve();
            return;
        }
        fs.unlink(resumeRecordFilePath, _err => {
            resolve();
        });
    });
};

/**
 * @param {Error} err
 * @param {string} msg
 */
function getNoNeedRetryError (err, msg) {
    err.message = msg + '\n' + err.message;
    err.noNeedRetry = true;
    return err;
}
exports.getNoNeedRetryError = getNoNeedRetryError;

/**
 * @param fn
 * @return {(function(...[*]): (*|undefined))|*}
 */
function wrapTryCallback (fn) {
    if (typeof fn !== 'function') {
        return () => {};
    }
    return (...args) => {
        try {
            return fn(...args);
        } catch (err) {
            console.warn(
                'WARNING:\n' +
                'qiniu SDK will migrate API to Promise style gradually.\n' +
                'The callback style will not be removed for now,\n' +
                'but you should catch your error in your callback function itself'
            );
            console.error(err);
        }
    };
}
