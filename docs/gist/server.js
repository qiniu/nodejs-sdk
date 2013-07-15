var qiniu = require('../..');

// @gist init
qiniu.conf.ACCESS_KEY = '<Your Access Key>'
qiniu.conf.SECRET_KEY = '<Your Secret Key>'
// @endgist

// @gist uptoken
function uptoken(bucketname) {
  var putPolicy = new qiniu.rs.PutPolicy(bucketname);
  //putPolicy.callbackUrl = callbackUrl;
  //putPolicy.callbackBody = callbackBody;
  //putPolicy.returnUrl = returnUrl;
  //putPolicy.returnBody = returnBody;
  //putPolicy.asyncOps = asyncOps;
  //putPolicy.expires = expires;

  return putPolicy.token();
}
// @endgist

// @gist downloadUrl
function downloadUrl(domain, key) {
  var baseUrl = rs.makeBaseUrl(domain, key);
  var policy = new rs.GetPolicy();
  return policy.makeRequest(baseUrl);
}
// @endgist
