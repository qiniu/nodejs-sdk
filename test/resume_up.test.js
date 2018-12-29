const path = require('path');
const should = require('should');
// const assert = require('assert');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');
// const fs = require('fs');

// eslint-disable-next-line no-undef
before(function(done) {
    if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !
    process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
        console.log('should run command `source test-env.sh` first\n');
        process.exit(0);
    }
    done();
});


//file to upload
var imageFile = path.join(__dirname, 'logo.png');

// eslint-disable-next-line no-undef
describe('test resume up', function() {
    var accessKey = proc.env.QINIU_ACCESS_KEY;
    var secretKey = proc.env.QINIU_SECRET_KEY;
    var bucket = proc.env.QINIU_TEST_BUCKET;
    var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    var config = new qiniu.conf.Config();
    //config.useHttpsDomain = true;
    config.zone = qiniu.zone.Zone_z0;
    var bucketManager = new qiniu.rs.BucketManager(mac, config);

    //delete all the files uploaded
    var keysToDelete = [];

    // eslint-disable-next-line no-undef
    after(function(done) {
        var deleteOps = [];
        keysToDelete.forEach(function(key) {
            deleteOps.push(qiniu.rs.deleteOp(bucket, key));
        });

        bucketManager.batch(deleteOps, function(respErr, respBody, respInfo) {
            console.log(respBody, respInfo);
            respBody.forEach(function(ret) {
                ret.should.eql({
                    code: 200
                });
            });
            done();
        });
    });

    var options = {
        scope: bucket,
    };
    var putPolicy = new qiniu.rs.PutPolicy(options);
    var uploadToken = putPolicy.uploadToken(mac);
    config.zone = qiniu.zone.Zone_z0;
    var resumeUploader = new qiniu.resume_up.ResumeUploader(config);
    var putExtra = new qiniu.resume_up.PutExtra();

    // eslint-disable-next-line no-undef
    describe('test resume up#putFileWithoutKey', function() {
        // eslint-disable-next-line no-undef
        it('test resume up#putFileWithoutKey', function(done) {
            resumeUploader.putFileWithoutKey(uploadToken, imageFile,
                putExtra,
                function(
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
    describe('test resume up#putFile', function() {
        // eslint-disable-next-line no-undef
        it('test resume up#putFile', function(done) {
            var key = 'storage_putFile_test' + Math.random(1000);
            resumeUploader.putFile(uploadToken, key, imageFile, putExtra,
                function(
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
