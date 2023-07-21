const should = require('should');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

describe('test util functions', function () {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var bucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    var bucketManager = new qiniu.rs.BucketManager(mac, config);

    describe('test prepareZone', function () {
        it('test prepareZone', function (done) {
            config.zone = qiniu.zone.Zone_z0;
            qiniu.util.prepareZone(bucketManager, bucketManager.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.equal(bucketManager, ctx);
                done();
            });
        });

        it('test prepareZone error', function (done) {
            config.zone = null;
            qiniu.util.prepareZone(bucketManager, 'no_ak', 'no_bucket', function (err, ctx) {
                should.exist(err);
                done();
            });
        });

        it('test prepareZone with null', function (done) {
            config.zone = null;
            qiniu.util.prepareZone(bucketManager, bucketManager.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.equal(bucketManager, ctx);
                done();
            });
        });

        it('test prepareZone with zone expired', function (done) {
            config.zoneExpire = -1;
            qiniu.util.prepareZone(bucketManager, bucketManager.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.equal(bucketManager, ctx);
                done();
            });
        });

        it('test prepareZone with zone expired', function (done) {
            config.zoneExpire = parseInt(Date.now() / 1000) - 10;
            qiniu.util.prepareZone(bucketManager, bucketManager.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.equal(bucketManager, ctx);
                done();
            });
        });

        it('test prepareZone with zone not expired', function (done) {
            config.zoneExpire = parseInt(Date.now() / 1000) + 10;
            qiniu.util.prepareZone(bucketManager, bucketManager.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.equal(bucketManager, ctx);
                done();
            });
        });

        it('test formatDateUTC', function () {
            const caseList = [
                {
                    date: new Date('2022-05-19T03:28:46.816Z'),
                    layout: 'YYYY-MM-DD HH:mm:ss.SSS',
                    expect: '2022-05-19 03:28:46.816'
                },
                {
                    date: new Date('2022-05-19T03:28:46.816Z'),
                    layout: 'YYYYMMDDTHHmmssZ',
                    expect: '20220519T032846Z'
                }
            ];

            for (let i = 0; i < caseList.length; i++) {
                const actual = qiniu.util.formatDateUTC(caseList[i].date, caseList[i].layout);
                const expect = caseList[i].expect;
                should.equal(actual, expect);
            }
        });

        it('test canonicalMimeHeaderKey', function () {
            const fieldNames = [
                ':status',
                ':x-test-1',
                ':x-Test-2',
                'content-type',
                'CONTENT-LENGTH',
                'oRiGin',
                'ReFer',
                'Last-Modified',
                'acCePt-ChArsEt',
                'x-test-3',
                'cache-control',
                '七牛'
            ];
            const expectCanonicalFieldNames = [
                ':status',
                ':x-test-1',
                ':x-Test-2',
                'Content-Type',
                'Content-Length',
                'Origin',
                'Refer',
                'Last-Modified',
                'Accept-Charset',
                'X-Test-3',
                'Cache-Control',
                '七牛'
            ];
            should.equal(fieldNames.length, expectCanonicalFieldNames.length);
            for (let i = 0; i < fieldNames.length; i++) {
                should.equal(qiniu.util.canonicalMimeHeaderKey(fieldNames[i]), expectCanonicalFieldNames[i]);
            }
        });

        it('test generateAccessTokenV2', function () {
            const mac = new qiniu.auth.digest.Mac('ak', 'sk');

            const testCases = [
                {
                    method: 'GET',
                    host: undefined,
                    url: 'http://rs.qbox.me',
                    qheaders: {
                        'x-Qiniu-': 'a',
                        'X-qIniu': 'b',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:CK4wBVOL6sLbVE4G4mrXqL_yEc4='
                },
                {
                    method: 'GET',
                    host: undefined,
                    url: 'http://rs.qbox.me',
                    qheaders: {
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:CK4wBVOL6sLbVE4G4mrXqL_yEc4='
                },
                {
                    method: 'GET',
                    host: undefined,
                    url: 'http://rs.qbox.me',
                    qheaders: {
                        'Content-Type': 'application/json'
                    },
                    contentType: 'application/json',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:ksh7bJBnBzFO0yxJ_tLLUcg0csM='
                },
                {
                    method: 'POST',
                    host: undefined,
                    url: 'http://rs.qbox.me',
                    qheaders: {
                        'Content-Type': 'application/json',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/json',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:IlW01tHjGQ0pGPXV_3jjR1AdD34='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:156x8Q4x1zadPcAyMRVDsioIyAk='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'Content-Type': 'application/json',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/json',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:eOaX4RziJPW9ywnJ02jshmEMfhI='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'Content-Type': 'application/octet-stream',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/octet-stream',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:GQQrYvDCdN_RaVjyJC7hIkv5TYk='
                },
                {
                    method: 'gET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'Content-Type': 'application/json',
                        'X-Qiniu-Bbb': 'BBB',
                        'x-qIniu-aAa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/json',
                    body: '{"name": "test"}',
                    exceptSignToken: 'Qiniu ak:eOaX4RziJPW9ywnJ02jshmEMfhI='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: 'name=test&language=go',
                    exceptSignToken: 'Qiniu ak:A5PMXECSPZQxitJqLj0op2B2GEM='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com',
                    qheaders: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: 'name=test&language=go',
                    exceptSignToken: 'Qiniu ak:A5PMXECSPZQxitJqLj0op2B2GEM='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com/mkfile/sdf.jpg',
                    qheaders: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: 'name=test&language=go',
                    exceptSignToken: 'Qiniu ak:fkRck5_LeyfwdkyyLk-hyNwGKac='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com/mkfile/sdf.jpg?s=er3&df',
                    qheaders: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: 'application/x-www-form-urlencoded',
                    body: 'name=test&language=go',
                    exceptSignToken: 'Qiniu ak:PUFPWsEUIpk_dzUvvxTTmwhp3p4='
                },
                {
                    method: 'GET',
                    host: 'upload.qiniup.com',
                    url: 'http://upload.qiniup.com/mkfile/sdf.jpg?s=er3&df',
                    qheaders: {
                        'X-Qiniu-Bbb': 'BBB',
                        'X-Qiniu-Aaa': 'DDD',
                        'X-Qiniu-': 'a',
                        'X-Qiniu': 'b'
                    },
                    contentType: undefined,
                    body: 'name=test&language=go',
                    exceptSignToken: 'Qiniu ak:PUFPWsEUIpk_dzUvvxTTmwhp3p4='
                }
            ];
            for (const testCase of testCases) {
                should.equal(
                    qiniu.util.generateAccessTokenV2(
                        mac,
                        testCase.url,
                        testCase.method,
                        testCase.contentType,
                        testCase.body,
                        testCase.qheaders
                    ),
                    testCase.exceptSignToken
                );
            }
        });

        it('test encodedEntry', function () {
            const caseList = [
                {
                    msg: 'normal',
                    bucket: 'qiniuphotos',
                    key: 'gogopher.jpg',
                    expect: 'cWluaXVwaG90b3M6Z29nb3BoZXIuanBn'
                },
                {
                    msg: 'key empty',
                    bucket: 'qiniuphotos',
                    key: '',
                    expect: 'cWluaXVwaG90b3M6'
                },
                {
                    msg: 'key undefined',
                    bucket: 'qiniuphotos',
                    key: undefined,
                    expect: 'cWluaXVwaG90b3M='
                },
                {
                    msg: 'key need replace plus symbol',
                    bucket: 'qiniuphotos',
                    key: '012ts>a',
                    expect: 'cWluaXVwaG90b3M6MDEydHM-YQ=='
                },
                {
                    msg: 'key need replace slash symbol',
                    bucket: 'qiniuphotos',
                    key: '012ts?a',
                    expect: 'cWluaXVwaG90b3M6MDEydHM_YQ=='
                }
            ];

            for (let i = 0; i < caseList.length; i++) {
                const actual = qiniu.util.encodedEntry(caseList[i].bucket, caseList[i].key);
                const expect = caseList[i].expect;
                const msg = caseList[i].msg;
                should.equal(actual, expect, msg);
            }
        });
    });

    describe('test prepareZone with change hosts config', function () {
        let bucketManagerNoCtxCache = new qiniu.rs.BucketManager(mac, config);

        before(function () {
            bucketManagerNoCtxCache = new qiniu.rs.BucketManager(mac, config);
        });

        after(function () {
            qiniu.conf.UC_HOST = 'uc.qbox.me';
            qiniu.conf.QUERY_REGION_HOST = 'kodo-config.qiniuapi.com';
            qiniu.conf.QUERY_REGION_BACKUP_HOSTS = [
                'uc.qbox.me',
                'api.qiniu.com'
            ];
        });

        it('test prepareZone with custom query domain', function (done) {
            should.not.exist(bucketManagerNoCtxCache.config.zone);

            qiniu.conf.QUERY_REGION_HOST = 'uc.qbox.me';

            qiniu.util.prepareZone(bucketManagerNoCtxCache, bucketManagerNoCtxCache.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.exist(ctx.config.zone);
                done();
            });
        });

        it('test prepareZone with backup domain', function (done) {
            should.not.exist(bucketManagerNoCtxCache.config.zone);

            qiniu.conf.QUERY_REGION_HOST = 'fake-uc.csharp.qiniu.com';
            qiniu.conf.QUERY_REGION_BACKUP_HOSTS = [
                'unavailable-uc.csharp.qiniu.com',
                'uc.qbox.me'
            ];

            qiniu.util.prepareZone(bucketManagerNoCtxCache, bucketManagerNoCtxCache.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.exist(ctx.config.zone);
                done();
            });
        });

        it('test prepareZone with uc and backup domains', function (done) {
            should.not.exist(bucketManagerNoCtxCache.config.zone);

            qiniu.conf.UC_HOST = 'fake-uc.csharp.qiniu.com';
            qiniu.conf.QUERY_REGION_BACKUP_HOSTS = [
                'unavailable-uc.csharp.qiniu.com',
                'uc.qbox.me'
            ];

            qiniu.util.prepareZone(bucketManagerNoCtxCache, bucketManagerNoCtxCache.mac.accessKey, bucket, function (err, ctx) {
                should.not.exist(err);
                should.exist(ctx.config.zone);
                done();
            });
        });
    });
});
