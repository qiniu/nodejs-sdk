/*!
 * qiniu - test/rs.test.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var Stream = require('stream');
var http = require('http');
var fs = require('fs');
var should = require('should');
var qiniu = require('../');
var path = require('path');
var pedding = require('pedding');
var urlparse = require('url').parse;

qiniu.conf.ACCESS_KEY = QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = QINIU_SECRET_KEY;

var bucket = "qiniutest" + Math.round(new Date().getTime() / 1000),
    DEMO_DOMAIN = bucket + '.qiniudn.com',
    imagefile = path.join(__dirname, 'logo.png');

var conn = new qiniu.digestauth.Client(),
    rs = new qiniu.rs.Service(conn, bucket);

describe('rs.test.js', function () {
  var lastHash = null;

  before(function (done) {
    qiniu.rs.mkbucket(conn, bucket, function(res){
      res.should.have.property('code', 200);
      done();
    });
  });

  describe('putAuth()', function () {

    it('should return the auth upload url with default expires time 3600 seconds', function (done) {
      rs.putAuth(function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.keys(['expiresIn', 'url']);
        res.data.expiresIn.should.equal(3600);
        res.data.url.should.match(/^http:\/\/iovip\.qbox\.me\/upload\/[\w\-]+$/);
        done();
      });
    });

  });

  describe('putAuthEx()', function () {

    it('should return the auth upload url with custom expires time 60 seconds and callback url', function (done) {
      rs.putAuthEx(60, 'http://127.0.0.1/callback', function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.keys(['expiresIn', 'url']);
        res.data.expiresIn.should.equal(60);
        res.data.url.should.match(/^http:\/\/iovip\.qbox\.me\/upload\/[\w\-=]+$/);
        done();
      });
    });

  });

  describe('putFile()', function () {

    it('should upload a file with key', function (done) {
      rs.putFile('rs.test.js', null, __filename, function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        done();
      });
    });

    it('should return error when file not exists', function (done) {
      rs.putFile('rs.test.js.not.exists', null, __filename + '123', function (res) {
        res.should.have.keys('code', 'error', 'detail');
        res.code.should.equal(-1);
        res.error.should.include('ENOENT');
        done();
      });
    });

    it('should return error when req.abort()', function (done) {
      var size = fs.statSync(__filename).size;
      var stream = fs.createReadStream(__filename);

      var req = rs.put('rs.test.js.abort', null, stream, size, function (res) {
        res.should.have.keys('code', 'detail', 'error');
        res.code.should.equal(-1);
        res.error.should.equal('socket hang up');
        res.detail.code.should.equal('ECONNRESET');
        rs.get('rs.test.js.abort', 'test.js', function (res) {
          res.should.have.keys('code', 'error');
          res.code.should.equal(612);
          res.error.should.equal('no such file or directory');
          done();
        });
      });

      setTimeout(function () {
        req.abort();
      }, 5);
    });

  });

  describe('uploadFile() && upload()', function () {

    var upToken = null;
    beforeEach(function (done) {
      rs.putAuth(function (res) {
        res.code.should.equal(200);
        upToken = res.data.url;
        done();
      });
    });

    it('should upload a file with key using form-data format', function (done) {
      rs.uploadFile(upToken, 'test/rs.test.js.uploadFile', null, __filename, function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = res.data.hash;
        rs.get('test/rs.test.js.uploadFile', 'foo.js', function (res) {
          res.code.should.equal(200);
          res.data.hash.should.equal(lastHash);
          res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          res.data.fsize.should.equal(fs.statSync(__filename).size);
          done();
        });
      });
    });

    it('should return error when file not exists', function (done) {
      rs.uploadFile(upToken, 'rs.test.js.not.exists', null, __filename + '123', function (res) {
        res.should.have.keys('code', 'error', 'detail');
        res.code.should.equal(-1);
        res.error.should.include('ENOENT');
        done();
      });
    });

    it('should upload a stream with key using form-data format', function (done) {
      var logoStream = fs.createReadStream(imagefile);
      rs.upload(upToken, 'test/rs.test.js.upload.logo.png', null, 'logo.png', logoStream,
      function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = res.data.hash;
        rs.get('test/rs.test.js.upload.logo.png', 'qiniu-logo.png', function (res) {
          res.code.should.equal(200);
          res.data.hash.should.equal(lastHash);
          res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          res.data.fsize.should.equal(fs.statSync(imagefile).size);
          done();
        });
      });
    });

    it('should upload any ReadStream using form-data format', function (done) {
      var s = new Stream();
      var count = 0;
      var size = 0;
      var timer = setInterval(function () {
        var text = 'I come from timer stream ' + count + '\n';
        size += text.length;
        count++;
        if (count >= 5) {
          clearInterval(timer);
          process.nextTick(function () {
            s.emit('end');
          });
        }
        s.emit('data', text);
      }, 100);

      rs.upload(upToken, 'test/rs.test.js.upload.timer.stream', null, 'stream.txt', s, function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = res.data.hash;
        rs.get('test/rs.test.js.upload.timer.stream', 'stream.txt', function (res) {
          res.code.should.equal(200);
          res.data.hash.should.equal(lastHash);
          res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          res.data.fsize.should.equal(size);
          done();
        });
      });
    });

    it('should upload ReadStream and abort() the request', function (done) {
      var s = new Stream();
      var count = 0;
      var size = 0;
      var timer = setInterval(function () {
        var text = 'I come from timer stream ' + count + '\n';
        size += text.length;
        count++;
        if (count >= 5) {
          clearInterval(timer);
          process.nextTick(function () {
            s.emit('end');
          });
        }
        s.emit('data', text);
      }, 1000);

      var req = rs.upload(upToken, 'test/rs.test.js.upload.timer.stream.abort', null, 'stream.txt', s, function (res) {
        res.should.have.keys('code', 'detail', 'error');
        res.code.should.equal(-1);
        res.error.should.equal('socket hang up');
        res.detail.code.should.equal('ECONNRESET');
        rs.get('test/rs.test.js.upload.timer.stream.abort', 'stream.txt', function (res) {
          res.should.have.keys('code', 'error');
          res.code.should.equal(612);
          res.error.should.equal('no such file or directory');
          done();
        });
      });

      setTimeout(function () {
        req.abort();
      }, 1500);
    });

  });

  describe('uploadWithToken() && uploadFileWithToken()', function () {
    var upToken = null;
    beforeEach(function (done) {
      var opts = {
        scope: bucket,
        expires: 3600,
        callbackUrl: null,
        callbackBodyType: null,
        customer: null
      };
      var token = new qiniu.auth.UploadToken(opts);
      upToken = token.generateToken();
      done();
    });

    it('should upload a stream with key using upToken and form-date format', function (done) {

      var s = new Stream();
      var count = 0;
      var size = 0;
      var timer = setInterval(function () {
        var text = 'I come from timer stream ' + count + '\n';
        size += text.length;
        count++;
        if (count >= 5) {
          clearInterval(timer);
          process.nextTick(function () {
            s.emit('end');
          });
        }
        s.emit('data', text);
      }, 100);

      rs.uploadWithToken(upToken, s, "stream.txt", null, null, null, null, function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = res.data.hash;
        rs.get('stream.txt', 'stream.txt', function (res) {
          res.code.should.equal(200);
          res.data.hash.should.equal(lastHash);
          res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          res.data.fsize.should.equal(size);
          done();
        });
      });
    });

    it('should upload a file with key using upToken and form-date format', function (done) {
      var fstat = fs.statSync(__filename)
        , size = fstat.size;

      rs.uploadFileWithToken(upToken, __filename, "uploadfilewithtoken.txt", null, null, {}, false, function(res){
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = res.data.hash;
        rs.get('uploadfilewithtoken.txt', 'uploadfilewithtoken.txt', function (res) {
          res.code.should.equal(200);
          res.data.hash.should.equal(lastHash);
          res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          res.data.fsize.should.equal(size);
          done();
        });
      });

    });

  });

  describe('get()', function () {

    var lastHash = null;

    beforeEach(function (done) {
      rs.putFile('rs.test.js.get', null, __filename, function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        lastHash = res.data.hash;
        done();
      });
    });

    it('should return a file download url', function (done) {
      rs.get('rs.test.js.get', 'download.js', function (res) {
        res.code.should.equal(200);
        res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
        res.data.expires.should.equal(3600);
        res.data.fsize.should.be.a('number').with.above(0);
        res.data.hash.should.match(/^[\w\-=]{28}$/);
        res.data.mimeType.should.equal('application/javascript');
        res.data.url.should.match(/^http:\/\/iovip\.qbox\.me\/file\/[\w\-=]+$/);

        var options = urlparse(res.data.url);
        http.get(options, function (downloadRes) {
          downloadRes.statusCode.should.equal(200);
          downloadRes.should.have.header('content-disposition', 'attachment; filename="download.js"');
          downloadRes.should.have.header('content-length', res.data.fsize + '');
          var size = 0;
          downloadRes.on('data', function (chunk) {
            size += chunk.length;
          });
          downloadRes.on('end', function () {
            size.should.equal(res.data.fsize);
            done();
          });
        });
      });
    });

    it('should return "file modified" when hash not match', function (done) {
      rs.getIfNotModified('rs.test.js.get', 'getIfNotModified.js', 'nohash', function (res) {
        res.should.have.keys('error', 'code');
        res.code.should.equal(608);
        res.error.should.equal('file modified');
        done();
      });
    });

    it('should return download url when hash match', function (done) {
      rs.getIfNotModified('rs.test.js.get', 'getIfNotModified.js', lastHash, function (res) {
        res.should.have.keys('data', 'code');
        res.code.should.equal(200);
        res.data.url.should.match(/^http:\/\/iovip\.qbox\.me\/file\/[\w\-=]+$/);
        done();
      });
    });

    it('should return "no such file or directory" when get the not exists key', function (done) {
      done = pedding(2, done);
      rs.get('not exists key', 'abc', function (res) {
        res.should.eql({ error: 'no such file or directory', code: 612 });
        done();
      });
      rs.getIfNotModified('not exists key', 'abc', 'hash', function (res) {
        res.should.eql({ error: 'no such file or directory', code: 612 });
        done();
      });
    });

  });

  describe('stat()', function () {

    it('should return key stat info', function (done) {
      rs.stat('rs.test.js.get', function (res) {
        res.should.have.keys('code', 'data');
        res.code.should.equal(200);
        res.data.should.have.keys('fsize', 'hash', 'mimeType', 'putTime');
        done();
      });
    });

    it('should return "no such file or directory"', function (done) {
      rs.stat('not exists file', function (res) {
        res.should.eql({ error: 'no such file or directory', code: 612 });
        done();
      });
    });

  });

  describe('remove()', function () {
    before(function (done) {
      rs.putFile('rs.test.js.remove', null, __filename, function (res) {
        res.should.have.property('code', 200);
        done();
      });
    });

    it('should remove a file by key', function (done) {
      rs.remove('rs.test.js.remove', function (res) {
        res.should.eql({ code: 200 });
        // remove a gain will error
        rs.remove('rs.test.js.remove', function (res) {
          res.should.eql({ error: 'no such file or directory', code: 612 });
          done();
        });
      });
    });

    it('should return "no such file or directory" when key not exists', function (done) {
      rs.remove('not exists file', function (res) {
        res.should.eql({ error: 'no such file or directory', code: 612 });
        done();
      });
    });

  });

  describe('imageMogrifyAs()', function () {

    var sourceURL = '';
    before(function (done) {
      rs.putFile('logo.png', null, imagefile, function (res) {
        res.code.should.equal(200);
        rs.get('logo.png', 'abc', function (res) {
          res.should.have.property('code', 200);
          sourceURL = res.data.url;
          done();
        });
      });
    });

    it('should modified a image', function (done) {
      rs.imageMogrifyAs('logo.png', sourceURL, {
        thumbnail: '50x50^',
        auto_orient: true,
        format: 'jpg',
      }, function (res) {
        res.should.have.property('code', 200);
        res.should.have.property('data');
        res.data.should.have.property('hash').with.match(/^[\w\-=]+$/);
        done();
      });
    });

  });

  describe('publish() && unpublish()', function () {

    it('should publish a domain', function (done) {
      rs.publish(DEMO_DOMAIN, function (res) {
        res.should.have.property('code', 200);
        // again will no problem
        rs.publish(DEMO_DOMAIN, function (res) {
          res.should.have.property('code', 200);
          done();
        });
      });
    });

    it('should unpublish a domain', function (done) {
      rs.unpublish(DEMO_DOMAIN, function (res) {
        res.should.have.property('code', 200);
        // again will error
        rs.unpublish(DEMO_DOMAIN, function (res) {
          res.should.eql({ error: 'Document not found', code: 599 });
          done();
        });
      });
    });

  });

});
