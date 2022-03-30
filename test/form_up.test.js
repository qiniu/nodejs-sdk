const os = require('os');
const path = require('path');
const should = require('should');
// const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const fs = require('fs');
const console = require('console');

// file to upload
var testFilePath_1 = path.join(os.tmpdir(), 'nodejs-sdk-test-1.bin');
var testFilePath_2 = path.join(os.tmpdir(), 'nodejs-sdk-test-2.bin');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    var callbacked = 0;
    var callback = function () {
        callbacked += 1;
        if (callbacked >= 2) {
            done();
        }
    };
    fs.createReadStream('/dev/urandom', { end: (1 << 20) * 10 })
        .pipe(fs.createWriteStream(testFilePath_1))
        .on('finish', callback);
    fs.createReadStream('/dev/urandom', { end: (1 << 20) * 5 })
        .pipe(fs.createWriteStream(testFilePath_2))
        .on('finish', callback);
});

// eslint-disable-next-line no-undef
describe('test form up', function () {
    this.timeout(0);

    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var bucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    config.useCdnDomain = true;
    config.useHttpsDomain = true;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);

    // delete all the files uploaded
    var keysToDelete = [];

    // eslint-disable-next-line no-undef
    after(function (done) {
        const deleteOps = [];
        keysToDelete.forEach(function (key) {
            deleteOps.push(qiniu.rs.deleteOp(bucket, key));
        });

        bucketManager.batch(deleteOps, function (respErr, respBody) {
            respBody.forEach(function (ret, i) {
                ret.code.should.be.eql(
                    200,
                    JSON.stringify({
                        key: keysToDelete[i],
                        ret: ret
                    })
                );
            });
            done();
        });
    });

    var options = {
        scope: bucket
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    var uploadToken = putPolicy.uploadToken(mac);
    var formUploader = new qiniu.form_up.FormUploader(config);
    var putExtra = new qiniu.form_up.PutExtra();

    // eslint-disable-next-line no-undef
    describe('test form up#putStreamWithoutKey', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putStreamWithoutKey', function (done) {
            var key = null;
            var rs = fs.createReadStream(testFilePath_1);
            formUploader.putStream(uploadToken, key, rs, putExtra,
                function (respErr, respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#putStream', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putStream', function (done) {
            var key = 'storage_putStream_test' + Math.random(1000);
            var rs = fs.createReadStream(testFilePath_1);
            formUploader.putStream(uploadToken, key, rs, putExtra,
                function (respErr, respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#put', function () {
        // eslint-disable-next-line no-undef
        it('test form up#put', function (done) {
            var key = 'storage_put_test' + Math.random(1000);
            formUploader.put(uploadToken, key, 'hello world', putExtra,
                function (respErr,
                    respBody) {
                    // console.log(respBody);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#putWithoutKey', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putWithoutKey', function (done) {
            formUploader.putWithoutKey(uploadToken, 'hello world',
                putExtra,
                function (respErr,
                    respBody) {
                    // console.log(respBody);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#putFile', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putFile', function (done) {
            var key = 'storage_putFile_test' + Math.random(1000);
            formUploader.putFile(uploadToken, key, testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody) {
                    // console.log(respBody);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#putFileWithoutKey', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putFileWithoutKey', function (done) {
            formUploader.putFileWithoutKey(uploadToken, testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody) {
                    // console.log(respBody);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });
    });

    describe('test form up#putFileWithFileType', function () {
        it('test form up#putFileWithFileType IA', function (done) {
            const key = 'storage_put_test_with_file_type' + Math.random();
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(options, {
                fileType: 1
            }));
            const uploadToken = putPolicy.uploadToken(mac);
            formUploader.putFile(
                uploadToken,
                key,
                testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody
                ) {
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                }
            );
        });

        it('test form up#putFileWithFileType Archive', function (done) {
            const key = 'storage_put_test_with_file_type' + Math.random();
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(options, {
                fileType: 2
            }));
            const uploadToken = putPolicy.uploadToken(mac);
            formUploader.putFile(
                uploadToken,
                key,
                testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody
                ) {
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                }
            );
        });

        it('test form up#putFileWithFileType DeepArchive', function (done) {
            const key = 'storage_put_test_with_file_type' + Math.random();
            const putPolicy = new qiniu.rs.PutPolicy(Object.assign(options, {
                fileType: 3
            }));
            const uploadToken = putPolicy.uploadToken(mac);
            formUploader.putFile(
                uploadToken,
                key,
                testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody
                ) {
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                }
            );
        });
    });

    // eslint-disable-next-line no-undef
    describe('test form up#putFileWithParams', function () {
        // eslint-disable-next-line no-undef
        it('test form up#putFileWithMetadata', function (done) {
            const key = 'storage_put_test_with_metadata';
            var putExtra = new qiniu.form_up.PutExtra();
            putExtra.metadata = {
                'x-qn-meta-name': 'qiniu',
                'x-qn-meta-age': '18'
            };
            formUploader.putFile(uploadToken, key, testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody) {
                    should.not.exist(respErr);
                    keysToDelete.push(respBody.key);
                    respBody.should.have.keys('key', 'hash');
                    bucketManager.stat(bucket, key, function (
                        err,
                        respBody,
                        respInfo) {
                        should.not.exist(err);
                        respBody.should.have.keys('x-qn-meta');
                        respBody['x-qn-meta'].name.should.eql('qiniu');
                        respBody['x-qn-meta'].age.should.eql('18');
                        done();
                    });
                });
        });

        // eslint-disable-next-line no-undef
        it('test form up#putFileWithCustomerData', function (done) {
            const key = 'storage_put_test_with_customer_data';
            var putExtra = new qiniu.form_up.PutExtra();
            putExtra.params = {
                'x:location': 'shanghai',
                'x:price': 1500
            };
            formUploader.putFile(uploadToken, key, testFilePath_2,
                putExtra,
                function (
                    respErr,
                    respBody) {
                    should.not.exist(respErr);
                    keysToDelete.push(respBody.key);
                    respBody.should.have.keys('x:location', 'x:price');
                    done();
                });
        });
    });
});
