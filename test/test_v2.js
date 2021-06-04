const os = require('os');
const fs = require('fs');
const path = require('path');
const should = require('should');
const qiniu = require('../index.js');
const proc = require('process');
const console = require('console');
const crypto = require('crypto');
const Readable = require('stream').Readable;

var accessKey = "qhtbC5YmDCO-WiPriuoCG_t4hZ1LboSOtRYSJXo_";
var secretKey = "3sSWVQQ_HvD6pVJSjfEsRQMl9ZRnNRf0-G5iomNV";
var bucket = "z0-bucket";
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var keysToDelete = []
var options = {
    scope: bucket
};
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken = putPolicy.uploadToken(mac);
var config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z0;
var resumeUploader = new qiniu.resume_up.ResumeUploader(config);
var putExtra = new qiniu.resume_up.PutExtra();


function test_resume_v2() {
    var key = 'storage_putStream_test' + Math.random(1000);
    var stream = new Readable();
    var blkSize = 1024 * 1024;
    var blkCnt = 9;
    for (var i = 0; i < blkCnt; i++) {
        stream.push(crypto.randomBytes(blkSize));
    }
    stream.push(null);
    // putExtra.resumeRecordFile = key
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
        });
}

function  test_resumeRecordFile() {
    config.zone = null;

    var key = 'storage_putStream_resume_test' + Math.random(1000);
    var stream = new Readable();
    var blkSize = 1024 * 1024;
    var blkCnt = 5;
    for (var i = 0; i < blkCnt; i++) {
        stream.push(crypto.randomBytes(blkSize));
    }
    stream.push(null);
    var tmpfile = path.join(os.tmpdir(), '/resume_file' + Math.random(1000));
    fs.writeFileSync(tmpfile, '');
    putExtra.resumeRecordFile = tmpfile;
    putExtra.partSize = 6 * 1024 * 1024
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
    resumeUploader.putStream(uploadToken, key, stream, blkCnt * blkSize, putExtra,
        function (
            respErr,
            respBody, respInfo) {
            console.log(respBody, respInfo);
            should.not.exist(respErr);
            respBody.should.have.keys('key', 'hash');
            keysToDelete.push(respBody.key);
        });
}


test_resume_v2()
test_resumeRecordFile()