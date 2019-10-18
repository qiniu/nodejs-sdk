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
    });
});
