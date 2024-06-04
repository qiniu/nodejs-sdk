const should = require('should');

const os = require('os');
const path = require('path');
const fs = require('fs');

const qiniu = require('../index.js');

const {
    Endpoint,
    Region,
    SERVICE_NAME,
    StaticRegionsProvider
} = qiniu.httpc;

const {
    getEnvConfig,
    checkEnvConfigAndExit,
    createRandomFile,
    doAndWrapResultPromises
} = require('./conftest');

// file to upload
const testFilePath1 = path.join(os.tmpdir(), 'nodejs-sdk-test-1.bin');
const testFilePath2 = path.join(os.tmpdir(), 'nodejs-sdk-test-2.bin');

before(function () {
    checkEnvConfigAndExit();

    return Promise.all([
        createRandomFile(testFilePath1, (1 << 20) * 10),
        createRandomFile(testFilePath2, (1 << 20) * 5)
    ]);
});

after(function () {
    return Promise.all(
        [
            testFilePath1,
            testFilePath2
        ].map(p => new Promise(resolve => {
            fs.unlink(p, err => {
                if (err && err.code !== 'ENOENT') {
                    console.log(`unlink ${p} failed`, err);
                }
                resolve();
            });
        }))
    );
});

describe('test form up', function () {
    this.timeout(0);

    const {
        accessKey,
        secretKey,
        bucketName
    } = getEnvConfig();

    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const config = new qiniu.conf.Config();
    config.useCdnDomain = true;
    config.useHttpsDomain = true;
    const bucketManager = new qiniu.rs.BucketManager(mac, config);

    // delete all the files uploaded
    const keysToDelete = [];
    after(function () {
        const deleteOps = keysToDelete.map(k =>
            qiniu.rs.deleteOp(bucketName, k)
        );

        return bucketManager.batch(deleteOps)
            .then(({ data, resp }) => {
                if (!Array.isArray(data)) {
                    console.log(resp);
                    return;
                }
                data.forEach(function (ret) {
                    ret.code.should.be.oneOf(200, 612);
                });
            });
    });

    const options = {
        scope: bucketName
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(mac);
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();

    describe('test form up#putStreamWithoutKey', function () {
        it('test form up#putStreamWithoutKey', function () {
            const key = null;
            const rs = fs.createReadStream(testFilePath1);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putStream(
                    uploadToken,
                    key,
                    rs,
                    putExtra,
                    callback
                )
            );

            let actualKey = '';
            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys('key', 'hash');
                actualKey = data.key;
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    if (actualKey) {
                        keysToDelete.push(actualKey);
                    }
                });
        });
    });

    describe('test form up#putStream', function () {
        it('test form up#putStream', function () {
            const key = 'storage_putStream_test' + Math.floor(Math.random() * 100000);
            const rs = fs.createReadStream(testFilePath1);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putStream(uploadToken, key, rs, putExtra, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#put', function () {
        it('test form up#put', function () {
            const key = 'storage_put_test' + Math.floor(Math.random() * 100000);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.put(uploadToken, key, 'hello world', putExtra, callback)
            );

            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#putWithoutKey', function () {
        it('test form up#putWithoutKey', function () {
            const promises = doAndWrapResultPromises(callback =>
                formUploader.putWithoutKey(uploadToken, 'hello world', putExtra, callback)
            );

            let actualKey = '';
            const checkFunc = ({ data, resp }) => {
                should.equal(resp.statusCode, 200, JSON.stringify(resp));
                data.should.have.keys('key', 'hash');
                actualKey = data.key;
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    if (actualKey) {
                        keysToDelete.push(actualKey);
                    }
                });
        });
    });

    describe('test form up#putFile', function () {
        it('test form up#putFile', function () {
            const key = 'storage_putFile_test' + Math.floor(Math.random() * 100000);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(uploadToken, key, testFilePath2, putExtra, callback)
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#putFile with double quotes', function () {
        it('test form up#putFile with double quotes', function () {
            const key = 'storage_putFile_"test"' + Math.floor(100000 * Math.random());
            const putExtra = new qiniu.form_up.PutExtra();
            putExtra.fname = key;

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(uploadToken, key, testFilePath2, putExtra, callback)
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#putFileWithoutKey', function () {
        it('test form up#putFileWithoutKey', function () {
            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFileWithoutKey(uploadToken, testFilePath2, putExtra, callback)
            );

            let actualKey = '';
            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
                actualKey = data.key;
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    if (actualKey) {
                        keysToDelete.push(actualKey);
                    }
                });
        });
    });

    describe('test form up#putFileWithFileType', function () {
        it('test form up#putFileWithFileType IA', function () {
            const key = 'storage_put_test_with_file_type' + Math.floor(100000 * Math.random());
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(
                {},
                options,
                {
                    fileType: 1
                })
            );
            const uploadToken = putPolicy.uploadToken(mac);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(
                    uploadToken,
                    key,
                    testFilePath2,
                    putExtra,
                    callback
                )
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });

        it('test form up#putFileWithFileType Archive', function () {
            const key = 'storage_put_test_with_file_type' + Math.floor(Math.random() * 100000);
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(
                {},
                options,
                {
                    fileType: 2
                }
            ));
            const uploadToken = putPolicy.uploadToken(mac);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(
                    uploadToken,
                    key,
                    testFilePath2,
                    putExtra,
                    callback
                )
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });

        it('test form up#putFileWithFileType DeepArchive', function () {
            const key = 'storage_put_test_with_file_type' + Math.floor(Math.random() * 100000);
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(
                {},
                options,
                {
                    fileType: 3
                })
            );
            const uploadToken = putPolicy.uploadToken(mac);

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(
                    uploadToken,
                    key,
                    testFilePath2,
                    putExtra,
                    callback
                )
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#putFileWithParams', function () {
        it('test form up#putFileWithMetadata', function () {
            const key = 'storage_put_test_with_metadata' + Math.floor(Math.random() * 100000);
            const putExtra = new qiniu.form_up.PutExtra();
            putExtra.metadata = {
                'x-qn-meta-name': 'qiniu',
                'x-qn-meta-age': '18'
            };

            const promsises = doAndWrapResultPromises(callback =>
                formUploader.putFile(
                    uploadToken,
                    key,
                    testFilePath2,
                    putExtra,
                    callback
                )
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
                return bucketManager.stat(bucketName, key)
                    .then(({ data }) => {
                        data.should.have.keys('x-qn-meta');
                        data['x-qn-meta'].name.should.eql('qiniu');
                        data['x-qn-meta'].age.should.eql('18');
                    });
            };

            return promsises.callback
                .then(checkFunc)
                .then(() => promsises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });

        it('test form up#putFileWithCustomerData', function () {
            const key = 'storage_put_test_with_customer_data' + Math.floor(Math.random() * 100000);
            const putExtra = new qiniu.form_up.PutExtra();
            putExtra.params = {
                'x:location': 'shanghai',
                'x:price': 1500
            };

            const promises = doAndWrapResultPromises(callback =>
                formUploader.putFile(
                    uploadToken,
                    key,
                    testFilePath2,
                    putExtra,
                    callback
                )
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys(
                    'key',
                    'hash',
                    'x:location',
                    'x:price'
                );
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });

    describe('test form up#accelerateUploading', function () {
        const accConfig = new qiniu.conf.Config();
        // accConfig.useHttpsDomain = true;
        accConfig.accelerateUploading = true;
        const accFormUploader = new qiniu.form_up.FormUploader(accConfig);
        const bucketNameWithoutAcc = 'bucket-without-acc-' + Math.floor(Math.random() * 100000);

        before(function () {
            return bucketManager.createBucket(bucketNameWithoutAcc);
        });

        it('upload acc normally', function () {
            const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

            const promises = doAndWrapResultPromises(callback =>
                accFormUploader.putFile(uploadToken, key, testFilePath2, putExtra, callback)
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });

        it('upload acc unavailable fallback to src', function () {
            const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

            const putPolicy = new qiniu.rs.PutPolicy({
                scope: bucketNameWithoutAcc
            });
            const uploadToken = putPolicy.uploadToken(mac);
            const r1 = Region.fromRegionId('z0');
            r1.services[SERVICE_NAME.UP_ACC] = [
                new Endpoint(`${bucketNameWithoutAcc}.kodo-accelerate.cn-east-1.qiniucs.com`),
                new Endpoint('qn-up-acc.fake.qiniu.com')
            ];
            accConfig.regionsProvider = r1;

            const promises = doAndWrapResultPromises(callback =>
                accFormUploader.putFile(uploadToken, key, testFilePath2, putExtra, callback)
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.callback
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });

        it('upload acc network error fallback to src', function () {
            const key = 'storage_putFile_acc_test' + Math.floor(Math.random() * 100000);

            const putPolicy = new qiniu.rs.PutPolicy({
                scope: bucketNameWithoutAcc
            });
            const uploadToken = putPolicy.uploadToken(mac);
            const r1 = Region.fromRegionId('z0');
            r1.services[SERVICE_NAME.UP_ACC] = [
                new Endpoint('qiniu-acc.fake.qiniu.com'),
                new Endpoint('qn-up-acc.fake.qiniu.com')
            ];
            accConfig.regionsProvider = r1;

            const promises = doAndWrapResultPromises(callback =>
                accFormUploader.putFile(uploadToken, key, testFilePath2, putExtra)
            );

            const checkFunc = ({ data }) => {
                data.should.have.keys('key', 'hash');
            };

            return promises.native
                .then(checkFunc)
                .then(() => promises.native)
                .then(checkFunc)
                .then(() => {
                    keysToDelete.push(key);
                });
        });
    });
});
