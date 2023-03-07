const should = require('should');
const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const urllib = require('urllib');
const console = require('console');
const mockDate = require('mockdate');

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
    this.timeout(0);

    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var srcBucket = proc.env.QINIU_TEST_BUCKET;
    var domain = proc.env.QINIU_TEST_DOMAIN;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    // config.useCdnDomain = true;
    config.useHttpsDomain = true;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);

    const keysToDeleteAfter = [];
    after(function (done) {
        const deleteOps = [];
        keysToDeleteAfter.forEach(function (key) {
            deleteOps.push(qiniu.rs.deleteOp(srcBucket, key));
        });

        deleteOps.length && bucketManager.batch(deleteOps, function (respErr, respBody) {
            respBody.forEach(function (ret, i) {
                ret.code.should.be.eql(
                    200,
                    JSON.stringify({
                        key: keysToDeleteAfter[i],
                        ret: ret
                    })
                );
            });
            done();
        });
    });

    // TODO: using this method to wrapper all operation. done tests:
    //       - restoreAr
    //       - setObjectLifecycle
    function testObjectOperationWrapper (destBucket, destObjectKey, callback) {
        const srcKey = 'qiniu.mp4';
        const destKey = destObjectKey + Math.random();
        const options = {
            force: true
        };
        bucketManager.copy(srcBucket, srcKey, destBucket, destKey, options,
            function (err, respBody, respInfo) {
                // console.log(respBody);
                should.not.exist(err);
                respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                keysToDeleteAfter.push(destKey);
                callback(destKey);
            });
    }
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
            urllib.request(url, function (err, respBody, respInfo) {
                console.log(respBody.toString(), respInfo);
                should.not.exist(err);
                should.equal(respInfo.status, 200);
                done();
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
            const resUrl = 'http://devtools.qiniu.com/qiniu.png';
            const bucket = srcBucket;
            const key = 'qiniu.png';

            bucketManager.fetch(resUrl, bucket, key,
                function (err, respBody, respInfo) {
                    should.not.exist(err, respInfo);
                    respBody.should.have.keys(
                        'hash',
                        'fsize',
                        'mimeType',
                        'key'
                    );
                    done();
                }
            );
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
                console.log(JSON.stringify(respInfo));
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
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                console.log(JSON.stringify(respInfo));
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
            }, function (_err, respBody, respInfo) {
                // the irregular data return from Server that Cannot be converted by urllib to JSON Object
                // so err !=null and you can judge respBody==null or err.res.statusCode==200
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                done();
            });
        });
    });

    // 空间生命周期
    describe('test lifeRule', function () {
        const bucket = srcBucket;
        const ruleName = 'test_rule_name';

        function testGet (expectItem, nextCall, otherRespInfo) {
            bucketManager.getBucketLifecycleRule(
                bucket,
                function (
                    err,
                    respBody,
                    respInfo
                ) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    if (!expectItem && !respBody) {
                        nextCall();
                        return;
                    }
                    const actualItem = respBody.find(function (item) {
                        return item.name === ruleName;
                    });
                    if (!expectItem) {
                        should.not.exist(actualItem);
                        nextCall();
                        return;
                    }
                    should.exist(actualItem, JSON.stringify({
                        respInfo: respInfo,
                        otherRespInfo: otherRespInfo
                    }));
                    actualItem.should.have.properties(expectItem);
                    nextCall();
                }
            );
        }

        before(function (done) {
            bucketManager.deleteBucketLifecycleRule(bucket, ruleName, done);
        });

        it('test lifeRule put', function (done) {
            const options = {
                name: ruleName,
                prefix: 'test',
                to_line_after_days: 30,
                to_archive_after_days: 40,
                to_deep_archive_after_days: 50,
                delete_after_days: 65
            };
            bucketManager.putBucketLifecycleRule(
                bucket,
                options,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    testGet({
                        prefix: 'test',
                        to_line_after_days: 30,
                        to_archive_after_days: 40,
                        to_deep_archive_after_days: 50,
                        delete_after_days: 65,
                        history_delete_after_days: 0,
                        history_to_line_after_days: 0
                    }, done, respInfo);
                }
            );
        });

        it('test lifeRule update', function (done) {
            const options = {
                name: ruleName,
                prefix: 'update_prefix',
                to_line_after_days: 30,
                to_archive_after_days: 50,
                to_deep_archive_after_days: 60,
                delete_after_days: 65
            };
            bucketManager.updateBucketLifecycleRule(
                bucket,
                options,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));

                    testGet({
                        prefix: 'update_prefix',
                        to_line_after_days: 30,
                        to_archive_after_days: 50,
                        to_deep_archive_after_days: 60,
                        delete_after_days: 65,
                        history_delete_after_days: 0,
                        history_to_line_after_days: 0
                    }, done, respInfo);
                }
            );
        });

        it('test lifeRule delete', function (done) {
            bucketManager.deleteBucketLifecycleRule(
                bucket,
                ruleName,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    testGet(null, done, respInfo);
                }
            );
        });
    });

    describe('test object lifecycle', function () {
        const bucket = srcBucket;

        it('test setObjectLifeCycle', function (done) {
            testObjectOperationWrapper(bucket, 'test_set_object_lifecycle', function (key) {
                bucketManager.setObjectLifeCycle(
                    bucket,
                    key,
                    {
                        toIaAfterDays: 10,
                        toArchiveAfterDays: 20,
                        toDeepArchiveAfterDays: 30,
                        deleteAfterDays: 40
                    },
                    function (err, respBody, respInfo) {
                        should.not.exist(err);
                        respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                        done();
                    }
                );
            });
        });

        it('test setObjectLifeCycle with cond', function (done) {
            testObjectOperationWrapper(bucket, 'test_set_object_lifecycle_cond', function (key) {
                bucketManager.stat(bucket, key, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    const { hash } = respBody;

                    bucketManager.setObjectLifeCycle(
                        bucket,
                        key,
                        {
                            toIaAfterDays: 10,
                            toArchiveAfterDays: 20,
                            toDeepArchiveAfterDays: 30,
                            deleteAfterDays: 40,
                            cond: {
                                hash: hash
                            }
                        },
                        function (err, respBody, respInfo) {
                            should.not.exist(err);
                            respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                            done();
                        }
                    );
                });
            });
        });
    });

    describe('test events', function () {
        const bucket = srcBucket;
        const eventName = 'event_test';

        before(function (done) {
            bucketManager.deleteBucketEvent(
                bucket,
                eventName,
                function () {
                    done();
                }
            );
        });

        it('test addEvents', function (done) {
            const options = {
                name: eventName,
                event: 'mkfile',
                callbackURL: 'http://node.ijemy.com/qncback'
            };
            bucketManager.putBucketEvent(
                bucket,
                options,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                }
            );
        });

        it('test updateEvents', function (done) {
            const options = {
                name: eventName,
                event: 'copy',
                callbackURL: 'http://node.ijemy.com/qncback'
            };
            bucketManager.updateBucketEvent(
                bucket,
                options,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                }
            );
        });

        it('test getEvents', function (done) {
            bucketManager.getBucketEvent(
                bucket,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                }
            );
        });

        it('test deleteEvents', function (done) {
            bucketManager.deleteBucketEvent(
                bucket,
                eventName,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                }
            );
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
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                });
            });
        });

        describe('test getCorsRules', function () {
            it('test getCorsRules', function (done) {
                bucketManager.getCorsRules(bucket, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
    //                 console.log(JSON.stringify(respInfo));
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
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                done();
            });
        });
    });

    describe('test restoreAr', function () {
        const bucket = srcBucket;

        function changeType (key, type, callback) {
            bucketManager.changeType(
                bucket,
                key,
                type,
                function (err, respBody, respInfo) {
                    should.not.exist(err);
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    callback();
                }
            );
        }

        it('test restoreAr Archive', function (done) {
            testObjectOperationWrapper(bucket, 'test_restore_ar_archive', function (key) {
                // change file type to Archive
                changeType(key, 2, function () {
                    const freezeAfterDays = 1;
                    const entry = bucket + (key ? ':' + key : '');
                    bucketManager.restoreAr(entry, freezeAfterDays, function (err, respBody, respInfo) {
                        should.not.exist(err);
                        respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                        done();
                    });
                });
            });
        });

        it('test restoreAr DeepArchive', function (done) {
            testObjectOperationWrapper(bucket, 'test_restore_ar_deep_archive', function (key) {
                // change file type to DeepArchive
                changeType(key, 3, function () {
                    const freezeAfterDays = 2;
                    const entry = bucket + (key ? ':' + key : '');
                    bucketManager.restoreAr(entry, freezeAfterDays, function (err, respBody, respInfo) {
                        should.not.exist(err);
                        respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                        done();
                    });
                });
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
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                    done();
                });
            });
        });
        describe('test getBucketQuota', function () {
            it('test getBucketQuota', function (done) {
                bucketManager.getBucketQuota(bucket, function (err, respBody, respInfo) {
                    should.not.exist(err);
                    should.equal(respInfo.status, 200, JSON.stringify(respInfo));
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
                should.equal(respInfo.status, 200, JSON.stringify(respInfo));
                done();
            });
        });
    });

    describe('test invalid X-Qiniu-Date', function () {
        beforeEach(function () {
            mockDate.set(new Date(0));
        });

        afterEach(function () {
            delete process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE;
        });

        after(function () {
            mockDate.reset();
        });

        it('test invalid X-Qiniu-Date expect 403', function (done) {
            const bucket = srcBucket;
            const key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function (
                err,
                respBody,
                respInfo
            ) {
                should.not.exist(err);
                respInfo.statusCode.should.be.eql(403, JSON.stringify(respInfo));
                done();
            });
        });

        it('test invalid X-Qiniu-Date expect 200 by disable date sign', function (done) {
            const mac = new qiniu.auth.digest.Mac(
                accessKey,
                secretKey,
                { disableQiniuTimestampSignature: true }
            );
            const config = new qiniu.conf.Config({
                useHttpsDomain: true
            });
            const bucketManager = new qiniu.rs.BucketManager(mac, config);

            const bucket = srcBucket;
            const key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function (
                err,
                respBody,
                respInfo
            ) {
                should.not.exist(err, JSON.stringify(respInfo));
                respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                respBody.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'putTime',
                    'type'
                );
                done();
            });
        });

        it('test invalid X-Qiniu-Date env expect 200', function (done) {
            process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE = 'true';
            const bucket = srcBucket;
            const key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function (
                err,
                respBody,
                respInfo
            ) {
                should.not.exist(err, JSON.stringify(respInfo));
                respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                respBody.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'putTime',
                    'type'
                );
                done();
            });
        });
        it('test invalid X-Qiniu-Date env be ignored expect 403', function (done) {
            process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE = 'true';
            const mac = new qiniu.auth.digest.Mac(
                accessKey,
                secretKey,
                { disableQiniuTimestampSignature: false }
            );
            const config = new qiniu.conf.Config({
                useHttpsDomain: true
            });
            const bucketManager = new qiniu.rs.BucketManager(mac, config);

            const bucket = srcBucket;
            const key = 'qiniu.mp4';
            bucketManager.stat(bucket, key, function (
                err,
                respBody,
                respInfo
            ) {
                should.not.exist(err);
                respInfo.statusCode.should.be.eql(403, JSON.stringify(respInfo));
                done();
            });
        });
    });

    describe('test bucket image source', function () {
        it('test set image', function (done) {
            bucketManager.image(
                srcBucket,
                'http://devtools.qiniu.com/',
                'devtools.qiniu.com',
                function (err, respBody, respInfo) {
                    should.not.exist(err, JSON.stringify(respInfo));
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    done();
                }
            );
        });

        it('test unset image', function (done) {
            bucketManager.unimage(
                srcBucket,
                function (err, respBody, respInfo) {
                    should.not.exist(err, JSON.stringify(respInfo));
                    respInfo.statusCode.should.be.eql(200, JSON.stringify(respInfo));
                    done();
                }
            );
        });
    });
});
