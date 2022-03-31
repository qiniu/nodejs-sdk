const os = require('os');
const fs = require('fs');
const path = require('path');
const should = require('should');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');
const crypto = require('crypto');
const http = require('http');
const Readable = require('stream').Readable;

var testFilePath = path.join(os.tmpdir(), 'nodejs-sdk-test.bin');

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    fs.createReadStream('/dev/urandom', { end: (1 << 20) * 10 })
        .pipe(fs.createWriteStream(testFilePath))
        .on('finish', done);
});

// file to upload

// eslint-disable-next-line no-undef
describe('test resume up', function () {
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
    putPolicy.returnBody = '{"key":$(key),"hash":$(etag),"fname":$(fname),"var_1":$(x:var_1),"var_2":$(x:var_2)}';
    var uploadToken = putPolicy.uploadToken(mac);
    var resumeUploader = new qiniu.resume_up.ResumeUploader(config);

    // eslint-disable-next-line no-undef
    describe('test resume up#putFileWithoutKey', function () {
        it('test resume up#putFileWithoutKey', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            putExtra.params = { 'x:var_1': 'val_1', 'x:var_2': 'val_2' };
            putExtra.metadata = {
                'x-qn-meta-name': 'qiniu',
                'x-qn-meta-age': '18'
            };
            resumeUploader.putFileWithoutKey(uploadToken, testFilePath,
                putExtra,
                function (
                    respErr,
                    respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    should(respBody['var_1']).eql('val_1');
                    should(respBody['var_2']).eql('val_2');
                    keysToDelete.push(respBody.key);

                    bucketManager.stat(bucket, respBody.key, function (
                        err,
                        statRespBody,
                        respInfo) {
                        should.not.exist(err);
                        statRespBody.should.have.keys('x-qn-meta');
                        statRespBody['x-qn-meta'].name.should.eql('qiniu');
                        statRespBody['x-qn-meta'].age.should.eql('18');
                        done();
                    });
                });
        });

        it('test resume up#putFileWithoutKey_v2', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            putExtra.partSize = 6 * 1024 * 1024
            putExtra.version = 'v2'
            putExtra.params = { 'x:var_1': 'val_1', 'x:var_2': 'val_2' };
            putExtra.metadata = {
                'x-qn-meta-name': 'qiniu',
                'x-qn-meta-age': '18'
            };
            resumeUploader.putFileWithoutKey(uploadToken, testFilePath,
                putExtra,
                function (
                    respErr,
                    respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    should(respBody['var_1']).eql('val_1');
                    should(respBody['var_2']).eql('val_2');
                    if (keysToDelete.indexOf(respBody.key) === -1) {
                        keysToDelete.push(respBody.key);
                    }
                    bucketManager.stat(bucket, respBody.key, function (
                        err,
                        statRespBody,
                        respInfo) {
                        should.not.exist(err);
                        statRespBody.should.have.keys('x-qn-meta');
                        statRespBody['x-qn-meta'].name.should.eql('qiniu');
                        statRespBody['x-qn-meta'].age.should.eql('18');
                        done();
                    });
                });
        });

    });

    // eslint-disable-next-line no-undef
    describe('test resume up#putFile', function () {
        it('test resume up#putFile', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            putExtra.mimeType = 'application/json';
            var key = 'storage_putFile_test' + Math.random(1000);
            var domain = proc.env.QINIU_TEST_DOMAIN;
            resumeUploader.putFile(uploadToken, key, testFilePath, putExtra,
                function (
                    respErr,
                    respBody, respInfo) {

                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);

                    var expectedMd5 = undefined, actualMd5 = undefined;
                    {
                        var md5 = crypto.createHash('md5');
                        var stream = fs.ReadStream(testFilePath);
                        stream.on('data', function (data) {
                            md5.update(data);
                        });
                        stream.on('end', function () {
                            expectedMd5 = md5.digest('hex');
                        });
                    }

                    http.get("http://" + domain + "/" + key, function (response) {
                        response.statusCode.should.eql(200);
                        response.headers['content-type'].should.eql('application/json');
                        {
                            var md5 = crypto.createHash('md5');
                            response.on('data', function (data) {
                                md5.update(data);
                            });
                            response.on('end', function () {
                                actualMd5 = md5.digest('hex');
                                should(actualMd5).eql(expectedMd5);
                                done();
                            });
                        }
                    });
                });
        });

        it('test resume up#putFile_v2', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            var key = 'storage_putFile_test_v2' + Math.random(1000);
            var domain = proc.env.QINIU_TEST_DOMAIN;
            putExtra.partSize = 6 * 1024 * 1024
            putExtra.version = 'v2'
            putExtra.mimeType = 'application/x-www-form-urlencoded';
            resumeUploader.putFile(uploadToken, key, testFilePath, putExtra,
                function (
                    respErr,
                    respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);

                    var expectedMd5 = undefined, actualMd5 = undefined;
                    {
                        var md5 = crypto.createHash('md5');
                        var stream = fs.ReadStream(testFilePath);
                        stream.on('data', function (data) {
                            md5.update(data);
                        });
                        stream.on('end', function () {
                            expectedMd5 = md5.digest('hex');
                        });
                    }

                    http.get("http://" + domain + "/" + key, function (response) {
                        response.statusCode.should.eql(200);
                        response.headers['content-type'].should.eql('application/x-www-form-urlencoded');
                        {
                            var md5 = crypto.createHash('md5');
                            response.on('data', function (data) {
                                md5.update(data);
                            });
                            response.on('end', function () {
                                actualMd5 = md5.digest('hex');
                                should(actualMd5).eql(expectedMd5);
                                done();
                            });
                        }
                    });
                });
        });
    });

    describe('test resume up#putStream', function () {
        it('test resume up#putStream', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            putExtra.mimeType = 'application/x-www-form-urlencoded';
            var key = 'storage_putStream_test' + Math.random(1000);
            var stream = new Readable();
            var domain = proc.env.QINIU_TEST_DOMAIN;
            var blkSize = 1024 * 1024;
            var blkCnt = 9;
            var expectedMd5Crypto = crypto.createHash('md5');
            for (var i = 0; i < blkCnt; i++) {
                var bytes = crypto.randomBytes(blkSize);
                stream.push(bytes);
                expectedMd5Crypto.update(bytes);
            }
            stream.push(null);
            var expectedMd5 = expectedMd5Crypto.digest('hex');
            resumeUploader.putStream(uploadToken, key, stream, blkCnt * blkSize, putExtra,
                function (respErr, respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);

                    http.get("http://" + domain + "/" + key, function (response) {
                        response.statusCode.should.eql(200);
                        response.headers['content-type'].should.eql('application/x-www-form-urlencoded');
                        {
                            var actualMd5Crypto = crypto.createHash('md5');
                            response.on('data', function (data) {
                                actualMd5Crypto.update(data);
                            });
                            response.on('end', function () {
                                var actualMd5 = actualMd5Crypto.digest('hex');
                                should(actualMd5).eql(expectedMd5);
                                done();
                            });
                        }
                    });
                });
        });

        it('test resume up#putStream_v2', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            putExtra.mimeType = 'application/xml';
            var key = 'storage_putStream_test_v2' + Math.random(1000);
            var stream = new Readable();
            var domain = proc.env.QINIU_TEST_DOMAIN;
            var blkSize = 1024 * 1024;
            var blkCnt = 9;
            var expectedMd5Crypto = crypto.createHash('md5');
            for (var i = 0; i < blkCnt; i++) {
                var bytes = crypto.randomBytes(blkSize);
                stream.push(bytes);
                expectedMd5Crypto.update(bytes);
            }
            stream.push(null);
            var expectedMd5 = expectedMd5Crypto.digest('hex');
            putExtra.partSize = 6 * 1024 * 1024
            putExtra.version = 'v2'
            resumeUploader.putStream(uploadToken, key, stream, blkCnt * blkSize, putExtra,
                function (
                    respErr,
                    respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);

                    http.get("http://" + domain + "/" + key, function (response) {
                        response.statusCode.should.eql(200);
                        response.headers['content-type'].should.eql('application/xml');
                        {
                            var actualMd5Crypto = crypto.createHash('md5');
                            response.on('data', function (data) {
                                actualMd5Crypto.update(data);
                            });
                            response.on('end', function () {
                                var actualMd5 = actualMd5Crypto.digest('hex');
                                should(actualMd5).eql(expectedMd5);
                                done();
                            });
                        }
                    });
                });
        });
    });

    describe('test resume up#putStream resume', function () {
        it('test resume up#putStream resume', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            config.zone = null;
            var key = 'storage_putStream_resume_test' + Math.random(1000);
            var stream = new Readable();
            var blkSize = 1024 * 1024;
            var blkCnt = 4;
            for (var i = 0; i < blkCnt; i++) {
                stream.push(crypto.randomBytes(blkSize));
            }
            stream.push(null);
            var tmpfile = path.join(os.tmpdir(), '/resume_file');
            fs.writeFileSync(tmpfile, '');
            putExtra.resumeRecordFile = tmpfile;
            putExtra.progressCallback = function (len, total) {
                if (len === total) {
                    var content = fs.readFileSync(tmpfile);
                    var data = JSON.parse(content);
                    data.forEach(function (item) {
                        item.should.have.keys('ctx', 'expired_at', 'crc32');
                    });
                }
            };
            resumeUploader.putStream(uploadToken, key, stream, blkCnt * blkSize, putExtra,
                function (
                    respErr,
                    respBody, respInfo) {
                    console.log(respBody, respInfo);
                    should.not.exist(respErr);
                    respBody.should.have.keys('key', 'hash');
                    keysToDelete.push(respBody.key);
                    done();
                });
        });

        it('test resume up#putStream resume_v2', function (done) {
            var putExtra = new qiniu.resume_up.PutExtra();
            config.zone = null;
            var num = 0;
            var blkSize = 1024 * 1024;
            var blkCnt = [2, 4, 4.1, 6, 10];
            var tmpfile = path.join(os.tmpdir(), '/resume_file');
            fs.writeFileSync(tmpfile, '');
            putExtra.resumeRecordFile = tmpfile;
            putExtra.partSize = 4 * 1024 * 1024;
            putExtra.version = 'v2';
            putExtra.progressCallback = function (len, total) {
                if (len === total) {
                    var content = fs.readFileSync(tmpfile);
                    var data = JSON.parse(content);
                    data.etags.forEach(function (item) {
                        item.should.have.keys('etag', 'partNumber');
                    });
                }
            };
            blkCnt.forEach(function (i) {
                var stream = new Readable();
                for (var j = 0; j < i; j++) {
                    stream.push(crypto.randomBytes(blkSize));
                }
                if (i === +i && i !== (i | 0)) {
                    stream.push('0f');
                }
                stream.push(null);
                var key = 'storage_putStream_resume_test_v2' + Math.random(1000);
                resumeUploader.putStream(uploadToken, key, stream, i * blkSize, putExtra,
                    function (
                        respErr,
                        respBody, respInfo) {
                        console.log(respBody, respInfo);
                        should.not.exist(respErr);
                        respBody.should.have.keys('key', 'hash');
                        keysToDelete.push(respBody.key);
                        num++;
                        if (num === blkCnt.length) {
                            done();
                        }
                    });
            });
        });
    })
});
