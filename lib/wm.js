var config = require('./conf.js');

function WaterMark(conn) {
	this.conn = conn;
}

WaterMark.prototype.get = function(customer, onret){
	var params = {"customer": customer};
	var url = config.WM_HOST + "/get";
	this.conn.callWith(url, params, onret);
}

WaterMark.prototype.set = function(customer, args, onret){
	var params = args;
	params["customer"] = customer;
	var url = config.WM_HOST + "/set";
	this.conn.callWith(url, params, onret);
}

exports.WaterMark = WaterMark;