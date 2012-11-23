var libpath = process.env.QINIU_COV ? './lib-cov' : './lib';

module.exports = {
    conf: require(libpath + '/conf.js'),
    digestauth: require(libpath + '/digestauth.js'),
    rs: require(libpath + '/rs.js'),
    up: require(libpath + '/up.js'),
    img: require(libpath + '/img.js'),
    auth: require(libpath + '/auth.js'),
};
