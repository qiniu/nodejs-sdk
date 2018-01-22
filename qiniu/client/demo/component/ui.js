(function() {
  var init = function(obj) {
    var li_children =
      '<div id="bar-parent" style="width:100%;height:20px;border:1px solid;border-radius:3px">' +
      '<div id="bar-child" style="width:0;border:0;background-color:rgba(250,59,127,0.8);height:18px;">' +
      "</div>" +
      "</div>";
    var li = document.createElement("li");
    li.setAttribute("class", "fragment");
    li.innerHTML = li_children;
    obj.node.appendChild(li);
  };
  widget.register("li", {
    init: init
  });
})();

(function() {
  var init = function(obj) {
    var data = obj.data;
    var name = data.name;
    var size = data.size;
    var parent =
      `<td>${name}</td>` +
      `<td>${size}</td>` +
      '<td><div id="total" style="float:left;width:80%;height:30px;border:1px solid;border-radius:3px">' +
      '<div id="bar" style="width:0;border:0;background-color:rgba(232,152,39,0.8);height:28px;"></div>' +
      "</div>" +
      "<div class='control-container'>" +
      '<button class="btn btn-default control-upload">开始上传</button>' +
      "</div>" +
      '<p class="speed"></p>' +
      '<button class="btn btn-default resume">查看分块进度</button>' +
      '<ul class="fragment-group hide">' +
      "</ul></td>";
    var tr = document.createElement("tr");
    tr.innerHTML = parent;
    obj.node.appendChild(tr);
    for (var i = 0; i < data.num; i++) {
      widget.add("li", {
        data: "",
        node: tr.querySelector(".fragment-group")
      });
    }
    tr.querySelector(".resume").onclick = function() {
      var dom = tr.querySelector(".fragment-group");
      if (dom.classList.contains("hide")) {
        dom.classList.remove("hide");
      } else {
        dom.classList.add("hide");
      }
    };
    return tr;
  };
  widget.register("tr", {
    init: init
  });
})();
