const path = require('path');
const should = require('should');
const assert = require('assert');
const qiniu = require("../index.js");
const proc = require("process");
const fs = require("fs");

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

describe('test form io', function() {
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

  after(function(done) {
    var deleteOps = [];
    keysToDelete.forEach(function(key) {
      deleteOps.push(qiniu.rs.deleteOp(bucket, key));
    });

    bucketManager.batch(deleteOps, function(respErr, respBody, respInfo) {
      //console.log(respBody);
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
  }
  var putPolicy = new qiniu.rs.PutPolicy(options);
  var uploadToken = putPolicy.uploadToken(mac);
  var config = new qiniu.conf.Config();
  config.zone = qiniu.zone.Zone_z0;
  var formUploader = new qiniu.form_io.FormUploader(config);
  var putExtra = new qiniu.form_io.PutExtra();

  describe('test form io#putStreamWithoutKey', function() {
    it('test form io#putStreamWithoutKey', function(done) {
      var key = null;
      var rs = fs.createReadStream(imageFile);
      formUploader.putStream(uploadToken, key, rs, putExtra,
        function(respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });

  describe('test form io#putStream', function() {
    it('test form io#putStream', function(done) {
      var key = 'io_putStream_test' + Math.random(1000);
      var rs = fs.createReadStream(imageFile);
      formUploader.putStream(uploadToken, key, rs, putExtra,
        function(respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });

  describe('test form io#put', function() {
    it('test form io#put', function(done) {
      var key = 'io_put_test' + Math.random(1000);
      formUploader.put(uploadToken, key, "hello world", putExtra,
        function(respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });

  describe('test form io#putWithoutKey', function() {
    it('test form io#putWithoutKey', function(done) {
      var key = null;
      formUploader.put(uploadToken, key, "hello world", putExtra,
        function(respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });

  describe('test form io#putFile', function() {
    it('test form io#putFile', function(done) {
      var key = 'io_putFile_test' + Math.random(1000);
      formUploader.put(uploadToken, key, imageFile, putExtra,
        function(
          respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });

  describe('test form io#putFileWithoutKey', function() {
    it('test form io#putFileWithoutKey', function(done) {
      var key = null;
      formUploader.put(uploadToken, key, imageFile, putExtra,
        function(
          respErr,
          respBody, respInfo) {
          //console.log(respBody);
          should.not.exist(respErr);
          respBody.should.have.keys('key', 'hash');
          keysToDelete.push(respBody.key);
          done();
        });
    });
  });
});
