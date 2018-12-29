const should = require('should');
const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');

// eslint-disable-next-line no-undef
before(function(done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !
    process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// eslint-disable-next-line no-undef
describe('test start bucket manager', function() {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var srcBucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    //config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_z0;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);
    //test stat
    // eslint-disable-next-line no-undef
    describe('test stat', function() {
        // eslint-disable-next-line no-undef
        it('test stat', function(done) {
            var bucket = srcBucket;
            var key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function(err, respBody,
                respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('hash', 'fsize', 'mimeType',
                    'putTime', 'type');
                done();
            });
        });
    });

    //test copy and move and delete
    // eslint-disable-next-line no-undef
    describe('test copy', function() {
        // eslint-disable-next-line no-undef
        it('test copy', function(done) {
            var destBucket = srcBucket;
            var srcKey = 'qiniu.mp4';
            var destKey = 'qiniu_copy.mp4';
            var options = {
                force: true,
            };
            bucketManager.copy(srcBucket, srcKey, destBucket, destKey,
                options,
                function(err, respBody, respInfo) {
                    //console.log(respBody);
                    should.not.exist(err);
                    assert.equal(respInfo.statusCode, 200);
                    done();

                    //test move
                    // eslint-disable-next-line no-undef
                    describe('test move', function() {
                        var moveDestKey = 'qiniu_move.mp4';
                        // eslint-disable-next-line no-undef
                        it('test move', function(done1) {
                            bucketManager.move(destBucket, destKey,
                                destBucket, moveDestKey, options,
                                function(err1, ret1, info1) {
                                    should.not.exist(err1);
                                    assert.equal(info1.statusCode, 200);
                                    done1();

                                    //test delete
                                    // eslint-disable-next-line no-undef
                                    describe('test delete', function() {
                                        // eslint-disable-next-line no-undef
                                        it('test delete', function(
                                            done2) {
                                            bucketManager.delete(
                                                destBucket,
                                                moveDestKey,
                                                function(err2, ret2,
                                                    info2) {
                                                    should.not.exist(
                                                        err2);
                                                    assert.equal(info2.statusCode,
                                                        200);
                                                    done2();
                                                });
                                        });
                                    });
                                });
                        });
                    });
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test fetch', function() {
        // eslint-disable-next-line no-undef
        it('test fetch', function(done) {
            var resUrl = 'http://devtools.qiniu.com/qiniu.png';
            var bucket = srcBucket;
            var key = 'qiniu.png';

            bucketManager.fetch(resUrl, bucket, key, function(err,
                respBody) {
                should.not.exist(err);
                respBody.should.have.keys('hash', 'fsize', 'mimeType',
                    'key');
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test changeMime', function() {
        // eslint-disable-next-line no-undef
        it('test changeMime', function(done) {
            var key = 'test_file';
            var bucket = srcBucket;

            bucketManager.changeMime(bucket, key, 'text/html',
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    assert.equal(respInfo.statusCode, 200);
                    done();
                }
            );
        });
    });
    
    // eslint-disable-next-line no-undef
    describe('test changeHeaders', function() {
        // eslint-disable-next-line no-undef
        it('test changeHeaders', function(done) {
            var key = 'test_file';
            var bucket = srcBucket;

            bucketManager.changeHeaders(bucket, key, {
                'Content-Type': 'text/plain',
                'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
                'x-qn-test-custom-header': '0',
            },
            function (err, respBody, respInfo) {
                console.log(respInfo);
                should.not.exist(err);
                assert.equal(respInfo.statusCode, 200);
                done();
            }
            );
        });
    });
});
