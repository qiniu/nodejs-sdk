(function() {
  var ajax = getToken();
  document.querySelector(".box").classList.add("hide");
  ajax.onreadystatechange = function() {
    if (ajax.readyState === 4 && ajax.status === 200) {
      var token = eval("(" + ajax.responseText + ")").uptoken;
      var config = new qiniu.Config();
      var putExtra = new qiniu.PutExtra();
      putExtra.crc32 = true;
      config.zone = qiniu.Zones.Zone_z2;
      config.useHttpsDomain = false;
      config.useCdnDomain = true;
      config.putThreshhold = 4 * 1024 * 1024; //启用分片上传阈值
      var tabs = document.querySelectorAll(".nav-box li a");
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = function(e) {
          console.log(e.target.name);
          switch (e.target.name) {
            case "h5":
              dealWithSDK(token, putExtra, config);
              break;
            case "expand":
              dealWithOthers(token, putExtra, config);
              break;
            case "directForm":
              dealWithForm(token, putExtra, config);
              break;
            default:
              "";
          }
        };
      }
      dealWithSDK(token, putExtra, config);
    }
  };
})();

function getToken() {
  if (window.XMLHttpRequest) {
    xmlhttp = new XMLHttpRequest();
  } else {
    xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
  }
  var token;
  xmlhttp.open("GET", "/api/uptoken");
  xmlhttp.send();
  return xmlhttp;
}
function createAjax() {
  var xmlhttp = {};
  if (window.XMLHttpRequest) {
    xmlhttp = new XMLHttpRequest();
  } else {
    xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
  }
  return xmlhttp;
}
