const should = require('should');
const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const axios = require('axios');
const console = require('console');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// eslint-disable-next-line no-undef
describe('test start bucket manager', function () {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var srcBucket = proc.env.QINIU_TEST_BUCKET;
    var domain = proc.env.QINIU_TEST_DOMAIN;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    // config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_z0;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);
    // test stat
    // eslint-disable-next-line no-undef
    describe('test stat', function () {
        // eslint-disable-next-line no-undef
        it('test stat', function (done) {
            var bucket = srcBucket;
            var key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function (err, respBody,
                respInfo) {
                console.log(respBody, respInfo);
                should.not.exist(err);
                respBody.should.have.keys('hash', 'fsize', 'mimeType',
                    'putTime', 'type');
                done();
            });
        });
    });

    describe('test privateDownloadUrl', function () {
        it('test privateDownloadUrl', function (done) {
            var key = 'test_file';
            var url = bucketManager.privateDownloadUrl('http://' + domain, key, 20);
            axios.get(url).then((res) => {
                console.log(res.data.toString(), res);
                should.equal(res.status, 200);
                done();
            }).catch((err) => {
                done(err);
            });
        });
    });

    // test copy and move and delete
    // eslint-disable-next-line no-undef
    describe('test copy', function () {
        // eslint-disable-next-line no-undef
        it('test copy', function (done) {
            var destBucket = srcBucket;
            var srcKey = 'qiniu.mp4';
            var destKey = 'qiniu_copy.mp4';
            var options = {
                force: true
            };
            bucketManager.copy(srcBucket, srcKey, destBucket, destKey,
                options,
                function (err, respBody, respInfo) {
                    // console.log(respBody);
                    should.not.exist(err);
                    assert.strictEqual(respInfo.statusCode, 200);
                    done();

                    // test move
                    // eslint-disable-next-line no-undef
                    describe('test move', function () {
                        var moveDestKey = 'qiniu_move.mp4';
                        // eslint-disable-next-line no-undef
                        it('test move', function (done1) {
                            bucketManager.move(destBucket, destKey,
                                destBucket, moveDestKey, options,
                                function (err1, ret1, info1) {
                                    should.not.exist(err1);
                                    assert.strictEqual(info1.statusCode, 200);
                                    done1();

                                    // test delete
                                    // eslint-disable-next-line no-undef
                                    describe('test delete', function () {
                                        // eslint-disable-next-line no-undef
                                        it('test delete', function (
                                            done2) {
                                            bucketManager.delete(
                                                destBucket,
                                                moveDestKey,
                                                function (err2, ret2,
                                                    info2) {
                                                    should.not.exist(
                                                        err2);
                                                    assert.strictEqual(info2.statusCode,
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

    // test copy and deleteAfterDays
    describe('test copy', function () {
        it('test copy', function (done) {
            var destBucket = srcBucket;
            var srcKey = 'qiniu.mp4';
            var destKey = 'qiniu_delete_after_days.mp4';
            var options = {
                force: true
            };
            bucketManager.copy(srcBucket, srcKey, destBucket, destKey, options,
                function (err, respBody, respInfo) {
                    // console.log(respBody);
                    should.not.exist(err);
                    assert.strictEqual(respInfo.statusCode, 200);
                    done();

                    // test deleteAfterDays
                    describe('test deleteAfterDays', function () {
                        it('test deleteAfterDays', function (done1) {
                            bucketManager.deleteAfterDays(destBucket, destKey, 1,
                                function (err1, ret1, info1) {
                                    should.not.exist(err1);
                                    assert.strictEqual(info1.statusCode, 200);
                                    done1();
                                });
                        });
                    });
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test fetch', function () {
        // eslint-disable-next-line no-undef
        it('test fetch', function (done) {
            var resUrl = 'http://devtools.qiniu.com/qiniu.png';
            var bucket = srcBucket;
            var key = 'qiniu.png';

            bucketManager.fetch(resUrl, bucket, key, function (err,
                respBody) {
                should.not.exist(err);
                respBody.should.have.keys('hash', 'fsize', 'mimeType',
                    'key');
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test changeMime', function () {
        // eslint-disable-next-line no-undef
        it('test changeMime', function (done) {
            var key = 'test_file';
            var bucket = srcBucket;

            bucketManager.changeMime(bucket, key, 'text/html',
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    assert.strictEqual(respInfo.statusCode, 200);
                    done();
                }
            );
        });
    });

    // eslint-disable-next-line no-undef
    describe('test changeHeaders', function () {
        // eslint-disable-next-line no-undef
        it('test changeHeaders', function (done) {
            var key = 'test_file';
            var bucket = srcBucket;

            bucketManager.changeHeaders(bucket, key, {
                'Content-Type': 'text/plain',
                'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
                'x-qn-test-custom-header': '0'
            }, function (err, respBody, respInfo) {
                console.log(respInfo);
                should.not.exist(err);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });

    // stat file and changeType
    describe('test changeType', function () {
        it('test changeType', function (done) {
            var key = 'test_file';
            var bucket = srcBucket;
            bucketManager.stat(bucket, key, function (e, res, info) {
                should.not.exist(e);
                assert.strictEqual(info.statusCode, 200);
                var type = res.type === 1 ? 0 : 1;
                bucketManager.changeType(bucket, key, type,
                    function (err, respBody, respInfo) {
                        should.not.exist(err);
                        assert.strictEqual(respInfo.statusCode, 200);
                        done();
                    }
                );
            });
        });
    });

    describe('test updateObjectStatus', function () {
        it('test updateObjectStatus disable', function (done) {
            var key = 'test_file';
            var bucket = srcBucket;
            bucketManager.updateObjectStatus(bucket, key, 1, function (err, respBody, respInfo) {
                should.not.exist(err);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });

        it('test updateObjectStatus enable', function (done) {
            var key = 'test_file';
            var bucket = srcBucket;
            bucketManager.updateObjectStatus(bucket, key, 0, function (err, respBody, respInfo) {
                should.not.exist(err);
                assert.strictEqual(respInfo.statusCode, 200);
                done();
            });
        });
    });

    describe('test listBucket', function () {
        it('test listBucket', function (done) {
            bucketManager.listBucket(function (err,
                respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                respBody.should.containEql(srcBucket);
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test bucketinfo', function () {
        // eslint-disable-next-line no-undef
        it('test bucketinfo', function (done) {
            var bucket = srcBucket;

            bucketManager.getBucketInfo(bucket, function (err,
                respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                done();
            });
        });
    });

    describe('test listPrefix', function () {
        it('test listPrefix', function (done) {
            var bucket = srcBucket;

            bucketManager.listPrefix(bucket, {
                prefix: 'test'
            }, function (err, respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                respBody.should.have.keys('items');
                respBody.items.forEach(function (item) {
                    item.should.have.keys('key', 'hash');
                    item.key.should.startWith('test');
                });
                done();
            });
        });
    });

    describe('test listPrefixV2', function () {
        it('test listPrefixV2', function (done) {
            var bucket = srcBucket;

            bucketManager.listPrefixV2(bucket, {
                prefix: 'test'
            }, function (err, respBody, respInfo) {
                // the irregular data return from Server that Cannot be converted by urllib to JSON Object
                // so err !=null and you can judge respBody==null or err.res.statusCode==200
                should.not.exist(err);
                console.log(respBody + '\n');
                console.log(respInfo);
                done();
            });
        });
    });

    // eslint-disable-next-line no-undef
    // 空间生命周期
    describe('test lifeRule', function () {
        var bucket = srcBucket;
        // add
        describe('test putLifeRule', function () {
            it('test putLifeRule', function (done) {
                var options = {
                    name: 'hello',
                    prefix: 'test'
                };
                bucketManager.putBucketLifecycleRule(bucket, options, function (err,
                    respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        // update
        describe('test updateLifeRule', function () {
            var options = {
                name: 'hello',
                history_to_line_after_days: 10,
                delete_after_days: 10,
                to_line_after_days: 8
            };
            it('test updateLifeRule', function (done) {
                bucketManager.updateBucketLifecycleRule(bucket, options, function (err,
                    respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        // get
        describe('test getLifeRule', function () {
            it('test getLifeRule', function (done) {
                bucketManager.getBucketLifecycleRule(bucket, function (err,
                    respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        // delete
        describe('test deleteLifeRule', function () {
            it('test deleteLifeRule', function (done) {
                bucketManager.deleteBucketLifecycleRule(bucket, 'hello', function (err,
                    respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
    });

    describe('test events', function () {
        var bucket = srcBucket;
        describe('test addEvents', function () {
            it('test addEvents', function (done) {
                var options = {
                    name: 'event_test',
                    event: 'mkfile',
                    callbackURL: 'http://node.ijemy.com/qncback'
                };
                bucketManager.putBucketEvent(bucket, options, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        describe('test updateEvents', function () {
            it('test updateEvents', function (done) {
                var options = {
                    name: 'event_test',
                    event: 'copy',
                    callbackURL: 'http://node.ijemy.com/qncback'
                };
                bucketManager.updateBucketEvent(bucket, options, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        describe('test getEvents', function () {
            it('test getEvents', function (done) {
                bucketManager.getBucketEvent(bucket, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        describe('test deleteEvents', function () {
            it('test deleteEvents', function (done) {
                bucketManager.deleteBucketEvent(bucket, 'event_test', function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
    });

    describe('test referAntiLeech', function () {
        describe('test referAntiLeech', function () {
            var options = {
                mode: 1,
                norefer: 0,
                pattern: '*.iorange.vip'
            };
            var bucket = srcBucket;
            it('test referAntiLeech', function (done) {
                bucketManager.putReferAntiLeech(bucket, options, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
    });

    describe('test corsRules', function () {
        var bucket = srcBucket;
        describe('test putCorsRules', function () {
            it('test putCorsRules', function (done) {
                var body = [];
                var req01 = {
                    allowed_origin: ['http://www.test1.com'],
                    allowed_method: ['GET', 'POST']
                };
                var req02 = {
                    allowed_origin: ['http://www.test2.com'],
                    allowed_method: ['GET', 'POST', 'HEAD'],
                    allowed_header: ['testheader', 'Content-Type'],
                    exposed_header: ['test1', 'test2'],
                    max_age: 20
                };
                body[0] = req01;
                body[1] = req02;

                bucketManager.putCorsRules(bucket, body, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });

        describe('test getCorsRules', function () {
            it('test getCorsRules', function (done) {
                bucketManager.getCorsRules(bucket, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
    });
    //
    // describe('test mirrorConfig', function() {
    //     describe('test getMirrorConfig', function() {
    //         var bucket = srcBucket;
    //         it('test getMirrorConfig', function(done) {
    //             var body = {
    //                 "bucket":bucket,
    //             };
    //             bucketManager.getBucketSourceConfig(body, function(err, respBody, respInfo) {
    //                 should.not.exist(err);
    //                 console.log(JSON.stringify(respBody) + "\n");
    //                 console.log(respInfo);
    //                 done();
    //             });
    //         });
    //     });
    // });

    describe('test accessMode', function () {
        var bucket = srcBucket;
        it('test accessMode', function (done) {
            var mode = 0;
            bucketManager.putBucketAccessStyleMode(bucket, mode, function (err, respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                done();
            });
        });
    });

    describe('test putBucketMaxAge', function () {
        var bucket = srcBucket;
        it('test putBucketMaxAge', function (done) {
            var options = {
                maxAge: 0
            };
            bucketManager.putBucketMaxAge(bucket, options, function (err, respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                done();
            });
        });
    });

    describe('test putBucketAccessMode', function () {
        var bucket = srcBucket;
        it('test putBucketAccessMode', function (done) {
            var options = {
                private: 0
            };
            bucketManager.putBucketAccessMode(bucket, options, function (err, respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                done();
            });
        });
    });

    describe('test bucketQuota', function () {
        var bucket = srcBucket;
        describe('test putBucketQuota', function () {
            it('test putBucketQuota', function (done) {
                var options = {
                    size: 10,
                    count: 10
                };
                bucketManager.putBucketQuota(bucket, options, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
            it('test cancel putBucketQuota', function (done) {
                var options = {
                    size: -1,
                    count: -1
                };
                bucketManager.putBucketQuota(bucket, options, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
        describe('test getBucketQuota', function () {
            it('test getBucketQuota', function (done) {
                bucketManager.getBucketQuota(bucket, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    console.log(JSON.stringify(respBody) + '\n');
                    console.log(respInfo);
                    done();
                });
            });
        });
    });

    describe('test listBucketDomains', function () {
        var bucket = srcBucket;
        it('test listBucketDomains', function (done) {
            bucketManager.listBucketDomains(bucket, function (err, respBody, respInfo) {
                should.not.exist(err);
                console.log(JSON.stringify(respBody) + '\n');
                console.log(respInfo);
                done();
            });
        });
    });
});
