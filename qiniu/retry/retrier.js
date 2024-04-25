/**
 * @class
 * @param {RetryPolicy[]} options.retryPolicies
 * @param {function(RetryPolicyContext, RetryPolicy | undefined): Promise<boolean>} [options.onBeforeRetry]
 * @constructor
 */
function Retrier (options) {
    this.retryPolicies = options.retryPolicies || [];
    this.onBeforeRetry = options.onBeforeRetry;
}

Retrier.prototype.initContext = function () {
    const context = {
        error: null,
        retried: false
    };
    return this.retryPolicies.reduce(
        (promiseChain, retryPolicy) =>
            promiseChain.then(() =>
                retryPolicy.initContext(context))
        ,
        Promise.resolve()
    )
        .then(() => context);
};

Retrier.prototype._afterRetry = function (context) {
    return this.retryPolicies.reduce(
        (promiseChain, retryPolicy) =>
            promiseChain.then(() =>
                retryPolicy.afterRetry(context))
        ,
        Promise.resolve()
    );
};

Retrier.prototype.retry = function (options) {
    const {
        func,
        context
    } = options;
    return func(context)
        .then(result => {
            context.result = result;
            if (context.retried) {
                return this._afterRetry(context);
            }
        })
        .catch(error => {
            context.error = error;
            if (context.retried) {
                return this._afterRetry(context);
            }
        })
        .then(() => {
            let retryPolicy = this.retryPolicies.find(p => p.isImportant(context));
            if (retryPolicy && !retryPolicy.shouldRetry(context)) {
                return [
                    false,
                    retryPolicy
                ];
            }
            if (!retryPolicy) {
                retryPolicy = this.retryPolicies.find(p => p.shouldRetry(context));
            }
            const shouldRetryPromise = this.onBeforeRetry
                ? this.onBeforeRetry(context, retryPolicy)
                : retryPolicy !== undefined;
            return Promise.all([
                shouldRetryPromise,
                retryPolicy
            ]);
        })
        .then(([shouldRetry, retryPolicy]) => {
            if (!shouldRetry) {
                return;
            }
            context.error = null;
            context.retried = true;
            delete context.result;
            return retryPolicy.prepareRetry(context)
                .catch(err => {
                    err.message = 'Retrier: prepare retry failed\n' + err.message;
                    if (context.error) {
                        err.cause = context.error;
                    }
                    return Promise.reject(err);
                })
                .then(() => this.retry(options));
        })
        .then(() => {
            if (context.error) {
                return Promise.reject(context.error);
            }
            return context.result;
        });
};

exports.Retrier = Retrier;
