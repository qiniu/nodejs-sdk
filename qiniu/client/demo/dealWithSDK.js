function dealWithSDK(token, putExtra, config) {
  //切换tab后进行一些css操作
  controlTabDisplay("sdk");
  var width;
  var isfirstAddBoard = true;
  document.getElementById("select2").onchange = function() {
    var file = this.files[0];
    var observable;
    if (file) {
      var key = file.name;
      //添加上传dom面板
      var board = addUploadBoard(file, config, key, "");
      var dom_total = board.querySelector("#total").querySelector("#bar");
      //设置next,error,complete对应的操作，分别处理相应的进度信息，错误信息，以及完成后的操作
      var error = function(err) {
        console.log(err);
      };
      var complete = function(res) {
        console.log(res);
        board.querySelector("#total").classList.add("hide");
        board.querySelector(".control-container").innerHTML =
          "<p><strong>Hash：</strong>" +
          res.hash +
          "</p>" +
          "<p><strong>Bucket：</strong>" +
          res.bucket +
          "</p>";
      };
      var next = function(progress) {
        for (var key in progress) {
          if (key != "total") {
            var dom = board
              .querySelectorAll(".fragment-group li")
              [key].querySelector("#bar-child");
            dom.style.width =
              Math.floor(progress[key].percent / 100 * width.childWidth - 2) +
              "px";
            // "<p>" +
          } else {
            board.querySelector(".speed").innerText =
              "进度：" +
              progress[key].percent +
              "% " ;
            dom_total.style.width =
              Math.floor(progress[key].percent / 100 * width.totalWidth - 2) +
              "px";
          }
        }
      };
      //observable.subscribe的参数，也可以分开传，例如observable.subscribe(fun1,fun2,fun3)
      var subObject = {
        next: next,
        error: error,
        complete: complete
      };
      var subscription;
      //判断是否是第一次增加，这里主要是获得dom上传面板的初始宽度
      if (isfirstAddBoard) {
        width = getBoardWidth(board);
        isfirstAddBoard = false;
      }
      putExtra.params["x:name"] = key.split(".")[0];
      board.start = true;
      //调用sdk上传接口获得相应的observable，控制上传和暂停
      observable = qiniu.upload(file, key, token, putExtra, config);
      //按钮控制上传操作
      board.querySelector(".control-upload").onclick = function() {
        var that = this;
        if (board.start) {
          if (board.start == "resume") {
            subscription = observable.subscribe(subObject);
            this.innerText = "暂停上传";
            board.start = false;
          } else {
            board.start = false;
            this.innerText = "暂停上传";
            subscription = observable.subscribe(subObject);
          }
        } else {
          board.start = "resume";
          subscription.unsubscribe();
          this.innerText = "继续上传";
        }
      };
    }
  };
}
