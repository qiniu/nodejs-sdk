var qiniu = require('../');
var should = require('should');
var path = require('path');
var fs = require('fs');

// qiniu.conf.ACCESS_KEY = process.env.QINIU_ACCESS_KEY;
// qiniu.conf.SECRET_KEY = process.env.QINIU_SECRET_KEY;

qiniu.conf.ACCESS_KEY = 'DWQOcImtTCrnPp1ogwgAHBdIK1mIFrnmtnXb-66-';
qiniu.conf.SECRET_KEY = 'cJFhYuaq7Vo35e1XDFUG8Rm8C2VjkpmXO0aGkJGM';

// var TEST_BUCKET = process.env.QINIU_TEST_BUCKET;
var TEST_BUCKET = 'nodejstest';
// var TEST_DOMAIN = process.env.QINIU_TEST_DOMAIN;

var imageFile = path.join(__dirname, 'logo.png');

// before(function(done) {
//   if(!process.env.QINIU_ACCESS_KEY) {
//     console.log('should run command `source test-env.sh` first\n');
//     process.exit(0);
//   }
//   done();
// });

describe('test start step1:', function() {

  var keys = [];

  after(function(done) {
    var entries = [];
    for (var i in keys) {
      entries.push(new qiniu.rs.EntryPath(TEST_BUCKET, keys[i]));
    }

    var client = new qiniu.rs.Client();
    client.batchDelete(entries, function(err, ret) {
      should.not.exist(err);
      should.exist(ret);
      ret.length.should.equal(entries.length);
      ret.forEach(function (result) {
        result.should.eql({code: 200});
      });
      done();
    });
  });

  describe('io.js', function() {
    describe('upload#', function() {
      var uptoken = null;
      beforeEach(function(done) {
        var putPolicy = new qiniu.rs.PutPolicy(
          TEST_BUCKET
        );
	      uptoken = putPolicy.token();
        done();
      });

      describe('io.putReadable()', function() {
        it('test upload from readableStrem', function(done) {
          var key = 'filename' + Math.random(1000);
          var rs = fs.createReadStream(imageFile);
          qiniu.io.putReadable(uptoken, key, rs, null, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('hash', 'key');
            ret.key.should.equal(key);
            ret.hash.should.be.a('string');
            keys.push(ret.key);
            done();
          });
        });
      });

      describe('io.put()', function() {
        it('test upload from memory', function(done) {
          var key = 'filename' + Math.random(1000);
          qiniu.io.put(uptoken, key, 'content', null, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('hash', 'key');
            ret.key.should.equal(key);
            ret.hash.should.be.a('string');
            keys.push(ret.key);
            done();
          });
        });
      });

      describe('io.putWithoutKey()', function() {
        it('test upload from memory without key', function(done) {
          var content = 'content' + Math.random(1000);
          qiniu.io.putWithoutKey(uptoken, content, null, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('hash', 'key');
            ret.key.should.equal(ret.hash);
            keys.push(ret.key);
            done();
          });
        });
      });

      describe('io.putFile()', function() {
        it('test upload from a file', function(done) {
          var key = Math.random() + 'logo.png';
          qiniu.io.putFile(uptoken, key, imageFile, null, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('key', 'hash');
            ret.key.should.equal(key);
            keys.push(ret.key);
            done();
          });
        });

        it('test upload from a file with checkCrc32=1', function(done) {
          var extra = new qiniu.io.PutExtra();
          extra.checkCrc = 1;
          var key = Math.random() + 'logo_crc32.png';
          qiniu.io.putFile(uptoken, key, imageFile, extra, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('key', 'hash');
            ret.key.should.equal(key);
            keys.push(ret.key);
            done();
          });
        });
      });

//      describe('io.putFileWithoutKey()', function() {
//        it('test upload from a file without key', function(done) {
//          qiniu.io.putFileWithoutKey(uptoken, imageFile, null, function(ret) {
//            ret.code.should.equal(200);
//            ret.data.should.have.keys('key', 'hash');
//            ret.data.key.should.equal(ret.data.hash);
//            keys.push(ret.data.key);
//            done();
//          });
//        });
//      });
    });
  });

  describe('rsf.js', function() {
    describe('file handle', function() {
      describe('rsf.listPrefix()', function() {
        it('list all file in test bucket', function(done) {
          qiniu.rsf.listPrefix(TEST_BUCKET, null, null, null, null, function(err, ret) {
            should.not.exist(err);
//            ret.data.items.length.should.equal(keys.length);
            for (var i in ret.items) {
              ret.items[i].should.have.keys('key', 'putTime', 'hash', 'fsize', 'mimeType');
//              keys.indexOf(ret.items[i].key).should.above(-1);
            }
            done();
          });
        });
      });
    });
  });

  describe('pfop', function() {
    it('do pfop', function(done) {
// @gist pfop
// pfop
      qiniu.fop.pfop(TEST_BUCKET, keys[0], 'avinfo', {notifyURL: 'www.test.com'}, function(err, ret) {
        ret.should.have.keys('persistentId');
        done();
      });
// @endgist
    })
  });
});
