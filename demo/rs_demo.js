var qiniu = require('../index.js');

qiniu.conf.ACCESS_KEY = 'lo_8ZEVeYKI_1V9Q7_PxrgrpEYb9RfPwJ7uO60EG'; // 在这里填入你从七牛官网获得的ACCESS KEY
qiniu.conf.SECRET_KEY = 'Yd2uM5DayPGMPuJVvQQtHJxAQBvM_7O2gsd7hPKF'; // 在这里填入你从七牛官网获得的SECRET KEY

var conn = new qiniu.digestauth.Client();

var bucket = 'qiniu_node_demo_bucket';
var key = 'rs_demo.js';
var friendName = key;

var DEMO_DOMAIN = 'iovip.qbox.me/' + bucket;

var rs = new qiniu.rs.Service(conn, bucket);

rs.buckets(function(resp){
	console.log("\n===> Buckets result: ", resp);

	rs.drop(function(resp) {
		console.log("\n===> Drop result: ", resp);

		rs.mkbucket(bucket, function(resp) {
			console.log("\n===> Mkbucket result: ", resp);
			if (resp.code != 200) {
				return;
			}

			rs.putFile(key, null, __filename, function(resp) {
				console.log("\n===> PutFile result: ", resp);
				if (resp.code != 200) {
					return;
				}

				rs.putAuth(function(resp) {
					console.log("\n===> PutAuth result: ", resp);
					if (resp.code != 200) {
						return;
					}

					rs.publish(DEMO_DOMAIN, function(resp) {
						console.log("\n===> Publish result: ", resp);
						if (resp.code != 200) {
							return;
						}

						rs.stat(key, function(resp) {
							console.log("\n===> Stat result: ", resp);
							if (resp.code != 200) {
								return;
							}

							rs.get(key, friendName, function(resp) {
								console.log("\n===> Get result: ", resp);
								if (resp.code != 200) {
									return;
								}

								rs.remove(key, function(resp) {
									console.log("\n===> Delete result: ", resp);
								});
							});
						});
					});
				});
			});
		});
	});
});