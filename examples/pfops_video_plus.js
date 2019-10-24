var qiniu = require('qiniu');
var urllib = require('urllib');

qiniu.conf.ACCESS_KEY = 'ak';
qiniu.conf.SECRET_KEY = 'sk';

var url = 'http://argus.atlab.ai/v1/video/89999sssss';

var mac = new qiniu.auth.digest.Mac(qiniu.conf.ACCESS_KEY, qiniu.conf.SECRET_KEY);

var json = {

    data: {
        uri: 'http://test.qiniu.com/Videos/2016-09/39/9d019f7acab742ddbc5f4db02b6f72cb.mp4'
    },
    params: {
        async: false,
        vframe: {
            mode: 0,
            interval: 5
        }
    },
    ops: [
        {
            op: 'pulp',
            params: {
                labels: [
                    {
                        label: '1',
                        select: 2,
                        score: 0.0002
                    },
                    {
                        label: '2',
                        select: 2,
                        score: 0.0002
                    }

                ]
            }
        }
    ]
};

var accessToken = qiniu.util.generateAccessTokenV2(mac, url, 'POST', 'application/json', JSON.stringify(json));

urllib.request(url, {
    method: 'POST',
    headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json'
    },
    data: JSON.stringify(json)
}, function (err, data, res) {
    if (err) {
        console.log(err);
        throw err; // you need to handle error
    }
    console.log(res.statusCode);
    console.log(res);
    console.log(data.toString());
});
