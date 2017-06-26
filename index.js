var libPath = process.env.QINIU_COV ? './lib-cov' : './qiniu';

module.exports = {
  auth: {
    digest: require(libPath + '/auth' + '/digest.js')
  },
  cdn: require(libPath + "/cdn.js"),
  form_up: require(libPath + '/storage/form.js'),
  resume_up: require(libPath + '/storage/resume.js'),
  rs: require(libPath + '/storage/rs.js'),
  fop: require(libPath + '/fop.js'),
  conf: require(libPath + '/conf.js'),
  rpc: require(libPath + '/rpc.js'),
  util: require(libPath + '/util.js'),
  zone: require(libPath + '/zone.js')
};
