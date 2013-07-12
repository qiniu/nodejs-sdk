var fop = require('../').fop;

describe('test start step 0', function() {
  describe('fop.js', function() {
    var pic = 'http://test963.qiniudn.com/logo.png';

    describe('fop.Exif#makeRequest()', function() {
      it('test makeRequest', function(done) {
        var exif = new fop.Exif();
        var returl = exif.makeRequest(pic);
        returl.should.equal(pic + '?exif');
        done();
      });
    });

    describe('fop.ImageView#makeRequest()', function() {
      it('test makeRequest of ImageView', function(done) {
        var iv = new fop.ImageView();
        iv.height = 100;
        iv.width = 40;
        var returl = iv.makeRequest(pic);
        returl.should.equal(pic + '?imageView/1/w/40/h/100');

        iv.quality = 20;
        iv.format = 'jpg';
        returl = iv.makeRequest(pic);
        returl.should.equal(pic + '?imageView/1/w/40/h/100/q/20/format/jpg');
        done();
      });
    });

    describe('fop.ImageInfo#makeRequest()', function() {
      it('test makeRequest of ImageInfo', function(done) {
        var ii = new fop.ImageInfo();
        var returl = ii.makeRequest(pic);
        returl.should.equal(pic + '?imageInfo');
        done();
      });
    });

  });
});

