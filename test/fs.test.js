var qiniu = require('../');
var should = require('should');
var path = require('path');

qiniu.conf.ACCESS_KEY = process.env.QINIU_ACCESS_KEY;
qiniu.conf.SECRET_KEY = process.env.QINIU_SECRET_KEY;

var Urls = "<urls1>";
var Dirs = "<dirs1>";
var StartDate = "date";
var EndDate =  "date";
var Granularity = "day";
var Domains = "<Domains1>";
var Day =  "date";



describe('test start step3:', function() {
    describe('fs.test.js', function () {
        var cdnManager = new qiniu.fs.CdnManager();

        describe('fs.CdnManager#refreshUrls()', function () {
           it('',function (done) {
               cdnManager.refreshUrls(Urls, function (err, ret) {
                   should.not.exist(err);
                   done();
               })
           })
        });

        describe('fs.CdnManager#refreshDirs()', function () {
            it('',function (done) {
                cdnManager.refreshDirs(Dirs, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });

        describe('fs.CdnManager#refreshUrlsAndDirs()', function () {
            it('',function (done) {
                cdnManager.refreshUrlsAndDirs(Urls, Dirs, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });

        describe('fs.CdnManager#prefetch()', function () {
            it('',function (done) {
                cdnManager.prefetch(Urls, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });

        describe('fs.CdnManager#bandwidth()', function () {
            it('',function (done) {
                cdnManager.bandwidth(StartDate, EndDate, Granularity, Domains, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });

        describe('fs.CdnManager#flux()', function () {
            it('',function (done) {
                cdnManager.flux(StartDate, EndDate, Granularity, Domains, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });

        describe('fs.CdnManager#logList()', function () {
            it('',function (done) {
                cdnManager.logList(Day, Domains, function (err, ret) {
                    should.not.exist(err);
                    done();
                })
            })
        });
    });
});


