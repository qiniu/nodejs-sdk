function ResponseWrapper ({
    data,
    resp
}) {
    this.data = data;
    this.resp = resp;
}

/**
 * @return {boolean}
 */
ResponseWrapper.prototype.ok = function () {
    return this.resp && Math.floor(this.resp.statusCode / 100) === 2;
};

/**
 * @return {boolean}
 */
ResponseWrapper.prototype.needRetry = function () {
    if (this.resp.statusCode > 0 && this.resp.statusCode < 500) {
        return false;
    }

    // https://developer.qiniu.com/fusion/kb/1352/the-http-request-return-a-status-code
    if ([
        501, 509, 573, 579, 608, 612, 614, 616, 618, 630, 631, 632, 640, 701
    ].includes(this.resp.statusCode)) {
        return false;
    }

    return true;
};

exports.ResponseWrapper = ResponseWrapper;
