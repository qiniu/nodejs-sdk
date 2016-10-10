
var libpath = process.env.QINIU_COV ? './lib-cov' : './qiniu';

module.exports = {
  auth: {
    digest: require(libpath + '/auth' + '/digest.js')
  },
  io: require(libpath + '/io.js'),
  rs: require(libpath + '/rs.js'),
  rsf: require(libpath + '/rsf.js'),
  fop: require(libpath + '/fop.js'),
  conf: require(libpath + '/conf.js'),
  rpc: require(libpath + '/rpc.js'),
  util: require(libpath + '/util.js'),
  zone: require(libpath + '/zone.js')
};
