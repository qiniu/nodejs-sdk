const should = require('should');

const path = require('path');
const fs = require('fs');
const os = require('os');

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
    QueryRegionsProvider,
    ChainedRegionsProvider
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

        it('test persistInfo', function () {
            const endpoint = new Endpoint('www.qiniu.com');
            const expectedResult = {
                host: 'www.qiniu.com',
                defaultScheme: 'https'
            };
            should.deepEqual(endpoint.persistInfo, expectedResult);
        });

        it('test fromPersistedInfo', function () {
            const persistedData = {
                host: 'www.qiniu.com',
                defaultScheme: 'https'
            };

            const endpoint = Endpoint.fromPersistInfo(persistedData);
            should.equal(endpoint.host, 'www.qiniu.com');
            should.equal(endpoint.defaultScheme, 'https');
            should.equal(endpoint.getValue(), 'https://www.qiniu.com');
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
            should.equal(region.coolDownBefore.getTime(), 0);
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
            should.equal(region.coolDownBefore.getTime(), 0);
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

            should.equal(regionZ0.regionId, 'z0');
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

            should.equal(regionZ1.regionId, 'z1');
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
                    'https://up.qiniup.com'
                ],
                [SERVICE_NAME.IO]: [
                    'https://iovip.qiniuio.com'
                ],
                [SERVICE_NAME.RS]: [
                    'https://rs-z0.qiniuapi.com'
                ],
                [SERVICE_NAME.RSF]: [
                    'https://rsf-z0.qiniuapi.com'
                ],
                [SERVICE_NAME.API]: [
                    'https://api.qiniuapi.com'
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
                    'https://up-z1.qiniup.com'
                ],
                [SERVICE_NAME.IO]: [
                    'https://iovip-z1.qiniuio.com'
                ],
                [SERVICE_NAME.RS]: [
                    'https://rs-z1.qiniuapi.com'
                ],
                [SERVICE_NAME.RSF]: [
                    'https://rsf-z1.qiniuapi.com'
                ],
                [SERVICE_NAME.API]: [
                    'https://api.qiniuapi.com'
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

        it('test persistInfo', function () {
            const now = new Date();
            const regionZ0 = Region.fromRegionId(
                'z0',
                {
                    createTime: now
                }
            );

            const expectedResult = {
                regionId: 'z0',
                s3RegionId: 'z0',
                services: {
                    uc: [
                        {
                            defaultScheme: 'https',
                            host: 'uc.qiniuapi.com'
                        }
                    ],
                    up: [
                        {
                            defaultScheme: 'https',
                            host: 'upload.qiniup.com'
                        },
                        {
                            defaultScheme: 'https',
                            host: 'up.qiniup.com'
                        }
                    ],
                    io: [
                        {
                            defaultScheme: 'https',
                            host: 'iovip.qiniuio.com'
                        }
                    ],
                    rs: [
                        {
                            defaultScheme: 'https',
                            host: 'rs-z0.qiniuapi.com'
                        }
                    ],
                    rsf: [
                        {
                            defaultScheme: 'https',
                            host: 'rsf-z0.qiniuapi.com'
                        }
                    ],
                    api: [
                        {
                            defaultScheme: 'https',
                            host: 'api.qiniuapi.com'
                        }
                    ],
                    s3: [
                        {
                            defaultScheme: 'https',
                            host: 's3.z0.qiniucs.com'
                        }
                    ]
                },
                ttl: 86400,
                createTime: now.getTime(),
                coolDownBefore: 0
            };
            should.deepEqual(regionZ0.persistInfo, expectedResult);
        });

        it('test fromPersistInfo', function () {
            const now = new Date();

            const persistInfo = {
                regionId: 'z0',
                s3RegionId: 'z0',
                services: {
                    uc: [
                        {
                            defaultScheme: 'https',
                            host: 'uc.qiniuapi.com'
                        }
                    ],
                    up: [
                        {
                            defaultScheme: 'https',
                            host: 'upload.qiniup.com'
                        },
                        {
                            defaultScheme: 'https',
                            host: 'up.qiniup.com'
                        }
                    ],
                    io: [
                        {
                            defaultScheme: 'https',
                            host: 'iovip.qiniuio.com'
                        }
                    ],
                    rs: [
                        {
                            defaultScheme: 'https',
                            host: 'rs-z0.qiniuapi.com'
                        }
                    ],
                    rsf: [
                        {
                            defaultScheme: 'https',
                            host: 'rsf-z0.qiniuapi.com'
                        }
                    ],
                    api: [
                        {
                            defaultScheme: 'https',
                            host: 'api.qiniuapi.com'
                        }
                    ],
                    s3: [
                        {
                            defaultScheme: 'https',
                            host: 's3.z0.qiniucs.com'
                        }
                    ]
                },
                ttl: 86400,
                createTime: now.getTime(),
                coolDownBefore: 0
            };

            const region = Region.fromPersistInfo(persistInfo);

            should.equal(region.regionId, 'z0');
            should.equal(region.s3RegionId, 'z0');
            should.equal(region.ttl, 86400);
            should.equal(region.createTime.getTime(), now.getTime());
            should.equal(region.coolDownBefore.getTime(), 0);

            // use Object.entries when min version of Node.js update to ≥ v7.5.0
            for (const serviceName of Object.keys(persistInfo.services)) {
                const persistEndpoints = persistInfo.services[serviceName];
                const endpointValues = region.services[serviceName].map(e => e.getValue());
                const expectedEndpointValues = persistEndpoints.map(e => e.defaultScheme + '://' + e.host);
                should.deepEqual(endpointValues, expectedEndpointValues);
            }
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
                        'https://up.qiniup.com'
                    ]);
                });
        });
    });

    describe('test regions provider', function () {
        describe('test StaticRegionsProvider', function () {
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
                            'https://up.qiniup.com'
                        ],
                        [
                            'https://upload-cn-east-2.qiniup.com',
                            'https://up-cn-east-2.qiniup.com'
                        ]
                    ]);
                });
        });

        describe('test CachedRegionsProvider', function () {
            const cacheFilesToDelete = [];
            const cacheKey = 'test-cache-key';

            function getCachedRegionsProvider () {
                const persistPath = path.join(process.cwd(), 'regions-cache-test' + cacheFilesToDelete.length + '.jsonl');
                cacheFilesToDelete.push(persistPath);
                const result = new CachedRegionsProvider(
                    cacheKey,
                    {
                        persistPath
                    }
                );
                result._memoCache = new Map();
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
                        should.deepEqual(
                            JSON.parse(content.toString()),
                            {
                                cacheKey,
                                regions: [rZ0, rZ1].map(r => r.persistInfo)
                            }
                        );
                        return cachedRegionsProvider.getRegions();
                    })
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z0', 'z1']);
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

            it('test CachedRegionsProvider shrink', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();

                const rZ2 = Region.fromRegionId('z2');
                const rZ3 = Region.fromRegionId('z3');
                rZ2.createTime = new Date(0);
                rZ3.createTime = new Date(0);

                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                rZ0.createTime = new Date(0);
                should.ok(!rZ0.isLive);

                return cachedRegionsProvider.setRegions([
                    rZ2,
                    rZ3
                ])
                    .then(() => {
                        return cachedRegionsProvider.setRegions([
                            rZ0,
                            rZ1
                        ]);
                    })
                    .then(() => {
                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(isShrunk);
                        const cachedRegions = cachedRegionsProvider._memoCache.get(cachedRegionsProvider.cacheKey);
                        should.deepEqual(cachedRegions.map(r => r.regionId), ['z1']);

                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const jsonl = content.toString().split(os.EOL).filter(l => l.length > 0);
                        should.equal(jsonl.length, 1);

                        const [persistedCache] = jsonl;
                        const { cacheKey, regions } = JSON.parse(persistedCache);
                        should.equal(cacheKey, cachedRegionsProvider.cacheKey);
                        should.equal(regions.length, 1);
                        should.equal(regions[0].regionId, 'z1');
                    });
            });

            it('test CachedRegionsProvider shrunk just now', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();

                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                rZ0.createTime = new Date(0);
                should.ok(!rZ0.isLive);
                cachedRegionsProvider.setRegions([
                    rZ0,
                    rZ1
                ])
                    .then(() => {
                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(isShrunk);

                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(!isShrunk);

                        const cachedRegions = cachedRegionsProvider._memoCache.get(cachedRegionsProvider.cacheKey);
                        should.deepEqual(cachedRegions.map(r => r.regionId), ['z1']);

                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const jsonl = content.toString().split(os.EOL).filter(l => l.length > 0);
                        should.equal(jsonl.length, 1);
                    });
            });

            it('test CachedRegionsProvider shrink force', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();

                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                rZ0.createTime = new Date(0);
                should.ok(!rZ0.isLive);

                return cachedRegionsProvider.setRegions([
                    rZ0,
                    rZ1
                ])
                    .then(() => {
                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(isShrunk);

                        return cachedRegionsProvider.setRegions([
                            rZ0,
                            rZ1
                        ]);
                    })
                    .then(() => {
                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(!isShrunk);

                        const cachedRegions = cachedRegionsProvider._memoCache.get(cachedRegionsProvider.cacheKey);
                        should.deepEqual(cachedRegions.map(r => r.regionId), ['z0', 'z1']);

                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const jsonl = content.toString().split(os.EOL).filter(l => l.length > 0);
                        should.equal(jsonl.length, 2);

                        return cachedRegionsProvider.shrink(true);
                    })
                    .then(isShrunk => {
                        should.ok(isShrunk);
                        const cachedRegions = cachedRegionsProvider._memoCache.get(cachedRegionsProvider.cacheKey);
                        should.deepEqual(cachedRegions.map(r => r.regionId), ['z1']);

                        const content = fs.readFileSync(cachedRegionsProvider.persistPath);
                        const jsonl = content.toString().split(os.EOL).filter(l => l.length > 0);
                        should.equal(jsonl.length, 1);
                    });
            });

            it('test CachedRegionsProvider shrinking', function () {
                const cachedRegionsProvider = getCachedRegionsProvider();

                const lockFilePath = cachedRegionsProvider.persistPath + '.shrink.lock';
                const fd = fs.openSync(lockFilePath, 'w');
                fs.closeSync(fd);

                const rZ0 = Region.fromRegionId('z0');
                const rZ1 = Region.fromRegionId('z1');
                rZ0.createTime = new Date(0);
                should.ok(!rZ0.isLive);

                return cachedRegionsProvider.setRegions([
                    rZ0,
                    rZ1
                ])
                    .then(() => {
                        return cachedRegionsProvider.shrink();
                    })
                    .then(isShrunk => {
                        should.ok(!isShrunk);
                        fs.unlinkSync(lockFilePath);
                    })
                    .catch(err => {
                        // use finally when min version of Node.js update to ≥ v10.3.0
                        fs.unlinkSync(lockFilePath);
                        return Promise.reject(err);
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

            it('test QueryRegionsProvider setter', function () {
                return queryRegionsProvider.setRegions([])
                    .then(
                        () => {
                            should.not.exist('setter should be fail');
                        },
                        (err) => {
                            should.exist(err);
                            return Promise.resolve();
                        }
                    );
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

        describe('test ChainedRegionsProvider', function () {
            it('test ChainedRegionsProvider get early', function () {
                const z0Provider = new StaticRegionsProvider([
                    Region.fromRegionId('z0')
                ]);
                const z1Provider = new StaticRegionsProvider([
                    Region.fromRegionId('z1')
                ]);
                const chainedRegionsProvider = new ChainedRegionsProvider([
                    z0Provider,
                    z1Provider
                ]);
                return chainedRegionsProvider.getRegions()
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z0']);
                        return z1Provider.getRegions();
                    })
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z1']);
                    });
            });

            it('test ChainedRegionsProvider get and set', function () {
                const emptyProvider = new StaticRegionsProvider([
                ]);
                const z1Provider = new StaticRegionsProvider([
                    Region.fromRegionId('z1')
                ]);
                const chainedRegionsProvider = new ChainedRegionsProvider([
                    emptyProvider,
                    z1Provider
                ]);
                return chainedRegionsProvider.getRegions()
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z1']);
                        return emptyProvider.getRegions();
                    })
                    .then(regions => {
                        should.deepEqual(regions.map(r => r.regionId), ['z1']);
                    });
            });
        });
    });
});
