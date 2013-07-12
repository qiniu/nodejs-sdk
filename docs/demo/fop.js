var qiniu = require('../../');

// @gist makeImageInfoUrl
function makeImageInfoUrl(imageUrl) {
  var ii = new qiniu.fop.ImageInfo();
  return ii.makeRequest(imageUrl);
}
// @endgist

// @gist makeExifUrl
function makeExifUrl(imageUrl) {
  var e = new qiniu.fop.Exif();
  return e.makeRequest(imageUrl);
}
// @endgist

// @gist makeImageViewUrl
function makeImageViewUrl(imageUrl, mode, width, height, quality, format) {
  var iv = new qiniu.fop.ImageView(mode, width, height, quality, format);
  return iv.makeRequest(imageUrl);
}
// @endgist
