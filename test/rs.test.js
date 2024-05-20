const should = require('should');

const mockDate = require('mockdate');

const qiniu = require('../index.js');

const {
    getEnvConfig,
    checkEnvConfigAndExit,
    doAndWrapResultPromises
} = require('./conftest');

before(function () {
    checkEnvConfigAndExit();
});

describe('test start bucket manager', function () {
    this.timeout(0);

    const {
        accessKey,
        secretKey,
        bucketName,
        domain
    } = getEnvConfig();
    // const srcBucket = bucketName;
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const config = new qiniu.conf.Config();
    // config.useCdnDomain = true;
    // config.useHttpsDomain = true;
    const bucketManager = new qiniu.rs.BucketManager(mac, config);

    // clean up objects after test
    const keysToDeleteAfter = [];
    after(function () {
        const deleteOps = [];
        keysToDeleteAfter.forEach(function (key) {
            deleteOps.push(qiniu.rs.deleteOp(bucketName, key));
        });

        if (!deleteOps.length) {
            return;
        }

        return bucketManager.batch(deleteOps)
            .then(({ data, resp }) => {
                if (!Array.isArray(data)) {
                    console.log(resp);
                    return;
                }
                data.forEach(function (ret, i) {
                    ret.code.should.be.oneOf(200, 612);
                });
            });
    });

    /**
     * copy an object to new object with random key
     * the new object will be auto clean after test
     * @param {string} destBucket
     * @param {string} destObjectKey
     * @returns {Promise<string>}
     */
    function getObjectRandomKey (destBucket, destObjectKey, autoCleanup = true) {
        const srcKey = 'qiniu.mp4';
        const destKey = destObjectKey + Math.floor(Math.random() * 100000);
        const options = {
            force: true
        };
        return bucketManager.copy(bucketName, srcKey, destBucket, destKey, options)
            .then(({ resp }) => {
                resp.statusCode.should.be.eql(200, JSON.stringify(resp));
                if (autoCleanup) {
                    keysToDeleteAfter.push(destKey);
                }
                return destKey;
            });
    }

    describe('test stat', function () {
        it('test stat', function () {
            const key = 'qiniu.mp4';
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.stat(bucketName, key, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'putTime',
                    'type'
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test privateDownloadUrl', function () {
        it('test privateDownloadUrl', function () {
            const key = 'test_file';
            const url = bucketManager.privateDownloadUrl('http://' + domain, key, 20);
            return qiniu.rpc.qnHttpClient.sendRequest({
                url: url,
                urllibOptions: {
                    method: 'GET'
                }
            })
                .then(({ resp }) => {
                    should.equal(resp.statusCode, 200, JSON.stringify(resp));
                });
        });
    });

    describe('test move', function () {
        it('test move to exist object without force', function () {
            const destBucket = bucketName;
            const destKey = 'qiniu-move-non-force';

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(destBucket, destKey)
                    .then(key => Promise.all([
                        key,
                        getObjectRandomKey(destBucket, destKey)
                    ]))
                    .then(([key, existKey]) =>
                        bucketManager.move(
                            destBucket,
                            key,
                            destBucket,
                            existKey,
                            undefined,
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 614, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test move to exist object with force', function () {
            const destBucket = bucketName;
            const destKey = 'qiniu-move-force';
            const options = {
                force: true
            };

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(destBucket, destKey)
                    .then(key => Promise.all([
                        key,
                        getObjectRandomKey(destBucket, destKey)
                    ]))
                    .then(([key, existKey]) =>
                        bucketManager.move(
                            destBucket,
                            key,
                            destBucket,
                            existKey,
                            options,
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    // test copy
    describe('test copy', function () {
        it('test copy to exist object without force', function () {
            const destBucket = bucketName;
            const destKey = 'qiniu-copy-non-force';

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(destBucket, destKey)
                    .then(key => Promise.all([
                        key,
                        getObjectRandomKey(destBucket, destKey)
                    ]))
                    .then(([key, existKey]) =>
                        bucketManager.copy(
                            destBucket,
                            key,
                            destBucket,
                            existKey,
                            undefined,
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 614, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test copy to exist object without force', function () {
            const destBucket = bucketName;
            const destKey = 'qiniu-copy-force';
            const options = {
                force: true
            };

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(destBucket, destKey)
                    .then(key => Promise.all([
                        key,
                        getObjectRandomKey(destBucket, destKey)
                    ]))
                    .then(([key, existKey]) =>
                        bucketManager.copy(
                            destBucket,
                            key,
                            destBucket,
                            existKey,
                            options,
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test fetch', function () {
        it('test fetch', function () {
            const resUrl = 'http://devtools.qiniu.com/qiniu.png';
            const bucket = bucketName;
            const key = 'qiniu.png';

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.fetch(resUrl, bucket, key, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'key'
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test changeMime', function () {
        it('test changeMime', function () {
            let actualKey = '';
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'change-mime')
                    .then(key => {
                        actualKey = key;
                        return key;
                    })
                    .then(key =>
                        bucketManager.changeMime(bucketName, key, 'text/html', callback)
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return bucketManager.stat(bucketName, actualKey)
                    .then(({ data, resp: statResp }) => {
                        should.equal(data.mimeType, 'text/html', JSON.stringify(statResp));
                    });
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test changeHeaders', function () {
        it('test changeHeaders', function () {
            let actualKey = '';

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'change-headers')
                    .then(key => {
                        actualKey = key;
                        return key;
                    })
                    .then(key =>
                        bucketManager.changeHeaders(
                            bucketName,
                            key,
                            {
                                'Content-Type': 'text/plain',
                                'Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
                                'x-qn-test-custom-header': '0'
                            },
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return bucketManager.stat(bucketName, actualKey)
                    .then(({ data }) => {
                        data['x-qn-meta'].should.containEql({
                            '!Content-Type': 'text/plain',
                            '!Last-Modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
                            '!x-qn-test-custom-header': '0'
                        });
                    });
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test changeType', function () {
        it('test changeType', function () {
            let actualKey = '';

            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'change-type')
                    .then(key => {
                        actualKey = key;
                        return key;
                    })
                    .then(key =>
                        bucketManager.changeType(bucketName, key, 1, callback)
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return bucketManager.stat(bucketName, actualKey)
                    .then(({ data, resp: statResp }) => {
                        should.equal(data.type, 1, JSON.stringify(statResp));
                    });
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test updateObjectStatus', function () {
        let actualKey = '';

        before(function () {
            return getObjectRandomKey(bucketName, 'file-status')
                .then(key => {
                    actualKey = key;
                });
        });

        it('test updateObjectStatus disable', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.updateObjectStatus(bucketName, actualKey, 1, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test updateObjectStatus enable', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.updateObjectStatus(bucketName, actualKey, 0, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test listBucket', function () {
        it('test listBucket', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.listBucket(callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.containEql(bucketName);
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test listBucket shared', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.listBucket(
                    {
                        shared: 'rd'
                    },
                    callback
                )
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.containEql(bucketName);
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        const testParams4TagCondition = [
            {
                sdk: 'nodejs'
            },
            {
                sdk: '',
                lang: null
            },
            {
                sdk: 'nodejs',
                lang: 'javascript'
            }
        ];

        testParams4TagCondition.forEach(cond => {
            it(`test listBucket tagCondition(${JSON.stringify(cond)})`, function () {
                const promises = doAndWrapResultPromises(callback =>
                    bucketManager.listBucket(
                        {
                            tagCondition: cond
                        },
                        callback
                    )
                );

                const checkFunc = ({ data, resp }) => {
                    should.equal(resp.statusCode, 200, JSON.stringify(resp));
                    data.should.containEql(bucketName);
                };

                return promises.callback
                    .then(checkFunc)
                    .then(() => promises.native)
                    .then(checkFunc);
            });
        });
    });

    describe('test bucketInfo', function () {
        it('test bucketInfo', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.getBucketInfo(bucketName, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test createBucket and deleteBucket', function () {
        const targetBucketName = bucketName + 'creating' + Math.floor(Math.random() * 100000);
        it('test createBucket', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.createBucket(
                    targetBucketName,
                    callback
                )
            );

            const checkFunc = ({
                _,
                resp
            }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test deleteBucket', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.deleteBucket(
                    targetBucketName,
                    callback
                )
            );

            const checkFunc = ({
                _,
                resp
            }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test listPrefix', function () {
        it('test listPrefix', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.listPrefix(
                    bucketName,
                    {
                        prefix: 'test'
                    },
                    callback
                )
            );

            const checkFunc = ({
                data,
                resp
            }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));

                data.should.have.keys('items');
                data.items.forEach(function (item) {
                    item.should.have.keys('key', 'hash');
                    item.key.should.startWith('test');
                });
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test listPrefixV2', function () {
        it('test listPrefixV2', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.listPrefixV2(
                    bucketName,
                    {
                        prefix: 'test'
                    },
                    callback
                )
            );

            const checkFunc = ({
                resp
            }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .catch(err => checkFunc({ resp: err.resp }));
        });
    });

    // 空间生命周期
    describe('test lifeRule', function () {
        const ruleName = 'test_rule_name' + Math.floor(Math.random() * 100000);
        const randomPrefix = 'test' + Math.floor(Math.random() * 100000);

        function testGet (expectItem, otherRespInfo) {
            return bucketManager.getBucketLifecycleRule(bucketName)
                .then(({ data, resp }) => {
                    should.equal(resp.statusCode, 200, JSON.stringify(resp));
                    if (!expectItem && !data) {
                        return;
                    }
                    const actualItem = data.find(function (item) {
                        return item.name === ruleName;
                    });
                    if (!expectItem) {
                        should.not.exist(actualItem);
                        return;
                    }
                    should.exist(actualItem, JSON.stringify({
                        resp: resp,
                        otherResp: otherRespInfo
                    }));
                    actualItem.should.have.properties(expectItem);
                });
        }

        before(function () {
            return bucketManager.deleteBucketLifecycleRule(bucketName, ruleName)
                .catch(() => {});
        });

        it('test lifeRule put', function () {
            const options = {
                name: ruleName,
                prefix: randomPrefix,
                to_line_after_days: 30,
                to_archive_ir_after_days: 35,
                to_archive_after_days: 40,
                to_deep_archive_after_days: 50,
                delete_after_days: 65
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketLifecycleRule(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return testGet(
                    {
                        prefix: randomPrefix,
                        to_line_after_days: 30,
                        to_archive_ir_after_days: 35,
                        to_archive_after_days: 40,
                        to_deep_archive_after_days: 50,
                        delete_after_days: 65,
                        history_delete_after_days: 0,
                        history_to_line_after_days: 0
                    },
                    resp
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test lifeRule update', function () {
            const expectedPrefix = `update_${randomPrefix}`;
            const options = {
                name: ruleName,
                prefix: expectedPrefix,
                to_line_after_days: 30,
                to_archive_ir_after_days: 40,
                to_archive_after_days: 50,
                to_deep_archive_after_days: 60,
                delete_after_days: 65
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.updateBucketLifecycleRule(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return testGet(
                    {
                        prefix: expectedPrefix,
                        to_line_after_days: 30,
                        to_archive_ir_after_days: 40,
                        to_archive_after_days: 50,
                        to_deep_archive_after_days: 60,
                        delete_after_days: 65,
                        history_delete_after_days: 0,
                        history_to_line_after_days: 0
                    },
                    resp
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test lifeRule delete', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.deleteBucketLifecycleRule(bucketName, ruleName, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                return testGet(
                    null,
                    resp
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test object lifecycle', function () {
        it('test deleteAfterDays', function () {
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'delete-after-days')
                    .then(key =>
                        bucketManager.deleteAfterDays(bucketName, key, 1, callback)
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test setObjectLifeCycle', function () {
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'set-object-lifecycle')
                    .then(key =>
                        bucketManager.setObjectLifeCycle(
                            bucketName,
                            key,
                            {
                                toIaAfterDays: 10,
                                toArchiveIRAfterDays: 15,
                                toArchiveAfterDays: 20,
                                toDeepArchiveAfterDays: 30,
                                deleteAfterDays: 40
                            },
                            callback
                        )
                    )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test setObjectLifeCycle with cond', function () {
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'set-object-lifecycle-cond')
                    .then(key => Promise.all([
                        key,
                        bucketManager.stat(bucketName, key)
                    ]))
                    .then(([key, { data, resp }]) => {
                        should.equal(resp.statusCode, 200, JSON.stringify(resp));
                        return bucketManager.setObjectLifeCycle(
                            bucketName,
                            key,
                            {
                                toIaAfterDays: 10,
                                toArchiveIRAfterDays: 15,
                                toArchiveAfterDays: 20,
                                toDeepArchiveAfterDays: 30,
                                deleteAfterDays: 40,
                                cond: {
                                    hash: data.hash
                                }
                            },
                            callback
                        );
                    })
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test events', function () {
        const bucketName4Test = 'event-test-bucket' + Math.floor(Math.random() * 100000);
        const eventName = 'event_test' + Math.floor(Math.random() * 100000);

        before(function () {
            return bucketManager.createBucket(
                bucketName4Test,
                {
                    regionId: 'z0'
                }
            );
        });

        after(function () {
            return bucketManager.deleteBucket(
                bucketName4Test
            );
        });

        it('test addEvents', function () {
            const options = {
                name: eventName,
                event: 'mkfile',
                callbackURL: 'http://node.ijemy.com/qncback'
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketEvent(
                    bucketName4Test,
                    options,
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test updateEvents', function () {
            const options = {
                name: eventName,
                event: 'copy',
                callbackURL: 'http://node.ijemy.com/qncback'
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.updateBucketEvent(
                    bucketName4Test,
                    options,
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test getEvents', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.getBucketEvent(
                    bucketName4Test,
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test deleteEvents', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.deleteBucketEvent(
                    bucketName4Test,
                    eventName,
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test referAntiLeech', function () {
        it('test referAntiLeech', function () {
            const options = {
                mode: 1,
                norefer: 0,
                pattern: '*.iorange.vip'
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putReferAntiLeech(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test corsRules', function () {
        it('test putCorsRules', function () {
            const req01 = {
                allowed_origin: ['http://www.test1.com'],
                allowed_method: ['GET', 'POST']
            };
            const req02 = {
                allowed_origin: ['http://www.test2.com'],
                allowed_method: ['GET', 'POST', 'HEAD'],
                allowed_header: ['testheader', 'Content-Type'],
                exposed_header: ['test1', 'test2'],
                max_age: 20
            };
            const body = [
                req01,
                req02
            ];

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putCorsRules(bucketName, body, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test getCorsRules', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.getCorsRules(bucketName, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test accessMode', function () {
        it('test accessMode', function () {
            const mode = 0;
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketAccessStyleMode(bucketName, mode, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test restoreAr', function () {
        function changeType (bucket, key, type) {
            return bucketManager.changeType(
                bucket,
                key,
                type
            )
                .then(({ resp }) => {
                    should.equal(resp.statusCode, 200, JSON.stringify(resp));
                    return key;
                });
        }

        it('test restoreAr Archive', function () {
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'test-restore-ar-archive')
                    .then(key =>
                        // change file type to Archive
                        changeType(bucketName, key, 2)
                    )
                    .then(key => {
                        const freezeAfterDays = 1;
                        const entry = key ? `${bucketName}:${key}` : bucketName;
                        return bucketManager.restoreAr(entry, freezeAfterDays, callback);
                    })
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test restoreAr DeepArchive', function () {
            const promises = doAndWrapResultPromises(callback =>
                getObjectRandomKey(bucketName, 'test-restore-ar-deep-archive')
                    .then(key =>
                        // change file type to DeepArchive
                        changeType(bucketName, key, 3, callback)
                    )
                    .then(key => {
                        const freezeAfterDays = 2;
                        const entry = key ? `${bucketName}:${key}` : bucketName;
                        return bucketManager.restoreAr(entry, freezeAfterDays, callback);
                    })
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test putBucketMaxAge', function () {
        it('test putBucketMaxAge', function () {
            const options = {
                maxAge: 0
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketMaxAge(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test putBucketAccessMode', function () {
        it('test putBucketAccessMode', function () {
            const options = {
                private: 0
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketAccessMode(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test bucketQuota', function () {
        it('test putBucketQuota', function () {
            const options = {
                size: 5 * Math.pow(1024, 3), // 5GB
                count: 1000
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketQuota(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
        it('test cancel putBucketQuota', function () {
            const options = {
                size: -1,
                count: -1
            };

            const promises = doAndWrapResultPromises(callback =>
                bucketManager.putBucketQuota(bucketName, options, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
        it('test getBucketQuota', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.getBucketQuota(bucketName, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test listBucketDomains', function () {
        it('test listBucketDomains', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.listBucketDomains(bucketName, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
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

        it('test invalid X-Qiniu-Date expect 403', function () {
            const key = 'qiniu.mp4';
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.stat(bucketName, key, callback)
            );
            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 403, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test invalid X-Qiniu-Date expect 200 by disable date sign', function () {
            const mac = new qiniu.auth.digest.Mac(
                accessKey,
                secretKey,
                { disableQiniuTimestampSignature: true }
            );
            const config = new qiniu.conf.Config({
                useHttpsDomain: true
            });
            const bucketManager = new qiniu.rs.BucketManager(mac, config);

            const key = 'qiniu.mp4';
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.stat(bucketName, key, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'putTime',
                    'type'
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test invalid X-Qiniu-Date env expect 200', function () {
            process.env.DISABLE_QINIU_TIMESTAMP_SIGNATURE = 'true';

            const key = 'qiniu.mp4';
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.stat(bucketName, key, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.status, 200, JSON.stringify(resp));
                data.should.have.keys(
                    'hash',
                    'fsize',
                    'mimeType',
                    'putTime',
                    'type'
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test invalid X-Qiniu-Date env be ignored expect 403', function () {
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

            const key = 'qiniu.mp4';
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.stat(bucketName, key, callback)
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.status, 403, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test bucket image source', function () {
        it('test set image', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.image(
                    bucketName,
                    'http://devtools.qiniu.com/',
                    'devtools.qiniu.com',
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });

        it('test unset image', function () {
            const promises = doAndWrapResultPromises(callback =>
                bucketManager.unimage(
                    bucketName,
                    callback
                )
            );

            const checkFunc = ({ resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc);
        });
    });

    describe('test PutPolicy', function () {
        it('test build-in options (backward compatibility)', function () {
            const buildInProps = {
                scope: 'mocked-bucket:some/key',
                isPrefixalScope: 1,
                insertOnly: 1,
                saveKey: 'some/key/specified.mp4',
                forceSaveKey: true,
                endUser: 'some-user-id',
                returnUrl: 'https://mocked.qiniu.com/put-policy/return-url',
                returnBody: '{"msg": "mocked"}',
                callbackUrl: 'https://mocked.qiniu.com/put-policy/callback-url',
                callbackHost: 'mocked.qiniu.com',
                callbackBody: '{"msg": "mocked"}',
                callbackBodyType: 'application/json',
                callbackFetchKey: 1,
                persistentOps: 'avthumb/flv|saveas/bW9ja2VkLWJ1Y2tldDpzb21lL2tleS9zcGVjaWZpZWQuZmx2Cg==',
                persistentNotifyUrl: 'https://mocked.qiniu.com/put-policy/persistent-notify-url',
                persistentPipeline: 'mocked-pipe',
                fsizeLimit: 104857600,
                fsizeMin: 10485760,
                detectMime: 1,
                mimeLimit: 'video/*',
                deleteAfterDays: 365,
                fileType: 1
            };
            const policy = new qiniu.rs.PutPolicy(buildInProps);
            for (const k of Object.keys(buildInProps)) {
                should.equal(policy[k], buildInProps[k], `key ${k}, ${policy[k]} not eql ${buildInProps[k]}`);
            }
            const flags = policy.getFlags();
            for (const k of Object.keys(buildInProps)) {
                should.equal(flags[k], buildInProps[k], `key ${k}, ${policy[k]} not eql ${buildInProps[k]}`);
            }
        });

        it('test expires option default value', function () {
            const putPolicyOptions = {
                scope: 'mocked-bucket:some/key'
            };
            const policy = new qiniu.rs.PutPolicy(putPolicyOptions);

            // deviation should be less than 1sec
            const deviation = policy.getFlags().deadline - Math.floor(Date.now() / 1000) - 3600;
            Math.abs(deviation).should.lessThan(1);
        });

        it('test expires option', function () {
            const expires = 604800;
            const putPolicyOptions = {
                scope: 'mocked-bucket:some/key',
                expires: expires
            };
            const policy = new qiniu.rs.PutPolicy(putPolicyOptions);

            // deviation should be less than 1sec
            const deviation = policy.getFlags().deadline - Math.floor(Date.now() / 1000) - expires;
            Math.abs(deviation).should.lessThan(1);
        });

        it('test custom options', function () {
            const putPolicyOptions = {
                scope: 'mocked-bucket:some/key',
                mockedProp: 'mockedProp',
                transform: 'some',
                transform_fallback_mode: 'bar',
                transform_fallback_key: 'foo'
            };
            const policy = new qiniu.rs.PutPolicy(putPolicyOptions);
            const flags = policy.getFlags();

            for (const k of Object.keys(putPolicyOptions)) {
                should.equal(flags[k], putPolicyOptions[k], `key ${k}, ${policy[k]} not eql ${putPolicyOptions[k]}`);
            }
        });
    });
});
