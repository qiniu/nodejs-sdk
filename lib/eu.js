var config = require('./conf.js');
var querystring = require('querystring');


function WaterMark(conn) {
	this.conn = conn;
}

WaterMark.prototype.get = function(customer, onret){
	if (null !== customer) {
		var params = {
			"customer": customer,
		};
		params = querystring.stringify(params);
		var url = config.EU_HOST + "/wmget";
		this.conn.callWith(url, params, onret);
	}
}

WaterMark.prototype.set = function(customer, params, onret){
	var params = params || {};
	if (null !== customer) {
		params["customer"] = customer;
	}
	params = querystring.stringify(params);
	var url = config.EU_HOST + "/wmset";
	this.conn.callWith(url, params, onret);
}

exports.WaterMark = WaterMark;