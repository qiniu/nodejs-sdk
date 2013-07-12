var rpc = require('./rpc');
var conf = require('./conf');
var util = require('./util');

exports.listPrefix = function(bucket, prefix, marker, limit, onret) {
  var uri = getPrefixUri(bucket, prefix, marker, limit);
  var digest = util.generateAccessToken(uri, null);

  function parseRet(ret) {
    if (ret.code === 200 && ret.data) {
      try {
        ret.data = JSON.parse(ret.data);
      } catch (e) {
        ret['error'] = e.toString();
      }
    }
    onret(ret);
  }

  rpc.postWithoutForm(uri, digest, parseRet);
}

function getPrefixUri(bucket, prefix, marker, limit) {
  var uri = conf.RSF_HOST + '/' + 'list?' + 'bucket=' + bucket;
  if (marker) {
    uri += '&' + 'marker=' + marker;
  }

  if (limit) {
    uri += '&' + 'limit=' + limit;
  }

  if (prefix) {
    uri += '&' + 'prefix=' + prefix;
  }
  return uri;
}

function ListItem(key, hash, fsize, putTime, mimeType, endUser) {
  this.key = key || null;
  this.hash = hash || null;
  this.fsize = fsize || null;
  this.putTime = putTime || null;
  this.mimeType = mimeType || null;
  this.endUser = endUser || null;
}
