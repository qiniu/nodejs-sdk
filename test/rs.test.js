const should = require('should');
const assert = require('assert');
const qiniu = require("../index.js");
const proc = require("process");

before(function(done) {
  if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY || !
    process.env.QINIU_TEST_BUCKET || !process.env.QINIU_TEST_DOMAIN) {
    console.log('should run command `source test-env.sh` first\n');
    process.exit(0);
  }
  done();
});

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
  describe('test stat', function() {
    it('test stat', function(done) {
      var bucket = srcBucket;
      var key = 'qiniu.mp4';
      bucketManager.stat(bucket, key, function(err, respBody,
        respInfo) {
        //console.log(respBody);
        should.not.exist(err);
        respBody.should.have.keys('hash', 'fsize', 'mimeType',
          'putTime', 'type');
        done();
      });
    });
  });

  //test copy and move and delete
  describe('test copy', function() {
    it('test copy', function(done) {
      var destBucket = srcBucket;
      var srcKey = 'qiniu.mp4';
      var destKey = 'qiniu_copy.mp4';
      var options = {
        force: true,
      }
      bucketManager.copy(srcBucket, srcKey, destBucket, destKey,
        options,
        function(err, respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(err);
          assert.equal(respInfo.statusCode, 200);
          done();

          //test move
          describe('test move', function() {
            var moveDestKey = 'qiniu_move.mp4';
            it('test move', function(done1) {
              bucketManager.move(destBucket, destKey,
                destBucket, moveDestKey, options,
                function(err1, ret1, info1) {
                  should.not.exist(err1);
                  assert.equal(info1.statusCode, 200);
                  done1();

                  //test delete
                  describe('test delete', function() {
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

  describe('test fetch', function() {
    it('test fetch', function(done) {
      var resUrl = 'http://devtools.qiniu.com/qiniu.png';
      var bucket = srcBucket;
      var key = "qiniu.png";

      bucketManager.fetch(resUrl, bucket, key, function(err,
        respBody,
        respInfo) {
        should.not.exist(err);
        respBody.should.have.keys('hash', 'fsize', 'mimeType',
          'key');
        done();
      });
    });
  });

  describe('test changeMime', function() {
    it('test changeMime', function(done) {
      var key = "test_file";
      var bucket = srcBucket;

      bucketManager.changeMime(bucket, key, "text/html",
        function (err, respBody, respInfo) {
          should.not.exist(err);
          assert.equal(respInfo.statusCode, 200);
          done();
        }
      );
    });
  });

  describe('test changeHeaders', function() {
    it('test changeHeaders', function(done) {
      var key = "test_file";
      var bucket = srcBucket;

      bucketManager.changeHeaders(bucket, key, {
        'Content-Type': 'text/plain',
        'x-qn-meta-!Cache-Control': 'public, max-age=31566000',
      },
        function (err, respBody, respInfo) {
          should.not.exist(err);
          assert.equal(respInfo.statusCode, 200);
          done();
        }
      );
    });
  });
});
