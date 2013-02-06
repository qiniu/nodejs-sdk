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

qiniu.conf.ACCESS_KEY = process.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = process.env.QINIU_SECRET_KEY;

var currentTime = new Date().getTime();
var bucket = "qiniutest" + currentTime,
    DEMO_DOMAIN = bucket + '.qiniudn.com',
    imagefile = path.join(__dirname, 'logo.png'),
    gogopher = path.join(__dirname, 'gogopher.jpg');

var conn = new qiniu.digestauth.Client(),
    rs = new qiniu.rs.Service(conn, bucket);

describe('rs.test.js', function () {
  var lastHash = null;

  before(function (done) {
    qiniu.rs.mkbucket(conn, bucket, function(err, data){
      should.not.exists(err);
      data.should.have.property('code', 200);
      done();
    });
  });

  after(function (done) {
    rs.drop(function (err, data) {
      should.not.exists(err);
      data.should.have.property('code', 200);
      done();
    });
  });

  describe('putAuth()', function () {

    it('should return the auth upload url with default expires time 3600 seconds', function (done) {
      rs.putAuth(function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.keys(['expiresIn', 'url']);
        data.detail.expiresIn.should.equal(3600);
        data.detail.url.should.match(/^http:\/\/iovip\.qbox\.me\/upload\/[\w\-]+$/);
        done();
      });
    });

  });

  describe('putAuthEx()', function () {

    it('should return the auth upload url with custom expires time 60 seconds and callback url', function (done) {
      rs.putAuthEx(60, 'http://127.0.0.1/callback', function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.keys(['expiresIn', 'url']);
        data.detail.expiresIn.should.equal(60);
        data.detail.url.should.match(/^http:\/\/iovip\.qbox\.me\/upload\/[\w\-=]+$/);
        done();
      });
    });

  });

  describe('putFile()', function () {

    it('should upload a file with key', function (done) {
      rs.putFile('rs.test.js', null, __filename, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        done();
      });
    });

    it('should return error when file not exists', function (done) {
      rs.putFile('rs.test.js.not.exists', null, __filename + '123', function (err, data) {
        err.should.have.keys('code', 'error', 'detail');
        err.code.should.equal(-1);
        err.error.should.include('ENOENT');
        done();
      });
    });

    it('should return error when req.abort()', function (done) {
      var size = fs.statSync(__filename).size;
      var stream = fs.createReadStream(__filename);

      var req = rs.put('rs.test.js.abort', null, stream, size, function (err, data) {
        err.code.should.equal('ECONNRESET');

        rs.get('rs.test.js.abort', 'test.js', function (err, data) {
          should.equal(err, 'Error: E612 : no such file or directory');
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
      rs.putAuth(function (err, data) {
        should.not.exists(err);
        data.code.should.equal(200);
        upToken = data.detail.url;
        done();
      });
    });

    it('should upload a file with key using form-data format', function (done) {
      rs.uploadFile(upToken, 'test/rs.test.js.uploadFile', null, __filename, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;
        rs.get('test/rs.test.js.uploadFile', 'foo.js', function (err, data) {
          should.not.exists(err);
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(fs.statSync(__filename).size);
          done();
        });
      });
    });

    it('should return error when file not exists', function (done) {
      rs.uploadFile(upToken, 'rs.test.js.not.exists', null, __filename + '123', function (err, data) {
        err.should.have.keys('code', 'error', 'detail');
        err.code.should.equal(-1);
        err.error.should.include('ENOENT');
        err.detail.code.should.equal('ENOENT');
        err.detail.path.should.equal(__filename + '123');
        done();
      });
    });

    it('should upload a stream with key using form-data format', function (done) {
      var logoStream = fs.createReadStream(imagefile);
      rs.upload(upToken, 'test/rs.test.js.upload.logo.png', null, 'logo.png', logoStream, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;
        rs.get('test/rs.test.js.upload.logo.png', 'qiniu-logo.png', function (err, data) {
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(fs.statSync(imagefile).size);
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

      rs.upload(upToken, 'test/rs.test.js.upload.timer.stream', null, 'stream.txt', s, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;
        rs.get('test/rs.test.js.upload.timer.stream', 'stream.txt', function (err, data) {
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(size);
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

      var req = rs.upload(upToken, 'test/rs.test.js.upload.timer.stream.abort', null, 'stream.txt', s, function (err, data) {
        should.exists(err);
        err.code.should.equal('ECONNRESET');
        rs.get('test/rs.test.js.upload.timer.stream.abort', 'stream.txt', function (err, data) {
          should.equal(err, 'Error: E612 : no such file or directory');

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

      rs.uploadWithToken(upToken, s, "stream.txt", null, null, null, null, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;
        rs.get('stream.txt', 'stream.txt', function (err, data) {
          should.equal(err, null);
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(size);
          done();
        });
      });
    });

    it('should upload a file with key using upToken and form-date format', function (done) {
      var fstat = fs.statSync(__filename)
        , size = fstat.size;

      rs.uploadFileWithToken(upToken, __filename, "uploadfilewithtoken.txt", null, null, {}, false, function(err, data){
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;
        rs.get('uploadfilewithtoken.txt', 'uploadfilewithtoken.txt', function (err, data) {
          should.equal(err, null);
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(size);
          done();
        });
      });
    });

    it('should upload a image with key using upToken with returnBody config', function (done) {
      var fstat = fs.statSync(gogopher)
        , size = fstat.size
        , returnBody = '{ \
          "author": "ikbear", \
          "size": $(fsize), \
          "hash": $(etag), \
          "w": $(imageInfo.width), \
          "h": $(imageInfo.height), \
          "color": $(exif.ColorSpace.val) \
        }';

      var opts = {
        escape: 1,
        scope: bucket,
        expires: 3600,
        callbackUrl: null,
        callbackBodyType: 'application/json',
        customer: 'ikbear',
        returnBody: returnBody,
        asyncOps: 'imageMogr/auto-orient/thumbnail/!256x256r/gravity/center/crop/!256x256/quality/80/rotate/45'
      };

      var  callbackParams = '{ \
        "from": "ikbear", \
        size: $(fsize), \
        etag: $(etag), \
        w: $(imageInfo.width), \
        h: $(imageInfo.height), \
        exif: $(exif) \
      }';

      var token = new qiniu.auth.UploadToken(opts);
      upToken = token.generateToken();

      rs.uploadFileWithToken(upToken, gogopher, "gogopher.png", null, null, callbackParams, false, function(err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.detail.should.have.keys('author', 'size', 'hash', 'w', 'h', 'color');

        data.code.should.equal(200);
        data.detail.author.should.equal('ikbear');
        data.detail.size.should.equal(size);

        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        var lastHash = data.detail.hash;

        rs.get("gogopher.png", 'gogopher.png', function(err, data) {
          should.not.exists(err);
          data.should.have.keys('code', 'detail');
          data.code.should.equal(200);
          data.detail.hash.should.equal(lastHash);
          data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
          data.detail.fsize.should.equal(size);
          done();
        });
      });
    });

  });

  describe('get()', function () {

    var lastHash = null;

    beforeEach(function (done) {
      rs.putFile('rs.test.js.get', null, __filename, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]{28}$/);
        lastHash = data.detail.hash;
        done();
      });
    });

    it('should return a file download url', function (done) {
      rs.get('rs.test.js.get', 'download.js', function (err, data) {
        should.not.exists(err);
        data.code.should.equal(200);
        data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
        data.detail.expires.should.equal(3600);
        data.detail.fsize.should.be.a('number').with.above(0);
        data.detail.hash.should.match(/^[\w\-=]{28}$/);
        data.detail.mimeType.should.equal('application/javascript');
        data.detail.url.should.match(/^http:\/\/iovip\.qbox\.me\/file\/[\w\-=]+$/);

        var options = urlparse(data.detail.url);
        http.get(options, function (downloadRes) {
          downloadRes.statusCode.should.equal(200);
          downloadRes.should.have.header('content-disposition', 'attachment; filename="download.js"');
          downloadRes.should.have.header('content-length', data.detail.fsize + '');
          var size = 0;
          downloadRes.on('data', function (chunk) {
            size += chunk.length;
          });
          downloadRes.on('end', function () {
            size.should.equal(data.detail.fsize);
            done();
          });
        });
      });
    });

    it('should return "file modified" when hash not match', function (done) {
      rs.getIfNotModified('rs.test.js.get', 'getIfNotModified.js', 'nohash', function (err, data) {
        should.equal(err, 'Error: E608 : file modified');
        done();
      });
    });

    it('should return download url when hash match', function (done) {
      rs.getIfNotModified('rs.test.js.get', 'getIfNotModified.js', lastHash, function (err, data) {
        should.not.exists(err);
        data.should.have.keys('detail', 'code');
        data.code.should.equal(200);
        data.detail.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
        data.detail.expires.should.equal(3600);
        data.detail.fsize.should.be.a('number').with.above(0);
        data.detail.hash.should.match(/^[\w\-=]{28}$/);
        data.detail.mimeType.should.equal('application/javascript');
        data.detail.url.should.match(/^http:\/\/iovip\.qbox\.me\/file\/[\w\-=]+$/);
        done();
      });
    });

    it('should return "no such file or directory" when get the not exists key', function (done) {
      done = pedding(2, done);
      rs.get('not exists key', 'abc', function (err, data) {
        should.equal(err, 'Error: E612 : no such file or directory');
        done();
      });
      rs.getIfNotModified('not exists key', 'abc', 'hash', function (err, data) {
        should.equal(err, 'Error: E612 : no such file or directory');
        done();
      });
    });

  });

  describe('stat()', function () {

    it('should return key stat info', function (done) {
      rs.stat('rs.test.js.get', function (err, data) {
        should.not.exists(err);
        data.should.have.keys('code', 'detail');
        data.code.should.equal(200);
        data.detail.should.have.keys('fsize', 'hash', 'mimeType', 'putTime');
        done();
      });
    });

    it('should return "no such file or directory"', function (done) {
      rs.stat('not exists file', function (err, data) {
        should.equal(err, 'Error: E612 : no such file or directory');
        done();
      });
    });

  });

  describe('remove()', function () {
    before(function (done) {
      rs.putFile('rs.test.js.remove', null, __filename, function (err, data) {
        should.not.exists(err);
        data.should.have.property('code', 200);
        done();
      });
    });

    it('should remove a file by key', function (done) {
      rs.remove('rs.test.js.remove', function (err, data) {
        should.not.exists(err);
        data.should.eql({ code: 200 });
        // remove a gain will error
        rs.remove('rs.test.js.remove', function (err, data) {
          should.equal(err, 'Error: E612 : no such file or directory');
          done();
        });
      });
    });

    it('should return "no such file or directory" when key not exists', function (done) {
      rs.remove('not exists file', function (err, data) {
        should.equal(err, 'Error: E612 : no such file or directory');
        done();
      });
    });

  });

  describe('imageMogrifyAs()', function () {

    var sourceURL = '';
    before(function (done) {
      rs.putFile('logo.png', null, imagefile, function (err, data) {
        should.not.exists(err);
        data.code.should.equal(200);
        rs.get('logo.png', 'abc', function (err, data) {
          data.should.have.property('code', 200);
          sourceURL = data.detail.url;
          done();
        });
      });
    });

    it('should modified a image', function (done) {
      rs.imageMogrifyAs('logo.png', sourceURL, {
        thumbnail: '50x50^',
        auto_orient: true,
        format: 'jpg',
      }, function (err, data) {
        should.not.exists(err);
        data.should.have.property('code', 200);
        data.detail.should.have.property('hash').with.match(/^[\w\-=]+$/);
        done();
      });
    });

  });

  describe('publish() && unpublish()', function () {

    it('should publish a domain', function (done) {
      rs.publish(DEMO_DOMAIN, function (err, data) {
        should.not.exists(err);
        data.should.have.property('code', 200);
        // again will no problem
        rs.publish(DEMO_DOMAIN, function (err, data) {
          should.equal(err, null);
          data.should.have.property('code', 200);
          done();
        });
      });
    });

    it('should unpublish a domain', function (done) {
      rs.unpublish(DEMO_DOMAIN, function (err, data) {
        should.not.exists(err);
        data.should.have.property('code', 200);
        // again will error
        rs.unpublish(DEMO_DOMAIN, function (err, data) {
          should.equal(err, 'Error: E599 : Document not found');
          done();
        });
      });
    });

  });

});
