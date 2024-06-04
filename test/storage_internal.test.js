const should = require('should');

const fs = require('fs');
const path = require('path');

const qiniu = require('../index');

const {
    Endpoint,
    Region,
    SERVICE_NAME
} = qiniu.httpc;

const {
    AccUnavailableRetryPolicy,
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

    describe('test AccUnavailableRetryPolicy', function () {
        it('test AccUnavailableRetryPolicy should retry', function () {
            const accUnavailableRetryPolicy = new AccUnavailableRetryPolicy();

            const mockedContext = {};

            return accUnavailableRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.serviceName = SERVICE_NAME.UP_ACC;
                    mockedContext.alternativeServiceNames = [SERVICE_NAME.UP];
                    mockedContext.region = Region.fromRegionId('z0');

                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 400,
                            data: {
                                error: 'transfer acceleration is not configured on this bucket'
                            }
                        }
                    };

                    accUnavailableRetryPolicy.shouldRetry(mockedContext)
                        .should.true();
                });
        });

        it('test AccUnavailableRetryPolicy should not retry by no alternative service', function () {
            const accUnavailableRetryPolicy = new AccUnavailableRetryPolicy();

            const mockedContext = {};

            return accUnavailableRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.serviceName = SERVICE_NAME.UP;
                    mockedContext.alternativeServiceNames = [];
                    mockedContext.region = Region.fromRegionId('z0');

                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 400,
                            data: {
                                error: 'transfer acceleration is not configured on this bucket'
                            }
                        }
                    };

                    accUnavailableRetryPolicy.shouldRetry(mockedContext)
                        .should.false();
                });
        });

        it('test AccUnavailableRetryPolicy should not retry by no alternative endpoint', function () {
            const accUnavailableRetryPolicy = new AccUnavailableRetryPolicy();

            const mockedContext = {};

            return accUnavailableRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.serviceName = SERVICE_NAME.UP_ACC;
                    mockedContext.alternativeServiceNames = [SERVICE_NAME.UP];
                    mockedContext.region = Region.fromRegionId('z0');
                    mockedContext.region.services[SERVICE_NAME.UP] = [];

                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 400,
                            data: {
                                error: 'transfer acceleration is not configured on this bucket'
                            }
                        }
                    };

                    accUnavailableRetryPolicy.shouldRetry(mockedContext)
                        .should.false();
                });
        });

        it('test AccUnavailableRetryPolicy should not retry by no other error', function () {
            const accUnavailableRetryPolicy = new AccUnavailableRetryPolicy();

            const mockedContext = {};

            return accUnavailableRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.serviceName = SERVICE_NAME.UP_ACC;
                    mockedContext.alternativeServiceNames = [SERVICE_NAME.UP];
                    mockedContext.region = Region.fromRegionId('z0');

                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 400,
                            data: 'Not Found'
                        }
                    };

                    accUnavailableRetryPolicy.shouldRetry(mockedContext)
                        .should.false();
                });
        });

        it('test AccUnavailableRetryPolicy prepare retry', function () {
            const accUnavailableRetryPolicy = new AccUnavailableRetryPolicy();
            const region = Region.fromRegionId('z0');

            const mockedContext = {};

            return accUnavailableRetryPolicy.initContext(mockedContext)
                .then(() => {
                    mockedContext.region = region;
                    mockedContext.region[SERVICE_NAME.UP_ACC] = [
                        new Endpoint('some.fake.qiniu.com'),
                        new Endpoint('others.fake.qiniu.com')
                    ];
                    mockedContext.serviceName = SERVICE_NAME.UP_ACC;
                    mockedContext.alternativeServiceNames = [SERVICE_NAME.UP];

                    mockedContext.result = {
                        data: null,
                        resp: {
                            statusCode: 400,
                            data: {
                                error: 'transfer acceleration is not configured on this bucket'
                            }
                        }
                    };

                    accUnavailableRetryPolicy.shouldRetry(mockedContext)
                        .should.true();

                    return accUnavailableRetryPolicy.prepareRetry(mockedContext);
                })
                .then(() => {
                    const [expectEndpoint, ...expectAlternativeEndpoints] = region.services[SERVICE_NAME.UP];
                    should.deepEqual(mockedContext.endpoint, expectEndpoint);
                    should.deepEqual(mockedContext.alternativeEndpoints, expectAlternativeEndpoints);
                });
        });
    });
});
