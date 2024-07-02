const should = require('should');

const qiniu = require('../index');
const path = require('path');
const os = require('os');
const fs = require('fs');

describe('test Config class', function () {
    const {
        Config
    } = qiniu.conf;
    const {
        Endpoint,
        Region
    } = qiniu.httpc;
    const {
        Zone_z1
    } = qiniu.zone;

    const {
        getEnvConfig,
        parametrize
    } = require('./conftest');
    const {
        bucketName,
        accessKey
    } = getEnvConfig();

    describe('getUcEndpointsProvider method', function () {
        it('should return the ucEndpointsProvider if it is set', function () {
            const config = new Config({
                ucEndpointsProvider: new Endpoint('www.qiniu.com')
            });
            return config.getUcEndpointsProvider()
                .getEndpoints()
                .then(endpoints => {
                    should.equal(endpoints.length, 1);
                    should.equal(endpoints[0].getValue(), 'https://www.qiniu.com');
                });
        });

        it('should return default Endpoint if ucEndpointsProvider is not set', function () {
            const preferredSchemes = ['http', 'https'];
            return Promise.all(preferredSchemes.map(scheme => {
                const config = new Config();
                if (scheme === 'https') {
                    config.useHttpsDomain = true;
                }
                return config.getUcEndpointsProvider()
                    .getEndpoints()
                    .then(endpoints => {
                        should.equal(endpoints.length, 1);
                        should.equal(endpoints[0].getValue(), `${scheme}://uc.qbox.me`);
                    });
            }));
        });
    });

    describe('getRegionsProvider method', function () {
        it('should return the regionsProvider if it is set', function () {
            const region = Region.fromRegionId('z1');
            const config = new Config({
                regionsProvider: region
            });
            return config.getRegionsProvider()
                .then(regionsProvider => regionsProvider.getRegions())
                .then(regions => {
                    should.equal(regions.length, 1);
                    should.deepEqual(regions[0], region);
                });
        });

        const testParams = parametrize(
            {
                name: 'useHttps',
                values: [
                    undefined,
                    true
                ]
            },
            {
                name: 'useCdnUp',
                values: [
                    undefined,
                    false
                ]
            }
        );

        testParams.forEach(param => {
            const {
                useHttps,
                useCdnUp
            } = param;
            const msg = `params(${JSON.stringify(param)})`;
            it(`test compatibility with zone; ${msg}`, function () {
                const zone = Zone_z1;
                const config = new Config({
                    zone,
                    zoneExpire: Math.floor(Date.now() / 1000) + 604800,
                    useHttpsDomain: useHttps,
                    useCdnDomain: useCdnUp
                });

                return config.getRegionsProvider()
                    .then(regionsProvider => regionsProvider.getRegions())
                    .then(regions => {
                        should.equal(regions.length, 1);
                        regions[0].should.containEql({
                            services: Region.fromZone(
                                zone,
                                {
                                    preferredScheme: useHttps ? 'https' : 'http',
                                    isPreferCdnHost: useCdnUp
                                }
                            ).services,
                            ttl: 604800
                        });
                    });
            });
            it(`should return the defaultProvider; ${msg}`, function () {
                const config = new Config({
                    useHttpsDomain: useHttps,
                    useCdnDomain: useCdnUp
                });

                return config.getRegionsProvider({
                    bucketName,
                    accessKey
                })
                    .then(regionsProvider => regionsProvider.getRegions())
                    .then(regions => {
                        should.ok(regions.length > 0, 'regions length should great than 0');
                    });
            });
        });
    });

    describe('test _getQueryRegionEndpointsProvider', function () {
        it('should return queryRegionsEndpointsProvider', function () {
            const endpointProvider = new Endpoint('www.qiniu.com');
            const config = new Config({
                queryRegionsEndpointsProvider: endpointProvider
            });

            should.equal(
                config._getQueryRegionEndpointsProvider(),
                endpointProvider
            );
        });

        it('should return ucEndpointsProvider', function () {
            const endpointProvider = new Endpoint('www.qiniu.com');
            const config = new Config({
                ucEndpointsProvider: endpointProvider
            });

            should.equal(
                config._getQueryRegionEndpointsProvider(),
                endpointProvider
            );
        });

        const testParams = parametrize(
            {
                name: 'useHttps',
                values: [
                    undefined,
                    true
                ]
            }
        );

        testParams.forEach(param => {
            const msg = `params(${JSON.stringify(param)})`;
            it(`should return default EndpointsProvider; ${msg}`, function () {
                const { useHttps } = param;
                const config = new Config({
                    useHttpsDomain: useHttps
                });

                const preferredScheme = useHttps ? 'https' : 'http';

                return config._getQueryRegionEndpointsProvider()
                    .getEndpoints()
                    .then(endpoints => {
                        const endpointsValues = endpoints.map(e => e.getValue());
                        should.deepEqual(endpointsValues, [
                            `${preferredScheme}://uc.qiniuapi.com`,
                            `${preferredScheme}://kodo-config.qiniuapi.com`,
                            `${preferredScheme}://uc.qbox.me`
                        ]);
                    });
            });
        });
    });

    describe('test disable file cache', function () {
        it('test disable file cache', function () {
            const defaultPersistPath = path.join(os.tmpdir(), 'qn-regions-cache.jsonl');
            try {
                fs.unlinkSync(defaultPersistPath);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    throw e;
                }
            }

            const config = new qiniu.conf.Config();
            config.regionsQueryResultCachePath = null;

            return config.getRegionsProvider({
                bucketName,
                accessKey
            })
                .then(regionsProvider => regionsProvider.getRegions())
                .then(regions => {
                    should.ok(regions.length > 0);
                    should.ok(!fs.existsSync(defaultPersistPath));
                });
        });
    });
});
