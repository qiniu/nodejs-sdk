const should = require('should');

const fs = require('fs');
const path = require('path');

const qiniu = require('../index');
const {
    Endpoint,
    Region,
    StaticRegionsProvider,
    SERVICE_NAME
} = qiniu.httpc;
const {
    Config
} = qiniu.conf;
const {
    Zone_z1
} = qiniu.zone;

const {
    prepareRegionsProvider,
    doWorkWithRetry,
    ChangeEndpointRetryPolicy,
    ChangeRegionRetryPolicy,
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
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy();
            const context = {
                uploadApiVersion: 'v1',
                resumeRecordFilePath
            };

            const mockRet = {
                data: null,
                resp: {
                    statusCode: 200
                }
            };

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(context)
                .then(() => {
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(!readyToRetry);
                });
        });

        it('test TokenExpiredRetryPolicy should not by maxRetriedTimes', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy({
                maxRetryTimes: 2
            });
            const context = {
                uploadApiVersion: 'v1',
                resumeRecordFilePath
            };

            const mockRet = {
                data: null,
                resp: {
                    statusCode: 701
                }
            };

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(context)
                .then(() => {
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    const fd = fs.openSync(resumeRecordFilePath, 'w');
                    fs.closeSync(fd);
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    const fd = fs.openSync(resumeRecordFilePath, 'w');
                    fs.closeSync(fd);
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(!readyToRetry);
                });
        });

        it('test TokenExpiredRetryPolicy should retry v1', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy();
            const context = {
                uploadApiVersion: 'v1',
                resumeRecordFilePath
            };

            const mockRet = {
                data: null,
                resp: {
                    statusCode: 701
                }
            };

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(context)
                .then(() => {
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    should.ok(!fs.existsSync(resumeRecordFilePath));
                });
        });

        it('test TokenExpiredRetryPolicy should retry v2', function () {
            const tokenExpiredRetryPolicy = new TokenExpiredRetryPolicy();
            const context = {
                uploadApiVersion: 'v2',
                resumeRecordFilePath
            };

            const mockRet = {
                data: null,
                resp: {
                    statusCode: 612
                }
            };

            // create fake progress file
            return tokenExpiredRetryPolicy.initContext(context)
                .then(() => {
                    return tokenExpiredRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    should.ok(!fs.existsSync(resumeRecordFilePath));
                });
        });
    });

    describe('test ChangeEndpointRetryPolicy', function () {
        it('test ChangeEndpointRetryPolicy retry', function () {
            const changeEndpointRetryPolicy = new ChangeEndpointRetryPolicy();
            const context = {
                endpoint: new Endpoint('a'),
                alternativeEndpoints: [
                    new Endpoint('b'),
                    new Endpoint('c')
                ]
            };

            const mockRet = {};

            return changeEndpointRetryPolicy.initContext(context)
                .then(() => {
                    return changeEndpointRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    should.equal(
                        context.endpoint.getValue(),
                        'https://b'
                    );
                    should.equal(context.alternativeEndpoints.length, 1);
                    return changeEndpointRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    should.equal(
                        context.endpoint.getValue(),
                        'https://c'
                    );
                    should.equal(context.alternativeEndpoints.length, 0);
                    return changeEndpointRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(!readyToRetry);
                });
        });
    });

    describe('test ChangeRegionRetryPolicy', function () {
        const resumeRecordFilePath = path.join(process.cwd(), 'fake-progress-record');

        it('test ChangeRegionRetryPolicy', function () {
            const fd = fs.openSync(resumeRecordFilePath, 'w');
            fs.closeSync(fd);

            const changeRegionRetryPolicy = new ChangeRegionRetryPolicy();
            const context = {
                resumeRecordFilePath,
                serviceName: SERVICE_NAME.UP,
                region: Region.fromRegionId('z0'),
                alternativeRegions: [
                    Region.fromRegionId('z1')
                ]
            };

            const mockRet = {};

            return changeRegionRetryPolicy.initContext(context)
                .then(() => {
                    return changeRegionRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(readyToRetry);
                    should.ok(!fs.existsSync(resumeRecordFilePath));
                    should.equal(context.region.regionId, 'z1');
                    should.equal(context.alternativeRegions.length, 0);
                    should.ok(context.endpoint.getValue().includes('z1'));
                    should.ok(context.alternativeEndpoints.length > 0);
                    return changeRegionRetryPolicy.prepareRetry(context, mockRet);
                })
                .then(readyToRetry => {
                    should.ok(!readyToRetry);
                });
        });
    });
    describe('test retry', function () {
        describe('test prepareRegionsProvider', function () {
            it('test prepareRegionsProvider with config provider', function () {
                const staticRegionsProvider = new StaticRegionsProvider([
                    Region.fromRegionId('z1')
                ]);
                const config = new Config({
                    regionsProvider: staticRegionsProvider
                });

                const regionsProvider = prepareRegionsProvider({
                    config,
                    bucketName: 'mock-bucket',
                    accessKey: 'mock-ak'
                });
                should.ok(regionsProvider === staticRegionsProvider);
            });

            it('test prepareRegionsProvider with config zone', function () {
                const config = new Config({
                    zone: Zone_z1
                });

                const regionsProvider = prepareRegionsProvider({
                    config,
                    bucketName: 'mock-bucket',
                    accessKey: 'mock-ak'
                });
                should.ok(regionsProvider instanceof StaticRegionsProvider);

                return regionsProvider.getRegions()
                    .then(regions => {
                        should.equal(regions.length, 1);
                        const [r] = regions;
                        should.equal(r.regionId, 'z1');
                    });
            });
        });

        describe('test retry regions', function () {
            function getTestData (options) {
                options = options || {};
                const failedTimes = options.failedTimes || 0;
                const triedEndpoint = [];
                function workWithEndpoint (endpoint) {
                    triedEndpoint.push(endpoint);
                    return Promise.resolve({
                        err: null,
                        ret: {
                            msg: 'ok'
                        },
                        info: {
                            statusCode: triedEndpoint.length <= failedTimes ? -1 : 200
                        }
                    });
                }

                const staticRegionsProvider = new StaticRegionsProvider([
                    Region.fromRegionId('z1'),
                    Region.fromRegionId('z2')
                ]);

                return {
                    triedEndpoint,
                    workWithEndpoint,
                    staticRegionsProvider
                };
            }

            it('test retry regions with ok and no change region', function () {
                const {
                    staticRegionsProvider,
                    triedEndpoint,
                    workWithEndpoint
                } = getTestData({
                    failedTimes: 0
                });

                return doWorkWithRetry({
                    workFn: workWithEndpoint,
                    regionsProvider: staticRegionsProvider,
                    retryPolicies: [
                        new ChangeEndpointRetryPolicy(),
                        new ChangeRegionRetryPolicy()
                    ]
                })
                    .then(({ data, resp }) => {
                        should.equal(resp.statusCode, 200);
                        should.equal(data.msg, 'ok');
                        should.equal(triedEndpoint.length, 1);
                        const [endpoint] = triedEndpoint;
                        should.ok(endpoint.getValue().includes('z1'));
                    });
            });

            it('test retry regions with change region', function () {
                const {
                    staticRegionsProvider,
                    triedEndpoint,
                    workWithEndpoint
                } = getTestData({
                    failedTimes: 3
                });

                const resumeRecordFilePath = path.join(
                    process.cwd(),
                    'progress-record-file'
                );
                const fd = fs.openSync(resumeRecordFilePath, 'w');
                fs.closeSync(fd);

                return doWorkWithRetry({
                    workFn: workWithEndpoint,
                    resumeRecordFilePath: resumeRecordFilePath,
                    regionsProvider: staticRegionsProvider,
                    retryPolicies: [
                        new ChangeEndpointRetryPolicy(),
                        new ChangeRegionRetryPolicy()
                    ]
                })
                    .then(({ data, resp }) => {
                        should.equal(resp.statusCode, 200);
                        should.equal(data.msg, 'ok');
                        should.ok(!fs.existsSync(resumeRecordFilePath));
                        should.equal(triedEndpoint.length, 4);
                    });
            });
        });
    });
});
