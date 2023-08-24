const should = require('should');

const qiniu = require('../index');

const {
    Middleware,
    RetryDomainsMiddleware
} = qiniu.httpc.middleware;

describe('test http module', function () {
    describe('test http ResponseWrapper', function () {
        const { ResponseWrapper } = qiniu.httpc;

        it('needRetry', function () {
            const cases = Array.from({
                length: 800
            }, (_, i) => {
                if (i > 0 && i < 500) {
                    return {
                        code: i,
                        shouldRetry: false
                    };
                }
                if ([
                    501, 509, 573, 579, 608, 612, 614, 616, 618, 630, 631, 632, 640, 701
                ].includes(i)) {
                    return {
                        code: i,
                        shouldRetry: false
                    };
                }
                return {
                    code: i,
                    shouldRetry: true
                };
            });
            cases.unshift({
                code: -1,
                shouldRetry: true
            });

            const mockedResponseWrapper = new ResponseWrapper({
                data: [],
                resp: {
                    statusCode: 200
                }
            });

            for (const item of cases) {
                mockedResponseWrapper.resp.statusCode = item.code;
                mockedResponseWrapper.needRetry().should.eql(
                    item.shouldRetry,
                    `${item.code} need${item.shouldRetry ? '' : ' NOT'} retry`
                );
            }
        });
    });

    class OrderRecordMiddleware extends Middleware {
        /**
         *
         * @param {string[]} record
         * @param {string} label
         */
        constructor (record, label) {
            super();
            this.record = record;
            this.label = label;
        }

        /**
         *
         * @param {ReqOpts} request
         * @param {function(ReqOpts):Promise<ResponseWrapper>} next
         * @return {Promise<ResponseWrapper>}
         */
        send (request, next) {
            this.record.push(`bef_${this.label}${this.record.length}`);
            return next(request).then((respWrapper) => {
                this.record.push(`aft_${this.label}${this.record.length}`);
                return respWrapper;
            });
        }
    }

    describe('test http middleware', function () {
        it('test middleware', function (done) {
            const recordList = [];
            qiniu.rpc.qnHttpClient.sendRequest({
                url: 'https://qiniu.com/index.html',
                urllibOptions: {
                    method: 'GET',
                    followRedirect: true
                },
                middlewares: [
                    new OrderRecordMiddleware(recordList, 'A'),
                    new OrderRecordMiddleware(recordList, 'B')
                ]
            })
                .then(({
                    _data,
                    resp
                }) => {
                    recordList.should.eql(['bef_A0', 'bef_B1', 'aft_B2', 'aft_A3']);
                    should.equal(resp.statusCode, 200);
                    done();
                })
                .catch(err => {
                    done(err);
                });
        });

        it('test retry domains', function (done) {
            const recordList = [];
            qiniu.rpc.qnHttpClient.sendRequest({
                url: 'https://fake.nodesdk.qiniu.com/index.html',
                // url: 'https://qiniu.com/index.html',
                urllibOptions: {
                    method: 'GET',
                    followRedirect: true
                },
                middlewares: [
                    new RetryDomainsMiddleware({
                        backupDomains: [
                            'unavailable.pysdk.qiniu.com',
                            'qiniu.com'
                        ],
                        maxRetryTimes: 3
                    }),
                    new OrderRecordMiddleware(recordList, 'A')
                ]
            })
                .then(({
                    _data,
                    _resp
                }) => {
                    recordList.should.eql([
                        // fake.nodesdk.qiniu.com
                        'bef_A0',
                        'bef_A1',
                        'bef_A2',
                        // unavailable.pysdk.qiniu.com
                        'bef_A3',
                        'bef_A4',
                        'bef_A5',
                        // qiniu.com
                        'bef_A6',
                        'aft_A7'
                    ]);
                    done();
                })
                .catch(err => {
                    done(err);
                });
        });

        it('test retry domains fail fast', function (done) {
            const recordList = [];
            qiniu.rpc.qnHttpClient.sendRequest({
                url: 'https://fake.nodesdk.qiniu.com/index.html',
                // url: 'https://qiniu.com/index.html',
                urllibOptions: {
                    method: 'GET',
                    followRedirect: true
                },
                middlewares: [
                    new RetryDomainsMiddleware({
                        backupDomains: [
                            'unavailable.pysdk.qiniu.com',
                            'qiniu.com'
                        ],
                        retryCondition: () => false
                    }),
                    new OrderRecordMiddleware(recordList, 'A')
                ]
            })
                .then(({
                    _data,
                    _resp
                }) => {
                    done('this should not be ok');
                })
                .catch(_err => {
                    recordList.should.eql(['bef_A0']);
                    done();
                });
        });
    });
});
