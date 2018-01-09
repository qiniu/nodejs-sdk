//实现form直传无刷新并解决跨域问题
function dealWithForm(token, putExtra, config) {
  controlTabDisplay("form");
  var uploadUrl = getUploadUrl({config:config,putExtra:putExtra});

  document.getElementsByName("token")[0].value = token;
  //把action地址指向我们的 node sdk 后端服务,通过后端来实现跨域访问
  document.querySelector("#uploadForm").action = "api/take";
  document.getElementsByName("url")[0].value = uploadUrl;
  //当选择文件后执行的操作
  document.getElementById("select3").onchange = function() {
    var iframe = createIframe();
    disableButtonOfSelect();
    var key = this.files[0].name;
    //添加上传dom面板
    var board = addUploadBoard(this.files[0], config, key,"3");
    board.querySelector(".fragment-group").classList.add("hide")
    //复制form表单里的key
    document.getElementsByName("key")[0].value = key;
    board.querySelector("#total").classList.add("hide");
    //绑定上传按钮开始事件
    board.querySelector(".control-upload").onclick = function() {
      enableButtonOfSelect();
      document.getElementById("uploadForm").setAttribute("target", iframe.name);
      document.getElementById("uploadForm").submit();
      this.innerText="上传中..."
      this.setAttribute("disabled","disabled")
      //iframe加载完后去拿到返回的响应信息
      iframe.onload = function(e) {
        var doc = iframe.contentWindow.document;
        var html = doc.querySelector("pre").innerText;
        if (html != "") {
          var json = JSON.parse(html);
          board.querySelector(".control-container").innerHTML =
            "<p><strong>Hash：</strong>" +
            json.hash +
            "</p>" +
            "<p><strong>Bucket：</strong>" +
            json.bucket +
            "</p>";
        }
      };
    };
  };
}
//
function createIframe() {
  var iframe = document.createElement("iframe");
  iframe.name = "iframe" + Math.random();
  document.getElementById("directForm").appendChild(iframe);
  iframe.style.display = "none";
  return iframe;
}

function enableButtonOfSelect() {
  document.getElementById("select3").removeAttribute("disabled", "disabled");
  document
    .getElementById("directForm")
    .querySelector("button").style.backgroundColor =
    "#00b7ee";
}
function disableButtonOfSelect() {
  document.getElementById("select3").setAttribute("disabled", "disabled");
  document
    .getElementById("directForm")
    .querySelector("button").style.backgroundColor =
    "#aaaaaa";
}
