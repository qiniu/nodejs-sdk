const os = require('os');
const fs = require('fs');
const path = require('path');
const should = require('should');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');
const crypto = require('crypto');
const Readable = require('stream').Readable;

// eslint-disable-next-line no-undef
before(function (done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});

// file to upload
var imageFile = path.join(__dirname, 'logo.png');

// eslint-disable-next-line no-undef
describe('test resume up', function () {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var bucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    // config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_z0;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);

    // delete all the files uploaded
    var keysToDelete = [];

    // eslint-disable-next-line no-undef
    after(function (done) {
        var deleteOps = [];
        keysToDelete.forEach(function (key) {
            deleteOps.push(qiniu.rs.deleteOp(bucket, key));
        });

        bucketManager.batch(deleteOps, function (respErr, respBody, respInfo) {
            console.log(respBody, respInfo);
            respBody.forEach(function (ret) {
                ret.should.eql({
                    code: 200
                });
            });
            done();
        });
    });

    var options = {
        scope: bucket
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    var uploadToken = putPolicy.uploadToken(mac);
    config.zone = qiniu.zone.Zone_z0;
    var resumeUploader = new qiniu.resume_up.ResumeUploader(config);
    var putExtra = new qiniu.resume_up.PutExtra();

    // eslint-disable-next-line no-undef
    describe('test resume up#putFileWithoutKey', function () {
        // eslint-disable-next-line no-undef
        it('test resume up#putFileWithoutKey', function (done) {
            resumeUploader.putFileWithoutKey(uploadToken, imageFile,
                putExtra,
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

        it('test resume up#putFileWithoutKey_v2', function (done) {
            putExtra.partSize = 6 * 1024 * 1024
            putExtra.version = 'v2'
            resumeUploader.putFileWithoutKey(uploadToken, imageFile,
                putExtra,
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

    });

    // eslint-disable-next-line no-undef
    describe('test resume up#putFile', function () {
        // eslint-disable-next-line no-undef
        it('test resume up#putFile', function (done) {
            var key = 'storage_putFile_test' + Math.random(1000);
            resumeUploader.putFile(uploadToken, key, imageFile, putExtra,
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

        it('test resume up#putFile_v2', function (done) {
            var key = 'storage_putFile_test_v2' + Math.random(1000);
            putExtra.partSize = 6 * 1024 * 1024
            putExtra.version = 'v2'
            resumeUploader.putFile(uploadToken, key, imageFile, putExtra,
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
    });

    describe('test resume up#putStream', function () {
        // eslint-disable-next-line no-undef
        it('test resume up#putStream', function (done) {
            var key = 'storage_putStream_test' + Math.random(1000);
            var stream = new Readable();
            var blkSize = 1024 * 1024;
            var blkCnt = 9;
            for (var i = 0; i < blkCnt; i++) {
                stream.push(crypto.randomBytes(blkSize));
            }
            stream.push(null);
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

        it('test resume up#putStream_v2', function (done) {
            var key = 'storage_putStream_test_v2' + Math.random(1000);
            var stream = new Readable();
            var blkSize = 1024 * 1024;
            var blkCnt = 9;
            for (var i = 0; i < blkCnt; i++) {
                stream.push(crypto.randomBytes(blkSize));
            }
            stream.push(null);
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
                    done();
                });
        });

        it('test resume up#putStream resume', function (done) {
            config.zone = null;
            var key = 'storage_putStream_resume_test' + Math.random(1000);
            var stream = new Readable();
            var blkSize = 1024 * 1024;
            var blkCnt = 5;
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
            config.zone = null;
            var blkSize = 1024 * 1024;
            var blkCnt = [2,4,6,10];
            var tmpfile = path.join(os.tmpdir(), '/resume_file');
            fs.writeFileSync(tmpfile, '');
            putExtra.resumeRecordFile = tmpfile;
            putExtra.partSize = 4 * 1024 * 1024
            putExtra.version = 'v2'
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
                        done();
                    });
            });
        });
    });
});
