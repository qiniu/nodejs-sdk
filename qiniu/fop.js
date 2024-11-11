const util = require('./util');
const rpc = require('./rpc');
const conf = require('./conf');
const digest = require('./auth/digest');
const querystring = require('querystring');

exports.OperationManager = OperationManager;

function OperationManager (mac, config) {
    this.mac = mac || new digest.Mac();
    this.config = config || new conf.Config();
}

/**
 * @typedef {function(Error, any, IncomingMessage)} OperationCallback
 */

/**
 * @param {string} bucket 空间名称
 * @param {string} key 文件名称
 * @param {string[]} fops 处理指令
 * @param {string} pipeline 队列名称
 * @param {object} options 可选参数
 * @param {string} [options.notifyURL] 回调业务服务器，通知处理结果
 * @param {boolean} [options.force] 是否强制覆盖已有的同名文件
 * @param {string} [options.type] 为 `1` 时，开启闲时任务
 * @param {string} [options.workflowTemplateID] 工作流模板 ID
 * @param {OperationCallback} callbackFunc 回调函数
 */
OperationManager.prototype.pfop = function (
    bucket,
    key,
    fops,
    pipeline,
    options,
    callbackFunc
) {
    options = options || {};
    // 必须参数
    const reqParams = {
        bucket: bucket,
        key: key
    };
    // `fops` is optional by could use `options.workflowTemplateID` to work
    if (Array.isArray(fops)) {
        reqParams.fops = fops.join(';');
    }

    // pipeline
    if (!pipeline) {
        delete reqParams.pipeline;
    }

    // notifyURL
    if (options.notifyURL) {
        reqParams.notifyURL = options.notifyURL;
    }

    // force
    if (options.force) {
        reqParams.force = 1;
    }

    // workflowTemplateID
    if (options.workflowTemplateID) {
        reqParams.workflowTemplateID = options.workflowTemplateID;
    }

    const persistentType = parseInt(options.type, 10);
    if (!isNaN(persistentType)) {
        reqParams.type = persistentType;
    }

    util.prepareZone(this, this.mac.accessKey, bucket, function (err, ctx) {
        if (err) {
            callbackFunc(err, null, null);
            return;
        }
        pfopReq(ctx.mac, ctx.config, reqParams, callbackFunc);
    });
};

function pfopReq (mac, config, reqParams, callbackFunc) {
    const scheme = config.useHttpsDomain ? 'https://' : 'http://';
    const requestURI = scheme + config.zone.apiHost + '/pfop/';
    const reqBody = querystring.stringify(reqParams);
    const auth = util.generateAccessToken(mac, requestURI, reqBody);
    rpc.postWithForm(requestURI, reqBody, auth, callbackFunc);
}

/**
 * 查询持久化数据处理进度
 * @param {string} persistentId
 * @param {OperationCallback} callbackFunc 回调函数
 */
OperationManager.prototype.prefop = function (
    persistentId,
    callbackFunc
) {
    let apiHost = 'api.qiniu.com';
    if (this.config.zone) {
        apiHost = this.config.zone.apiHost;
    }

    const scheme = this.config.useHttpsDomain ? 'https://' : 'http://';
    const requestURI = scheme + apiHost + '/status/get/prefop';
    const reqParams = {
        id: persistentId
    };
    const reqBody = querystring.stringify(reqParams);
    rpc.postWithForm(requestURI, reqBody, null, callbackFunc);
};
