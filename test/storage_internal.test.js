const should = require('should');

const fs = require('fs');
const path = require('path');

const {
    TokenExpiredRetryPolicy
} = require('../qiniu/storage/internal');

describe('test upload internal module', function () {
    describe('test TokenExpiredRetryPolicy', function () {
        const resumeRecordFilePath = path.join(process.cwd(), 'fake-progress-record');

        beforeEach(function () {
            const fd = fs.openSync(resumeRecordFilePath, 'w');
            fs.closeSync(fd);
        });

        afterEach(function () {
            try {
                fs.unlinkSync(resumeRecordFilePath);
            } catch (e) {
                // ignore
            }
        });

        it('test TokenExpiredRetryPolicy should not retry', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy({
                uploadApiVersion: 'v1',
                resumeRecordFilePath
            });

            const mockedContext = {};

            return tokenExpiredRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 200
                        }
                    };
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext)
                        .should.false();
                });
        });

        it('test TokenExpiredRetryPolicy should not by maxRetriedTimes', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy({
                uploadApiVersion: 'v1',
                resumeRecordFilePath,
                maxRetryTimes: 2
            });

            const mockedContext = {};

            return tokenExpiredRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 701
                        }
                    };
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext).should.true('first should retry');
                    return tokenExpiredRetryPolicy.prepareRetry(mockedContext);
                })
                .then(() => {
                    // recreate fake progress file
                    const fd = fs.openSync(resumeRecordFilePath, 'w');
                    fs.closeSync(fd);
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext).should.true('second should retry');
                    return tokenExpiredRetryPolicy.prepareRetry(mockedContext);
                })
                .then(() => {
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext).should.false('third should not retry');
                });
        });

        it('test TokenExpiredRetryPolicy should retry v1', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy({
                uploadApiVersion: 'v1',
                resumeRecordFilePath
            });
            const mockedContext = {};

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 701
                        }
                    };
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext).should.true();
                    return tokenExpiredRetryPolicy.prepareRetry(mockedContext);
                })
                .then(() => {
                    should.ok(!fs.existsSync(resumeRecordFilePath));
                });
        });

        it('test TokenExpiredRetryPolicy should retry v2', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy({
                uploadApiVersion: 'v2',
                resumeRecordFilePath
            });
            const mockedContext = {};

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 612
                        }
                    };
                    tokenExpiredRetryPolicy.shouldRetry(mockedContext).should.true();
                    return tokenExpiredRetryPolicy.prepareRetry(mockedContext);
                })
                .then(() => {
                    should.ok(!fs.existsSync(resumeRecordFilePath));
                });
        });
    });
});
