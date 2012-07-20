var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

var bucket = 'test_image_bucket';
var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var newkey = "test-cropped.jpg";
var thumbnails_bucket = 'thumbnails_bucket';
var DEMO_DOMAIN = 'iovip.qbox.me/' + thumbnails_bucket;

var conn = new qiniu.digestauth.Client();
var rs = new qiniu.rs.Service(conn, bucket);
var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket);

rs.drop(function(resp) {
	console.log("\n===> Drop result: ", resp);

	rs.putFile(key, "image/jpg", friendlyName, function(resp) {
		console.log("\n===> PutFile result: ", resp);
		if (resp.code != 200) {
			return;
		}

        rs.get(key, friendlyName, function(resp) {
            console.log("\n===> Get result: ", resp);
            if (resp.code != 200) {
                return;
            }
            var options = {
                "thumbnail": "!120x120r",
                "gravity": "center",
                "crop": "!120x120a0a0",
                "quality": 85,
                "rotate": 45,
                "format": "jpg",
                "auto_orient": true
            };

            console.log("\n===> thumbnail url is: ", qiniu.img.mogrify(resp.data.url, options));

            imgrs.imageMogrifyAs(newkey, resp.data.url, options, function(resp){
                console.log("\n===> imageMogrifyAs result: ", resp);
                if (resp.code != 200) {
                    return;
                }
                imgrs.publish(DEMO_DOMAIN, function(resp) {
                    console.log("\n===> Publish result: ", resp);
                    if (resp.code != 200) {
                        return;
                    }
                });
            });
		});
	});
});
