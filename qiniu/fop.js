var util = require('./util');
var rpc = require('./rpc');
var conf = require('./conf');

var querystring = require('querystring');

exports.ImageView = ImageView;
exports.ImageInfo = ImageInfo;
exports.Exif = Exif;
exports.pfop = pfop;

function ImageView(mode, width, height, quality, format) {
  this.mode = mode || 1;
  this.width = width || 0;
  this.height = height || 0;
  this.quality = quality || 0;
  this.format = format || null;
}

ImageView.prototype.makeRequest = function(url) {
  url += '?imageView2/' + this.mode;

  if (this.width > 0) {
    url += '/w/' + this.width;
  }

  if (this.height > 0) {
    url += '/h/' + this.height;
  }

  if (this.quality > 0) {
    url += '/q/' + this.quality;
  }

  if (this.format) {
    url += '/format/' + this.format;
  }

  return url;
}

function ImageInfo() {}

ImageInfo.prototype.makeRequest = function(url) {
  return url + '?imageInfo'
}

function Exif() {}

Exif.prototype.makeRequest = function(url) {
  return url + '?exif'
}


function pfop(bucket, key, fops, opts, onret) {

  opts = opts || {};

  param = {
    bucket: bucket,
    key: key,
    fops: fops
  };
  if (opts.notifyURL) {
    param.notifyURL = opts.notifyURL;
  } else {
    param.notifyURL = undefined;
  }
  if (opts.force) {
    param.force = opts.force;
  } else {
    param.force = 0;
  }
  if (opts.pipeline) {
    param.pipeline = opts.pipeline;
  }

  var uri = conf.API_HOST + '/pfop/';
  var body = querystring.stringify(param);
  var auth = util.generateAccessToken(uri, body);
  rpc.postWithForm(uri, body, auth, onret);
}
