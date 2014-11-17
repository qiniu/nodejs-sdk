var qiniu = require('../');
var should = require('should');
var path = require('path');

qiniu.conf.ACCESS_KEY = process.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = process.env.QINIU_SECRET_KEY;

var TEST_BUCKET = process.env.QINIU_TEST_BUCKET;
var TEST_DOMAIN = process.env.QINIU_TEST_DOMAIN;
var imageFile = path.join(__dirname, 'logo.png');

var logo  = Math.random() + 'logo.png';
var logo1 = Math.random() + 'logo1.png';
var logo2 = Math.random() + 'logo2.png';
var logo3 = Math.random() + 'logo3.png';
describe('test start step2:', function() {

  describe('rs.test.js', function() {

    var client = new qiniu.rs.Client();

    var EntryPath = qiniu.rs.EntryPath;
    var EntryPathPair = qiniu.rs.EntryPathPair;

    describe('single file handle', function() {

      before(function(done) {
        var putPolicy = new qiniu.rs.PutPolicy();
        var uptoken = putPolicy.token();
        qiniu.io.putFile(uptoken, logo2, imageFile, null, function(err, ret) {
          should.not.exist(err);
        });
        qiniu.io.putFile(uptoken, logo, imageFile, null, function(err, ret) {
          should.not.exist(err);
          done();
        });
      });

      describe('rs.Client#stat()', function() {
        it('get the stat of a file', function(done) {
          client.stat(TEST_BUCKET, logo, function(err, ret) {
            should.not.exist(err);
            ret.should.have.keys('hash', 'fsize', 'putTime', 'mimeType');
            done();
          });
        });
      });

      describe('rs.Client#copy()', function() {
        it('copy logo.png to logo1.png', function(done) {
          client.copy(TEST_BUCKET, logo, TEST_BUCKET, logo1, function(err, ret) {
            should.not.exist(err);
            done();
          });
        });
      });

      describe('rs.Client#remove()', function() {
        it('remove logo.png', function(done) {
          client.remove(TEST_BUCKET, logo, function(err, ret) {
            should.not.exist(err);
            done();
          });
        });
      });

      describe('rs.Client#move()', function() {
        it('move logo1.png to logo.png', function(done) {
          client.move(TEST_BUCKET, logo1, TEST_BUCKET, logo, function(err, ret) {
            should.not.exist(err);
            done();
          });
        });
      });
    });

    describe('batch file handle', function() {

      after(function(done) {
        var entries = [new EntryPath(TEST_BUCKET, logo), new EntryPath(TEST_BUCKET, logo2)];

        client.batchDelete(entries, function(err, ret) {
          should.not.exist(err);
          done();
        });
      });

      describe('rs.Client#batchStat()', function() {
        it('get the stat of logo.png and logo2.png', function(done) {
          var entries = [
            new EntryPath(TEST_BUCKET, logo),
            new EntryPath(TEST_BUCKET, logo2)];

            client.batchStat(entries, function(err, ret) {
              should.not.exist(err);
              ret.length.should.equal(2);
              for (var i in ret) {
                ret[i].code.should.equal(200);
                ret[i].data.should.have.keys('fsize', 'hash', 'mimeType', 'putTime');
              }
              done();
            });
        });

        it('should return code 298 when partial ok', function(done) {

          var entries = [
            new EntryPath(TEST_BUCKET, logo),
            new EntryPath(TEST_BUCKET, 'not exist file')];

            client.batchStat(entries, function(err, ret) {
              should.not.exist(err); // 298
              ret.length.should.equal(2);

              for (var i in ret) {
                if (ret[i].code !== 200) {
                  ret[i].code.should.equal(612);
                  ret[i].data.should.have.keys('error');
                }
              }

              done();
            });
        });

      });

      describe('rs.Client#batchCopy', function() {
        var entries = [];
        entries.push(new EntryPathPair(new EntryPath(TEST_BUCKET, logo), new EntryPath(TEST_BUCKET, logo1)));
        entries.push(new EntryPathPair(new EntryPath(TEST_BUCKET, logo2), new EntryPath(TEST_BUCKET, logo3)));

        it('copy from logo, logo2 to logo1, logo3', function(done) {
          client.batchCopy(entries, function(err, ret) {
            should.not.exist(err);
            ret.should.eql([ { code: 200 }, { code: 200 } ]);
            done();
          });
        });
      });

      describe('rs.Client#batchDelete', function() {
        var entries = [new EntryPath(TEST_BUCKET, logo), new EntryPath(TEST_BUCKET, logo2)];

        it('delete logo.png, logo2.png', function(done) {
          client.batchDelete(entries, function(err, ret) {
            should.not.exist(err);
            done();
          });
        });
      });

      describe('rs.Client#batchMove', function() {
        var entries = [];
        entries.push(new EntryPathPair(new EntryPath(TEST_BUCKET, logo1), new EntryPath(TEST_BUCKET, logo)));
        entries.push(new EntryPathPair(new EntryPath(TEST_BUCKET, logo3), new EntryPath(TEST_BUCKET, logo2)));

        it('move from logo1.png, logo3.png to logo.png, logo2.png', function(done) {
          client.batchMove(entries, function(err, ret) {
            should.not.exist(err);
            done();
          });
        });
      });
    });

    describe('rs.isQiniuCallBack', function() {

      it('test isQiniuCallback true', function(done) {
        var auth = 'QBox QWYn5TFQsLLU1pL5MFEmX3s5DmHdUThav9WyOWOm:4GcOC2_eiw97QBNsHiwLzSqxelI=';
        var path = '/callback';
        var content = 'key=43850.6579994258936495&hash=FllOJrhvzorEKnyMwE-o7pfciiha';
        var ok = qiniu.util.isQiniuCallback(path, content, auth);
        ok.should.be.ok;
        done();
      });
    });

  });
});
