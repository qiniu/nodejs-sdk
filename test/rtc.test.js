const should = require('should');
const assert = require('assert');
const qiniu = require("../index.js");
const proc = require("process");

before(function(done) {
  if (!process.env.QINIU_PILI_ACCESS_KEY || !process.env.QINIU_PILI_SECRET_KEY) {
    console.log('should run command `source test-env.sh` first\n');
    process.exit(0);
  }
  done();
});

describe('test rtc credentials', function() {
  var accessKey = proc.env.QINIU_ACCESS_KEY;
  var secretKey = proc.env.QINIU_SECRET_KEY;

  var credentials = new qiniu.Credentials(accessKey, secretKey);
  var appId = null;
  var appData = {
    hub: 'sdk-live',
    title: 'testtitle',
    maxUsers: 10,
    noAutoKickUser: true,
  };
  describe('test create app', function() {
    it('create app', function(done) {
      qiniu.app.createApp(appData, credentials, function(err, res) {
        should.not.exist(err);
        should.exist(res.appId);
        assert.equal(res.title, 'testtitle');
        appId = res.appId;
        done();
      });
    });
  });

  describe('test update app', function() {
    it('update app', function(done) {
      appData.title = 'testtitle2';
      qiniu.app.updateApp(appId, appData, credentials, function(err, res) {
        should.not.exist(err);
        assert.equal(res.title, 'testtitle2');
        assert.equal(res.appId, appId);
        done();
      });
    })
  });

  describe('test get app', function() {
    it('get app', function(done) {
      qiniu.app.getApp(appId, credentials, function(err, res) {
        should.not.exist(err);
        assert.equal(res.title, 'testtitle2');
        assert.equal(res.appId, appId);
        done();
      })
    });
  });

  describe('test delete app', function() {
    it('delete app', function(done) {
      qiniu.app.deleteApp(appId, credentials, function(err, res) {
        should.not.exist(err);
        done();
      })
    })
  });
});
