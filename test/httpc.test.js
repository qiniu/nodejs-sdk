const should = require('should');

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const qiniu = require('../index');

const {
    QUERY_REGION_HOST,
    QUERY_REGION_BACKUP_HOSTS
} = qiniu.conf;

const {
    Middleware,
    RetryDomainsMiddleware
} = qiniu.httpc.middleware;

const {
    Endpoint,
    StaticEndpointsProvider,
    SERVICE_NAME,
    Region,
    StaticRegionsProvider,
    CachedRegionsProvider,
    QueryRegionsProvider
} = qiniu.httpc;
const {
    // eslint-disable-next-line camelcase
    Zone_z0,
    // eslint-disable-next-line camelcase
    Zone_z1
} = qiniu.zone;

describe('test http module', function () {
    const accessKey = process.env.QINIU_ACCESS_KEY;
    // const secretKey = process.env.QINIU_SECRET_KEY;
    const bucketName = process.env.QINIU_TEST_BUCKET;

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
        let mockServer;
        before(function (done) {
            mockServer = http.createServer((req, res) => {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Hello, Qiniu!\n');
            });
            mockServer.listen(9000, '127.0.0.1', done);
        });

        after(function () {
            mockServer.close();
        });

        it('test middleware', function (done) {
            const recordList = [];
            qiniu.rpc.qnHttpClient.sendRequest({
                url: 'http://127.0.0.1:9000/',
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
                url: 'http://fake.nodesdk.qiniu.com/',
                // url: 'https://qiniu.com/index.html',
                urllibOptions: {
                    method: 'GET',
                    followRedirect: true
                },
                middlewares: [
                    new RetryDomainsMiddleware({
                        backupDomains: [
                            'unavailable.pysdk.qiniu.com',
                            '127.0.0.1:9000'
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
                url: 'http://fake.nodesdk.qiniu.com/',
                // url: 'https://qiniu.com/index.html',
                urllibOptions: {
                    method: 'GET',
                    followRedirect: true
                },
                middlewares: [
                    new RetryDomainsMiddleware({
                        backupDomains: [
                            'unavailable.pysdk.qiniu.com',
                            '127.0.0.1:9000'
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

    describe('test endpoint', function () {
        it('test default options', function () {
            const endpoint = new Endpoint('www.qiniu.com');
            should.equal(endpoint.getValue(), 'https://www.qiniu.com');
            should.equal(endpoint.getValue({ scheme: 'http' }), 'http://www.qiniu.com');
        });

        it('test options', function () {
            const endpoint = new Endpoint('www.qiniu.com', {
                defaultScheme: 'http'
            });
            should.equal(endpoint.getValue(), 'http://www.qiniu.com');
            should.equal(endpoint.getValue({ scheme: 'https' }), 'https://www.qiniu.com');
        });
    });

    describe('test region', function () {
        it('test default options', function () {
            const region = new Region({
                regionId: 'z0'
            });

            should.equal(region.regionId, 'z0');
            should.equal(region.s3RegionId, 'z0');
            should.deepEqual(
                Object.keys(region.services),
                // use Object.values when min version of Node.js update to ≥ v7.5.0
                Object.keys(SERVICE_NAME).map(k => SERVICE_NAME[k])
            );
            should.ok(Date.now() - region.createTime.getTime() < 1000);
            should.equal(region.ttl, 86400);
            should.ok(region.isLive);
        });

        it('test options', function () {
            const region = new Region({
                regionId: 'z0',
                s3RegionId: 'z',
                services: {
                    [SERVICE_NAME.UC]: [
                        new Endpoint('fake-uc.qiniu.com')
                    ],
                    'custom-service': [
                        new Endpoint('custom-service.example.com')
                    ]
                },
                createTime: new Date(Date.now() - 86400 * 1000),
                ttl: 3600
            });

            should.equal(region.regionId, 'z0');
            should.equal(region.s3RegionId, 'z');
            should.deepEqual(
                Object.keys(region.services).sort(),
                // use Object.values when min version of Node.js update to ≥ v7.5.0
                Object.keys(SERVICE_NAME).map(k => SERVICE_NAME[k]).concat(['custom-service']).sort()
            );
            should.ok(new Date(Date.now() - 86400 * 1000).getTime() - region.createTime.getTime() < 1000);
            should.equal(region.ttl, 3600);
            should.ok(!region.isLive);
        });

        it('test fromZone', function () {
            const regionZ0 = Region.fromZone(Zone_z0);
            const upHosts = regionZ0.services[SERVICE_NAME.UP].map(endpoint => endpoint.host);
            const srcUpHosts = upHosts.slice(0, Zone_z1.srcUpHosts.length);
            const cdnUpHosts = upHosts.slice(Zone_z1.srcUpHosts.length);
            const ioHosts = regionZ0.services[SERVICE_NAME.IO].map(endpoint => endpoint.host);
            const rsHosts = regionZ0.services[SERVICE_NAME.RS].map(endpoint => endpoint.host);
            const rsfHosts = regionZ0.services[SERVICE_NAME.RSF].map(endpoint => endpoint.host);
            const apiHosts = regionZ0.services[SERVICE_NAME.API].map(endpoint => endpoint.host);

            should.equal(regionZ0.ttl, -1);
            should.deepEqual(cdnUpHosts, Zone_z0.cdnUpHosts);
            should.deepEqual(srcUpHosts, Zone_z0.srcUpHosts);
            should.deepEqual(ioHosts, [Zone_z0.ioHost]);
            should.deepEqual(rsHosts, [Zone_z0.rsHost]);
            should.deepEqual(rsfHosts, [Zone_z0.rsfHost]);
            should.deepEqual(apiHosts, [Zone_z0.apiHost]);
        });

        it('test fromZone with options', function () {
            const regionZ1 = Region.fromZone(Zone_z1, {
                ttl: 84600,
                isPreferCdnHost: true
            });
            const upHosts = regionZ1.services[SERVICE_NAME.UP].map(endpoint => endpoint.host);
            const cdnUpHosts = upHosts.slice(0, Zone_z0.cdnUpHosts.length);
            const srcUpHosts = upHosts.slice(Zone_z0.cdnUpHosts.length);
            const ioHosts = regionZ1.services[SERVICE_NAME.IO].map(endpoint => endpoint.host);
            const rsHosts = regionZ1.services[SERVICE_NAME.RS].map(endpoint => endpoint.host);
            const rsfHosts = regionZ1.services[SERVICE_NAME.RSF].map(endpoint => endpoint.host);
            const apiHosts = regionZ1.services[SERVICE_NAME.API].map(endpoint => endpoint.host);

            should.not.exist(regionZ1.regionId);
            should.equal(regionZ1.ttl, 84600);
            should.deepEqual(cdnUpHosts, Zone_z1.cdnUpHosts);
            should.deepEqual(srcUpHosts, Zone_z1.srcUpHosts);
            should.deepEqual(ioHosts, [Zone_z1.ioHost]);
            should.deepEqual(rsHosts, [Zone_z1.rsHost]);
            should.deepEqual(rsfHosts, [Zone_z1.rsfHost]);
            should.deepEqual(apiHosts, [Zone_z1.apiHost]);
        });

        it('test fromRegionId', function () {
            const regionZ0 = Region.fromRegionId('z0');

            const servicesEndpointValues = {};
            // use Object.entries when min version of Node.js update to ≥ v7.5.0
            for (const serviceName of Object.keys(regionZ0.services)) {
                const endpoints = regionZ0.services[serviceName];
                servicesEndpointValues[serviceName] = endpoints.map(e => e.getValue());
            }

            const expectedServicesEndpointValues = {
                [SERVICE_NAME.UC]: [
                    'https://uc.qiniuapi.com'
                ],
                [SERVICE_NAME.UP]: [
                    'https://upload.qiniup.com',
                    'https://up.qiniup.com',
                    'https://up.qbox.me'
                ],
                [SERVICE_NAME.IO]: [
                    'https://iovip.qiniuio.com',
                    'https://iovip.qbox.me'
                ],
                [SERVICE_NAME.RS]: [
                    'https://rs-z0.qiniuapi.com',
                    'https://rs-z0.qbox.me'
                ],
                [SERVICE_NAME.RSF]: [
                    'https://rsf-z0.qiniuapi.com',
                    'https://rsf-z0.qbox.me'
                ],
                [SERVICE_NAME.API]: [
                    'https://api-z0.qiniuapi.com',
                    'https://api-z0.qbox.me'
                ],
                [SERVICE_NAME.S3]: [
                    'https://s3.z0.qiniucs.com'
                ]
            };

            should.deepEqual(servicesEndpointValues, expectedServicesEndpointValues);
        });

        it('test fromRegionId with options', function () {
            const regionZ1 = Region.fromRegionId(
                'z1',
                {
                    s3RegionId: 'mock-z1',
                    ttl: -1,
                    createTime: new Date(0),
                    extendedServices: {
                        'custom-service': [
                            new Endpoint('custom-service.example.com')
                        ]
                    }
                }
            );

            const servicesEndpointValues = {};
            // use Object.entries when min version of Node.js update to ≥ v7.5.0
            for (const serviceName of Object.keys(regionZ1.services)) {
                const endpoints = regionZ1.services[serviceName];
                servicesEndpointValues[serviceName] = endpoints.map(e => e.getValue());
            }

            const expectedServicesEndpointValues = {
                [SERVICE_NAME.UC]: [
                    'https://uc.qiniuapi.com'
                ],
                [SERVICE_NAME.UP]: [
                    'https://upload-z1.qiniup.com',
                    'https://up-z1.qiniup.com',
                    'https://up-z1.qbox.me'
                ],
                [SERVICE_NAME.IO]: [
                    'https://iovip-z1.qiniuio.com',
                    'https://iovip-z1.qbox.me'
                ],
                [SERVICE_NAME.RS]: [
                    'https://rs-z1.qiniuapi.com',
                    'https://rs-z1.qbox.me'
                ],
                [SERVICE_NAME.RSF]: [
                    'https://rsf-z1.qiniuapi.com',
                    'https://rsf-z1.qbox.me'
                ],
                [SERVICE_NAME.API]: [
                    'https://api-z1.qiniuapi.com',
                    'https://api-z1.qbox.me'
                ],
                [SERVICE_NAME.S3]: [
                    'https://s3.mock-z1.qiniucs.com'
                ],
                'custom-service': [
                    'https://custom-service.example.com'
                ]
            };

            should.deepEqual(servicesEndpointValues, expectedServicesEndpointValues);
            should.equal(regionZ1.ttl, -1);
            should.equal(regionZ1.createTime.getTime(), 0);
        });
    });

    describe('test endpoints provider', function () {
        it('test StaticEndpointsProvider', function () {
            const upEndpointsProvider = StaticEndpointsProvider.fromRegion(
                Region.fromRegionId('z0'),
                SERVICE_NAME.UP
            );

            return upEndpointsProvider.getEndpoints()
                .then(endpoints => {
                    const endpointValues = endpoints.map(e => e.getValue());
                    should.deepEqual(endpointValues, [
                        'https://upload.qiniup.com',
                        'https://up.qiniup.com',
                        'https://up.qbox.me'
                    ]);
                });
        });
    });

    describe('test regions provider', function () {
        describe('test StaticRegionsProvider', function () {
            it('test StaticRegionsProvider get', function () {
                const staticRegionsProvider = new StaticRegionsProvider([
                    Region.fromRegionId('z0'),
                    Region.fromRegionId('cn-east-2')
                ]);

                return staticRegionsProvider.getRegions()
                    .then(regions => {
                        return regions.map(r => StaticEndpointsProvider.fromRegion(r, SERVICE_NAME.UP));
                    })
                    .then(endpointsProviders => {
                        return Promise.all(endpointsProviders.map(e => e.getEndpoints()));
                    })
                    .then(regionsEndpoints => {
                        // use `Array.prototype.flat` if migrate to node v11.15
                        const regionsEndpointValues = regionsEndpoints.map(
                            endpoints =>
                                endpoints.map(e => e.getValue())
                        );

                        should.deepEqual(regionsEndpointValues, [
                            [
                                'https://upload.qiniup.com',
                                'https://up.qiniup.com',
                                'https://up.qbox.me'
                            ],
                            [
                                'https://upload-cn-east-2.qiniup.com',
                                'https://up-cn-east-2.qiniup.com',
                                'https://up-cn-east-2.qbox.me'
                            ]
                        ]);
                    });
            });
        });

        describe('test CachedRegionsProvider', function () {
            const cacheFilesToDelete = [];
            const cacheKey = 'test-cache-key';

            function getCachedRegionsProvider () {
                const persistPath = path.join(process.cwd(), 'regions-cache-test' + cacheFilesToDelete.length + '.jsonl');
                cacheFilesToDelete.push(persistPath);
                const result = new CachedRegionsProvider({
                    cacheKey,
                    baseRegionsProvider: new StaticRegionsProvider([]),
                    persistPath
                });
                result._memoCache = new Map();
                result.lastShrinkAt = new Date(0);
                return result;
            }

            after(function () {
                cacheFilesToDelete.forEach(filePath => {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        // ignore
                    }
                });
            });

            it('test CachedRegionsProvider getter', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();
                return cachedRegionsProvider.getRegions()
                    .then(regions => {
                        should.equal(regions.length, 0);
                    });
            });

            it('test CachedRegionsProvider setter', function () {
                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                const cachedRegionsProvider = getCachedRegionsProvider();

                return cachedRegionsProvider.setRegions([
                    rZ0,
                    rZ1
                ])
                    .then(() => {
                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const actual = JSON.parse(content.toString());
                        should.deepEqual(
                            {
                                cacheKey: actual.cacheKey,
                                regions: actual.regions.map(r => r.regionId)
                            },
                            {
                                cacheKey,
                                regions: [rZ0, rZ1].map(r => r.regionId)
                            }
                        );
                        return cachedRegionsProvider.getRegions();
                    })
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z0', 'z1']);
                    });
            });

            it('test CachedRegionsProvider getter with expired file cache', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();
                const rZ0 = Region.fromRegionId('z0');
                const mockCreateTime = new Date();
                mockCreateTime.setMinutes(1, 2, 3);
                rZ0.createTime = mockCreateTime;

                const rZ0Expired = Region.fromRegionId('z0');
                rZ0Expired.createTime = new Date(0);

                fs.writeFileSync(
                    cachedRegionsProvider.persistPath,
                    JSON.stringify({
                        cacheKey: cachedRegionsProvider.cacheKey,
                        regions: [rZ0Expired.persistInfo]
                    })
                );
                cachedRegionsProvider._memoCache.set(cachedRegionsProvider.cacheKey, [rZ0]);
                return cachedRegionsProvider.getRegions()
                    .then(regions => {
                        should.equal(regions.length, 1);
                        const [actualRegion] = regions;
                        should.equal(actualRegion.createTime, mockCreateTime);
                    });
            });

            it('test CachedRegionsProvider disable persist', function () {
                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                const cachedRegionsProvider = getCachedRegionsProvider();
                const persistPath = cachedRegionsProvider.persistPath;
                cachedRegionsProvider.persistPath = null;

                return cachedRegionsProvider.setRegions([
                    rZ0,
                    rZ1
                ])
                    .then(() => {
                        const persistFileExists = fs.existsSync(persistPath);
                        should.ok(!persistFileExists);
                        return cachedRegionsProvider.getRegions();
                    })
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z0', 'z1']);
                    });
            });

            it('test CachedRegionsProvider with baseRegionsProvider', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();
                const expectRegions = [
                    Region.fromRegionId('z0')
                ];
                cachedRegionsProvider.baseRegionsProvider = new StaticRegionsProvider(expectRegions);

                return cachedRegionsProvider.getRegions()
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z0']);
                        should.equal(cachedRegionsProvider._memoCache.size, 1);
                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const jsonl = content.toString().split(os.EOL).filter(l => l.length);
                        should.equal(jsonl.length, 1);
                    });
            });
        });

        describe('test QueryRegionsProvider', function () {
            /**
             * @type {string[]}
             */
            const queryRegionHosts = [
                QUERY_REGION_HOST
            ]
                .concat(QUERY_REGION_BACKUP_HOSTS);

            const queryRegionsProvider = new QueryRegionsProvider({
                accessKey: accessKey,
                bucketName: bucketName,
                endpointsProvider: new StaticEndpointsProvider(
                    queryRegionHosts.map(h => new Endpoint(h))
                )
            });

            it('test QueryRegionsProvider getter', function () {
                return queryRegionsProvider.getRegions()
                    .then(regions => {
                        should.ok(regions.length > 0, 'regions length should great than 0');
                    });
            });

            it('test QueryRegionsProvider error', function () {
                const queryRegionsProvider = new QueryRegionsProvider({
                    accessKey: 'fake',
                    bucketName: 'fake',
                    endpointsProvider: new StaticEndpointsProvider(
                        queryRegionHosts.map(h => new Endpoint(h))
                    )
                });
                return queryRegionsProvider.getRegions()
                    .then(
                        () => {
                            should.not.exist('fake ak and fake bucket should be failed');
                        },
                        (err) => {
                            should.exist(err);
                            return Promise.resolve();
                        }
                    );
            });

            it('test QueryRegionsProvider with custom EndpointsProvider error', function () {
                const queryRegionsProvider = new QueryRegionsProvider({
                    accessKey: accessKey,
                    bucketName: bucketName,
                    endpointsProvider: new StaticEndpointsProvider([
                        new Endpoint('fake-uc.csharp.qiniu.com')
                    ])
                });
                return queryRegionsProvider.getRegions()
                    .then(
                        () => {
                            should.not.exist('fake endpoint should be failed');
                        },
                        (err) => {
                            should.exist(err);
                            return Promise.resolve();
                        }
                    );
            });

            it('test QueryRegionsProvider with custom EndpointsProvider retried', function () {
                const queryRegionsProvider = new QueryRegionsProvider({
                    accessKey: accessKey,
                    bucketName: bucketName,
                    endpointsProvider: new StaticEndpointsProvider([
                        new Endpoint('fake-uc.csharp.qiniu.com'),
                        new Endpoint(QUERY_REGION_HOST)
                    ])
                });
                return queryRegionsProvider.getRegions()
                    .then(regions => {
                        should.ok(regions.length > 0, 'regions length should great than 0');
                    });
            });
        });
    });
});
