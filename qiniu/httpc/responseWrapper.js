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
    if ([612, 631].includes(statusCode)) {
        return false;
    }

    const statusFirstDigit = Math.floor(statusCode / 100);
    if ([5].includes(statusFirstDigit)) {
        return true;
    }

    if ([4].includes(statusFirstDigit)) {
        return false;
    }

    return false;
};

exports.ResponseWrapper = ResponseWrapper;
