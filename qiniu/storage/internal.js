// internal
// DO NOT use this file, unless you know what you're doing.
// Because its API may make broken change for internal usage.

const { RetryPolicy } = require('../retry');

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
 * @param {function} options.recordDeleteHandler
 * @param {function} options.recordExistsHandler
 * @param {number} [options.maxRetryTimes]
 * @constructor
 */
function TokenExpiredRetryPolicy (options) {
    this.id = Symbol(this.constructor.name);
    this.uploadApiVersion = options.uploadApiVersion;
    this.recordDeleteHandler = options.recordDeleteHandler;
    this.recordExistsHandler = options.recordExistsHandler;
    this.maxRetryTimes = options.maxRetryTimes || 1;
}

TokenExpiredRetryPolicy.prototype = Object.create(RetryPolicy.prototype);
TokenExpiredRetryPolicy.prototype.constructor = TokenExpiredRetryPolicy;

/**
 * @param {Object} context
 * @returns {Promise<void>}
 */
TokenExpiredRetryPolicy.prototype.initContext = function (context) {
    context[this.id] = {
        retriedTimes: 0,
        uploadApiVersion: this.uploadApiVersion
    };
    return Promise.resolve();
};

/**
 * @param {Object} context
 * @returns {boolean}
 */
TokenExpiredRetryPolicy.prototype.shouldRetry = function (context) {
    const {
        retriedTimes,
        uploadApiVersion
    } = context[this.id];

    if (
        retriedTimes >= this.maxRetryTimes ||
        !this.recordExistsHandler()
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
    return new Promise(resolve => {
        if (!this.recordExistsHandler()) {
            resolve();
            return;
        }
        this.recordDeleteHandler();
        resolve();
    });
};

exports.TokenExpiredRetryPolicy = TokenExpiredRetryPolicy;

/**
 * @class
 * @extends RetryPolicy
 * @constructor
 */
function AccUnavailableRetryPolicy () {
}

AccUnavailableRetryPolicy.prototype = Object.create(RetryPolicy.prototype);
AccUnavailableRetryPolicy.prototype.constructor = AccUnavailableRetryPolicy;

AccUnavailableRetryPolicy.prototype.initContext = function (context) {
    return Promise.resolve();
};

AccUnavailableRetryPolicy.prototype.isAccNotAvailable = function (context) {
    try {
        return context.result.resp.statusCode === 400 &&
            context.result.resp.data.error.includes('transfer acceleration is not configured on this bucket');
    } catch (_err) {
        return false;
    }
};

AccUnavailableRetryPolicy.prototype.shouldRetry = function (context) {
    if (!context.result) {
        return false;
    }
    if (!context.alternativeServiceNames.length) {
        return false;
    }
    const [nextServiceName] = context.alternativeServiceNames;
    if (
        !context.region.services[nextServiceName] ||
        !context.region.services[nextServiceName].length
    ) {
        return false;
    }
    return this.isAccNotAvailable(context);
};

AccUnavailableRetryPolicy.prototype.prepareRetry = function (context) {
    if (!context.alternativeServiceNames.length) {
        return Promise.reject(new Error(
            'No alternative service available.'
        ));
    }

    context.serviceName = context.alternativeServiceNames.shift();
    [context.endpoint, ...context.alternativeEndpoints] = context.region.services[context.serviceName];
    if (!context.endpoint) {
        return Promise.reject(new Error(
            'No alternative endpoint available.'
        ));
    }

    return Promise.resolve();
};

exports.AccUnavailableRetryPolicy = AccUnavailableRetryPolicy;

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
 * @returns {(function(...[*]): (*|undefined))|*}
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

/**
 * Compatible with callback style
 * Could be removed when make break changes.
 */
function handleReqCallback (responseWrapperPromise, callbackFunc) {
    if (typeof callbackFunc !== 'function') {
        return;
    }
    const wrappedCallback = wrapTryCallback(callbackFunc);
    responseWrapperPromise
        .then(({ data, resp }) => {
            wrappedCallback(null, data, resp);
        })
        .catch(err => {
            wrappedCallback(err, null, err.resp);
        });
}

exports.handleReqCallback = handleReqCallback;
