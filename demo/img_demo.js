var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = 'lo_8ZEVeYKI_1V9Q7_PxrgrpEYb9RfPwJ7uO60EG'; // 在这里填入你从七牛官网获得的ACCESS KEY
qiniu.conf.SECRET_KEY = 'Yd2uM5DayPGMPuJVvQQtHJxAQBvM_7O2gsd7hPKF'; // 在这里填入你从七牛官网获得的SECRET KEY

var bucket = 'qiniu_node_image_demo_bucket';
var key = 'test.jpg'; // test.jpg must exists
var friendlyName = key;

var newkey = "test-cropped.jpg";
var thumbnails_bucket = 'thumbnails_bucket';
var DEMO_DOMAIN = 'http://iovip.qbox.me' + thumbnails_bucket;

var conn = new qiniu.digestauth.Client();
var rs = new qiniu.rs.Service(conn, bucket);
var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket);

var wm = new qiniu.wm.WaterMark(conn)

rs.buckets(function(resp){
    console.log("\n===> Buckets result: ", resp);

    rs.drop(function(resp) {
        console.log("\n===> Drop result: ", resp);

        rs.mkbucket(bucket, function(resp) {
            console.log("\n===> Mkbucket result: ", resp);
            if (resp.code != 200) {
                return;
            }

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

                    var params = {
                        "gravity": "SouthWest",
                        "text": "@ikbear",
                    };

                    rs.setProtected(1, function(resp){
                        console.log("\n===> Set protected result:", resp);
                    });

                    rs.setSeparator("-", function(resp){
                        console.log("\n===> Set separator result:", resp);
                    });

                    rs.setStyle("small.jpg", "imageView/0/w/64/h/64/watermark/0", function(resp){
                        console.log("\n===> Set style result:", resp);

                        if (resp.code != 200) {
                            return;
                        }

                        rs.unsetStyle("small.jpg", function(resp){
                            console.log("\n===> Unset style result:", resp);
                        });
                        
                    });

                    wm.set("Ikbear", params, function(resp){
                        console.log("\n===> Set WaterMark Result: ", resp);

                        if (resp.code != 200) {
                            return;
                        }
                        
                        wm.get("Ikbear", function(resp){
                            console.log("\n===> Get WaterMark Result:", resp);
                        });

                    });

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
    });
});
