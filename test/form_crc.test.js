const assert = require('assert');
const qiniu = require('../index');
const rpc = require('../qiniu/rpc');

describe('form upload CRC option', function () {
    const originalPostMultipart = rpc.postMultipart;
    let multipartBody;

    beforeEach(function () {
        rpc.postMultipart = function (url, form, callback) {
            const chunks = [];
            form.on('data', chunk => chunks.push(Buffer.from(chunk)));
            form.on('error', callback);
            form.on('end', function () {
                multipartBody = Buffer.concat(chunks).toString();
                callback(null, {}, { statusCode: 200 });
            });
            form.resume();
        };
    });

    afterEach(function () {
        rpc.postMultipart = originalPostMultipart;
    });

    [
        { name: 'omitted', value: undefined, enabled: true },
        { name: 'true', value: true, enabled: true },
        { name: 'false', value: false, enabled: false },
        { name: 'one', value: 1, enabled: true },
        { name: 'zero', value: 0, enabled: false }
    ].forEach(function (option) {
        [undefined, '12345'].forEach(function (crc32) {
            it('handles ' + option.name + ' with ' + (crc32 ? 'supplied' : 'computed') + ' CRC', function () {
                const extra = new qiniu.form_up.PutExtra('file.txt', {}, 'text/plain', crc32, option.value);
                const config = new qiniu.conf.Config({
                    regionsProvider: new qiniu.httpc.Region({
                        services: { up: [new qiniu.httpc.Endpoint('upload.example.com')] }
                    })
                });
                const uploader = new qiniu.form_up.FormUploader(config);
                const token = 'access:signature:' + qiniu.util.urlsafeBase64Encode(JSON.stringify({ scope: 'bucket' }));

                return uploader.put(token, 'key', 'hello world', extra).then(function () {
                    assert.strictEqual(multipartBody.includes('name="crc32"'), option.enabled);
                    if (option.enabled) {
                        assert(multipartBody.includes('\r\n' + (crc32 || '222957957') + '\r\n'));
                    }
                });
            });
        });
    });
});
