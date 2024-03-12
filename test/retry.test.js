const should = require('should');

const { Retrier, RetryPolicy } = require('../qiniu/retry');

describe('test retry module', function () {
    describe('test Retrier', function () {
        class MaxRetryPolicy extends RetryPolicy {
            constructor (options) {
                super();
                this.id = Symbol(this.constructor.name);
                this.max = options.max;
            }

            isImportant (context) {
                return context[this.id].retriedTimes >= this.max;
            }

            initContext (context) {
                context[this.id] = {
                    retriedTimes: 0
                };
                return Promise.resolve();
            }

            shouldRetry (context) {
                if (!context.error) {
                    return false;
                }
                return context[this.id].retriedTimes < this.max;
            }

            prepareRetry (_context) {
                return Promise.resolve();
            }

            afterRetry (context) {
                context[this.id].retriedTimes++;
                return Promise.resolve();
            }
        }

        class HttpOkRetryPolicy extends RetryPolicy {
            constructor () {
                super();
                this.id = Symbol(this.constructor.name);
            }

            initContext (context) {
                context.msg = 'init http ok policy';
                return Promise.resolve();
            }

            shouldRetry (context) {
                if (context.error) {
                    return true;
                }

                return context.result.resp.statusCode !== 200;
            }

            prepareRetry (context) {
                context.error = null;
                context.result = undefined;
                return Promise.resolve();
            }
        }

        it('test initContext', function () {
            const maxRetryPolicy = new MaxRetryPolicy({ max: 3 });
            const httpOkRetryPolicy = new HttpOkRetryPolicy();
            const retrier = new Retrier({
                retryPolicies: [
                    maxRetryPolicy,
                    httpOkRetryPolicy
                ]
            });

            return retrier.initContext()
                .then(context => {
                    should.equal(context.msg, 'init http ok policy');
                    should.equal(context[maxRetryPolicy.id].retriedTimes, 0);
                });
        });

        it('test Retrier retry', function () {
            const maxRetryPolicy = new MaxRetryPolicy({ max: 3 });
            const httpOkRetryPolicy = new HttpOkRetryPolicy();
            const retrier = new Retrier({
                retryPolicies: [
                    maxRetryPolicy,
                    httpOkRetryPolicy
                ]
            });

            let failTimes = 3;

            return retrier.initContext()
                .then(context => {
                    return retrier.retry({
                        func: () => {
                            if (failTimes-- > 0) {
                                return Promise.reject(new Error('failed'));
                            }
                            return Promise.resolve({
                                resp: {
                                    statusCode: 200
                                }
                            });
                        },
                        context
                    });
                })
                .then(({ resp }) => {
                    should.equal(resp.statusCode, 200);
                });
        });

        it('test onBeforeRetry', function () {
            const maxRetryPolicy = new MaxRetryPolicy({ max: 3 });
            const httpOkRetryPolicy = new HttpOkRetryPolicy();
            let okForAll2xx = false;
            const retrier = new Retrier({
                retryPolicies: [
                    maxRetryPolicy,
                    httpOkRetryPolicy
                ],
                onBeforeRetry: (context, retryPolicy) => {
                    if (
                        retryPolicy === httpOkRetryPolicy &&
                        Math.floor(context.result.resp.statusCode / 101) === 2
                    ) {
                        okForAll2xx = true;
                        return false;
                    }
                    return true;
                }
            });

            return retrier.initContext()
                .then(context => {
                    return retrier.retry({
                        func: () => {
                            return Promise.resolve({
                                resp: {
                                    statusCode: 204
                                }
                            });
                        },
                        context
                    });
                })
                .then(({ resp }) => {
                    should.equal(resp.statusCode, 204);
                    should.ok(okForAll2xx);
                });
        });

        it('test policy should important', function () {
            const maxRetryPolicy = new MaxRetryPolicy({ max: 3 });
            const httpOkRetryPolicy = new HttpOkRetryPolicy();
            const retrier = new Retrier({
                retryPolicies: [
                    maxRetryPolicy,
                    httpOkRetryPolicy
                ]
            });

            return retrier.initContext()
                .then(context => {
                    return retrier.retry({
                        func: () => Promise.reject(new Error('failed')),
                        context
                    });
                })
                .then(() => {
                    should.fail('should not be here', null);
                })
                .catch(err => {
                    should.equal(err.toString(), 'Error: failed');
                });
        });
    });
});
