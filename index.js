module.exports = {
    auth: {
        digest: require('./qiniu/auth/digest.js')
    },
    cdn: require('./qiniu/cdn.js'),
    form_up: require('./qiniu/storage/form.js'),
    resume_up: require('./qiniu/storage/resume.js'),
    rs: require('./qiniu/storage/rs.js'),
    fop: require('./qiniu/fop.js'),
    conf: require('./qiniu/conf.js'),
    httpc: {
        middleware: require('./qiniu/httpc/middleware'),
        HttpClient: require('./qiniu/httpc/client').HttpClient,
        ResponseWrapper: require('./qiniu/httpc/responseWrapper').ResponseWrapper,
        Endpoint: require('./qiniu/httpc/endpoint').Endpoint,
        StaticEndpointsProvider: require('./qiniu/httpc/endpointsProvider').StaticEndpointsProvider,
        SERVICE_NAME: require('./qiniu/httpc/region').SERVICE_NAME,
        Region: require('./qiniu/httpc/region').Region,
        StaticRegionsProvider: require('./qiniu/httpc/regionsProvider').StaticRegionsProvider,
        CachedRegionsProvider: require('./qiniu/httpc/regionsProvider').CachedRegionsProvider,
        QueryRegionsProvider: require('./qiniu/httpc/regionsProvider').QueryRegionsProvider,
        ChainedRegionsProvider: require('./qiniu/httpc/regionsProvider').ChainedRegionsProvider
    },
    rpc: require('./qiniu/rpc.js'),
    util: require('./qiniu/util.js'),
    zone: require('./qiniu/zone.js'),
    app: require('./qiniu/rtc/app.js'),
    room: require('./qiniu/rtc/room.js'),
    Credentials: require('./qiniu/rtc/credentials.js'),
    sms: {
        message: require('./qiniu/sms/message.js')
    }
};

// TODO: is this warning message ok in here?
console.warn(
    'WARNING:\n' +
    'qiniu SDK will migrate API to Promise style gradually.\n' +
    'The callback style will not be removed for now,\n' +
    'but you should catch your error in your callback function itself'
);
