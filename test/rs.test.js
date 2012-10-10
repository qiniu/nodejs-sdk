/*!
 * qiniu - test/rs.test.js
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var http = require('http');
var should = require('should');
var qiniu = require('../');
var config = require('./config');
var path = require('path');
var pedding = require('pedding');

qiniu.conf.ACCESS_KEY = config.ACCESS_KEY;
qiniu.conf.SECRET_KEY = config.SECRET_KEY;

var conn = new qiniu.digestauth.Client();

var bucket = config.bucket;
var DEMO_DOMAIN = 'iovip.qbox.me/' + bucket;

var rs = new qiniu.rs.Service(conn, bucket);

function drop(done) {
  rs.drop(function (res) {
    res.should.have.property('code', 200);
    done();
  });
}

describe('rs.test.js', function () {
  var lastHash = null;

  before(function (done) {
    drop(function () {
      rs.putFile('rs.test.js.get', null, __filename, function (res) {
        res.code.should.equal(200);
        lastHash = res.data.hash;
        done();
      });
    });
  });

  after(drop);

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

  });

  describe('get()', function () {

    it('should return a file download url', function (done) {
      rs.get('rs.test.js.get', 'download.js', function (res) {
        res.code.should.equal(200);
        res.data.should.have.keys('expires', 'fsize', 'hash', 'mimeType', 'url');
        res.data.expires.should.equal(3600);
        res.data.fsize.should.be.a('number').with.above(0);
        res.data.hash.should.match(/^[\w\-=]{28}$/);
        res.data.mimeType.should.equal('application/octet-stream');
        res.data.url.should.match(/^http:\/\/iovip\.qbox\.me\/file\/[\w\-=]+$/);

        http.get(res.data.url, function (downloadRes) {
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

    var imagefile = path.join(__dirname, 'logo.png');
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
