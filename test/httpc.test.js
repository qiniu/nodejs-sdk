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
            const rule = [
                ['-1', true],
                ['100,499', false],
                ['500,578', true],
                ['579', false],
                ['580,599', true],
                ['600,611', true],
                ['612', false],
                ['613,630', true],
                ['631', false],
                ['632,699', true]
            ];
            const cases = [];
            for (const [codeRange, shouldRetry] of rule) {
                let [start, end] = codeRange.split(',');
                start = parseInt(start);
                end = parseInt(end);
                if (!end) {
                    cases.push({
                        code: start,
                        shouldRetry
                    });
                } else {
                    for (let i = start; i <= end; i++) {
                        cases.push({
                            code: i,
                            shouldRetry
                        });
                    }
                }
            }

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
         * @param {function(ReqOpts):Promise<RespWrapper>} next
         * @return {Promise<RespWrapper>}
         */
        send (request, next) {
            this.record.push(`bef_${this.label}${this.record.length}`);
            return next(request).then(({
                data,
                resp
            }) => {
                this.record.push(`aft_${this.label}${this.record.length}`);
                return {
                    data,
                    resp
                };
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
