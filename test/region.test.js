const should = require('should');

const qiniu = require('../index');

const {
    Endpoint,
    StaticEndpointsProvider,
    SERVICE_NAME,
    Region,
    StaticRegionsProvider,
    CachedRegionsProvider,
    ChainedRegionsProvider
} = qiniu.httpc;
const {
    // eslint-disable-next-line camelcase
    Zone_z0,
    // eslint-disable-next-line camelcase
    Zone_z1
} = qiniu.zone;

describe('test region module', function () {
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
                createTime: new Date(Date.now() - 86400e3),
                ttl: 3600
            });

            should.equal(region.regionId, 'z0');
            should.equal(region.s3RegionId, 'z');
            should.deepEqual(
                Object.keys(region.services).sort(),
                // use Object.values when min version of Node.js update to ≥ v7.5.0
                Object.keys(SERVICE_NAME).map(k => SERVICE_NAME[k]).concat(['custom-service']).sort()
            );
            should.ok(new Date(Date.now() - 86400e3).getTime() - region.createTime.getTime() < 1000);
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
        it('test StaticRegionsProvider', function () {
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
    });
});
