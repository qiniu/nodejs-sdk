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
    if (!this.resp || !this.resp.statusCode) {
        return true;
    }

    if (this.ok()) {
        return false;
    }

    const statusCode = this.resp.statusCode;

    // 需要重试的特例
    if ([996].includes(statusCode)) {
        return true;
    }

    // 不需要重试的特例
    // 579 上传成功，回调失败
    // 612 app/AK 不存在
    // 631 bucket 不存在
    if ([579, 612, 631].includes(statusCode)) {
        return false;
    }

    // 需要重试的状态码
    const statusFirstDigit = Math.floor(statusCode / 100);
    if ([5, 6].includes(statusFirstDigit)) {
        return true;
    }

    // 不需要重试的状态码
    if ([4].includes(statusFirstDigit)) {
        return false;
    }

    return false;
};

exports.ResponseWrapper = ResponseWrapper;
