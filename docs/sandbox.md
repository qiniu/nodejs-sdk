# Sandbox SDK

Sandbox 公共 API 对齐 `qiniu/api-specs` 的 `6cb3b18a8958`（2026-11-11）。

```js
const qiniu = require('qiniu');
const client = new qiniu.sandbox.SandboxClient({
    endpoint: process.env.QINIU_SANDBOX_ENDPOINT,
    apiKey: process.env.QINIU_SANDBOX_API_KEY
});
const sandbox = await qiniu.Sandbox.create({
    client,
    template: 'base',
    timeout: 300,
    autoPause: true,
    autoPauseMemory: false,
    autoResume: { enabled: false }
});
```

## 连接与暂停

`Sandbox.connect`、实例 `connect` 和 `client.connectSandbox` 使用
`POST /v2/sandboxes/{sandboxID}/connect`，也可通过 `client.connectSandboxV2` 调用。
未指定超时时使用 300 秒；`timeout` 单位为秒，`timeoutMs` 单位为毫秒。
连接会恢复已暂停的实例，TTL 只会延长。运行中返回 HTTP 200，恢复后返回 HTTP 201。

```js
await sandbox.pause({ memory: false });
await sandbox.connect({ timeout: 300 });
```

`memory` 默认 `true`。设为 `false` 只保存文件系统，恢复时冷启动，原进程和内存状态丢失，
必须显式 connect 或 resume，不能由流量自动恢复。
创建时 `autoPauseMemory: false` 采用同样的文件系统暂停方式，不能与启用的 `autoResume` 组合。
需要流量自动恢复时，可使用 `autoPause: true`、`autoPauseMemory: true` 和
`autoResume: { enabled: true }`。

## 持久快照

```js
// 调用前保存这个键；结果未知时，使用同一键、同一 sandbox ID 和同一请求体重试。
const captureKey = 'a-unique-key-for-this-capture';
const snapshot = await sandbox.createSnapshot({
    name: 'demo:v1',
    memory: false,
    idempotencyKey: captureKey
});
console.log(snapshot.snapshotID, snapshot.names);

const copy = await qiniu.Sandbox.create({ client, template: snapshot.snapshotID });
await copy.kill();
```

快照返回 `snapshotID` 和 `names`；实例封装还提供 `snapshotId` 别名。
`name` 可包含标签，如 `demo:v1`，不能包含 `/`，命名空间由账号决定。
同一团队已有该快照名称时，新构建会分配给原模板。
`memory` 默认 `true`，文件系统快照使用 `false`。
冷启动时系统可能清理 `/tmp`；验证文件持久化应使用用户目录等持久路径。

每次捕获都必须携带 1–128 字符的 `Idempotency-Key`。SDK 在未指定键时自动生成，
并在本次调用的自动重试中保持键与请求体不变。`maxRetries` 控制重试次数，默认 5。
调用结束后再次手动重试应显式保留原键；新一次捕获（即便名称相同）使用新键。
HTTP 408 可能代表后台仍在捕获，取消等待也不会取消已接受的捕获。
已完成的结果（包括失败）会被重放。记录保留 35 分钟，完成后重新计算保留期；
结果未知时先核实原捕获，避免换键重复捕获。
服务端语义错误码可通过 `err.data.error_code` 读取。

```js
const paginator = sandbox.listSnapshots({ name: 'demo:v1', limit: 10 });
while (paginator.hasNext) {
    const items = await paginator.nextItems();
    console.log(items.map(item => item.snapshotID));
}
// 指定单次调用的游标可覆盖当前分页位置；后续调用继续使用服务端返回的游标。
const resumed = await sandbox.listSnapshots({ limit: 10 }).nextItems({ nextToken: 'saved-cursor' });
// 底层列表返回数组；分页接口额外读取 X-Next-Token 响应头。
const items = await client.listSnapshots({ sandboxID: sandbox.sandboxID });
const page = await client.listSnapshotsPage({ name: 'demo:v1', limit: 10 });
// 不再需要快照时，删除对应的模板。
await client.deleteSnapshot(snapshot.snapshotID);
```

`deleteSnapshot` 使用 `DELETE /templates/{snapshotID}`，与 `deleteTemplate` 共用模板删除接口。

## 模板磁盘与标签

```js
await qiniu.sandbox.Template().fromImage('ubuntu:22.04').build({
    client,
    name: 'demo:v1',
    minDiskMb: 20480,
    minFreeDiskMb: 1024
});
const tags = await client.listTemplateTags('template-id');
// 每项包含 tag、buildID、createdAt。
```

`minDiskMb` 是构建后最小总磁盘大小，`minFreeDiskMb` 是构建后最小可用空间，均以 MiB 为单位，
也适用于 `client.createTemplate` / `createTemplateV3`。两者同时设置时应同时满足，磁盘不会缩小。
`minDiskMb` 省略或为 0 时不要求最小总大小；`minFreeDiskMb` 省略时使用团队默认值，
为 0 时不要求为可用空间扩容。可用空间扩容尽力而为，文件系统元数据可能使实际值略低于要求。
旧的模板构建 `diskSizeMB` 字段已被替换，应迁移到以上参数；Sandbox 返回值中的 `diskSizeMB` 不受此变更影响。

## 独立资源凭据

每个 GitHub repository 资源提供自己的 `authorization_token`。
列表通过 `resource_id` 标识资源，并且不会返回凭据。

```js
const result = await sandbox.getResources();
const repo = result.resources.find(resource => resource.type === 'github_repository');
await sandbox.updateGitRepositoryResourceToken(repo.resource_id, process.env.GITHUB_TOKEN);
// 底层接口：client.getSandboxResources / client.updateGitRepositoryResourceToken。
```

PATCH 只支持更新 GitHub 资源的 `authorization_token`，运行中的实例立即生效；不支持更新 Kodo 资源。
Kodo 资源可以分别提供 `access_key` / `secret_key`，此时支持 API key 认证。
任一 Kodo 资源未提供完整凭据时，SDK 使用 Qiniu Mac 认证，从认证上下文取得凭据。

## JSON body 注入

```js
await sandbox.updateInjections([{
    type: 'http',
    baseUrl: 'https://example.com/api/*',
    ifBody: { model: 'demo' },
    body: { token: process.env.SERVICE_TOKEN }
}]);
```

JSON body 匹配和注入仅支持 `type: 'http'`，不适用于各服务商专用注入类型。
`ifBody`（或 `if_body`）按大小写精确匹配顶层 JSON 字符串字段，所有条件必须匹配。
`body` 为匹配请求添加或覆盖顶层字符串字段，值直接赋值且不会从 API 返回。
条件和注入字段各最多 20 项；仅支持不压缩、至多 1 MiB 的 `application/json` 请求。
无效或不支持的请求体，以及已有注入目标字段不是字符串的情况，会产生错误。
创建 Sandbox、更新运行时注入、创建或更新注入规则均支持这些字段。

## 示例与验证

运行示例前设置 `QINIU_SANDBOX_API_KEY`，按需设置 `QINIU_SANDBOX_ENDPOINT` 和
`QINIU_SANDBOX_TEMPLATE`。

| 示例 | 内容 |
| --- | --- |
| `examples/sandbox_lifecycle.js` | 自动暂停配置、文件系统暂停、Connect v2 |
| `examples/sandbox_paginator_snapshot_mcp.js` | 快照幂等键、名称、模板标签、分页与清理 |
| `examples/sandbox_templates.js` | 磁盘要求、模板标签；构建需设置 `QINIU_SANDBOX_TEMPLATE_MUTATION_EXAMPLE=true` |
| `examples/sandbox_resources.js` | 单仓库 token 更新、Kodo 独立凭据 |
| `examples/sandbox_request_injections.js` | 请求头与 JSON body 注入 |

Kodo 独立凭据示例使用 `QINIU_SANDBOX_KODO_ACCESS_KEY`、`QINIU_SANDBOX_KODO_SECRET_KEY`，
未设置时沿用 `QINIU_SANDBOX_ACCESS_KEY` / `QINIU_SANDBOX_SECRET_KEY` 的 Mac 认证。
运行前请查看示例中涉及的资源操作和清理流程。

```sh
npm run test:sandbox
npm run check-type
npm run lint
```

Sandbox 单元测试使用本地 HTTP 服务核对请求、响应、重试和分页，无需真实云凭据。
`test/sandbox_integration.test.js` 中的在线验证需要配置 Sandbox API key。

## Desktop

Desktop 使用 `desktop` 模板中的 Xvfb、Xfce、xdotool、scrot、x11vnc 和
`/opt/noVNC/utils/novnc_proxy`，通过现有 envd 命令与文件接口执行操作。
自定义模板需预装这些工具及 `xdpyinfo`、`xrandr`、`xdg-open`、
`pgrep`、`pkill`、`ps`、`awk` 和 `netstat`。

```js
const desktop = await qiniu.Desktop.create({
    client,
    resolution: { width: 1024, height: 768 },
    dpi: 96,
    display: ':0',
    timeout: 300,
    pollOptions: { intervalMs: 2000, timeoutMs: 90000 }
});
try {
    await desktop.launch('xfce4-terminal');
    await desktop.wait(1000);
    await desktop.typeText('echo Hello desktop', { chunkSize: 25, delayMs: 75 });
    await desktop.press('enter');
    const png = await desktop.screenshot(); // Buffer，包含鼠标指针的 PNG
    require('fs').writeFileSync('desktop.png', png);
} finally {
    await desktop.sandbox.kill();
}
```

`qiniu.Desktop` 与 `qiniu.sandbox.Desktop` 是同一个类。
也可调用 `client.createDesktop(options)`，或用
`Desktop.create('custom-template', options)` 选择模板。
默认分辨率为 1024 × 768，DPI 为 96，display 为 `:0`。
创建时复制环境变量并设置 `DISPLAY`，不会修改传入对象；等待 sandbox 运行后启动桌面，
并等待 Xvfb 和 Xfce 就绪。创建后的初始化失败会尝试销毁 sandbox，销毁失败信息保存在
原始错误的 `cleanupError` 中。

已有实例可通过 `new qiniu.Desktop(sandbox, options)` 包装；构造函数不会启动进程，
按需调用 `await desktop.start()`。同一 Desktop 实例的 `start()` 支持并发调用并只初始化一次。
Sandbox 的生命周期、文件、命令、Git 等 API 通过 `desktop.sandbox` 访问，
例如 `desktop.sandbox.files.read(...)`、`desktop.sandbox.pause()` 和
`desktop.sandbox.kill()`。冷启动恢复丢失桌面进程后，应重新包装并调用 `start()`。

| 操作 | API |
| --- | --- |
| 屏幕与指针 | `screenSize()`、`cursorPosition()`、`screenshot()` |
| 移动、单击、双击 | `moveMouse({ x, y })`、`click('left', { x, y })`、`doubleClick(point)` |
| 按下、释放、拖动 | `mouseDown('left')`、`mouseUp('left')`、`drag(from, to)` |
| 滚轮 | `scroll('up', 3)`、`scroll('down', 3)` |
| 文本与组合键 | `typeText(text, { chunkSize, delayMs })`、`press('ctrl', 'c')` |
| 打开文件、URL、应用 | `open(pathOrURL)`、`launch('firefox-esr', '--new-window', url)` |
| 窗口查询 | `activeWindowID()`、`applicationWindows('xfce4-terminal')`、`windowTitle(id)` |
| 等待 | `wait(durationMs)` |

鼠标按钮支持 `left`、`middle`、`right`；`click()` 默认左键，单击和双击省略坐标时使用
当前位置。坐标接受非负整数，包括 `{ x: 0, y: 0 }`。同一 Desktop 实例中的键鼠操作按调用
顺序串行执行，拖拽和分段文本输入期间不会插入其他输入操作。文本按 Unicode 码点分块，
默认每块 25 个字符、每字符延迟 75 毫秒，`delayMs: 0` 禁用延迟。
`press` 接受单独的按键参数，例如 `press('ctrl', 'shift', 'enter')`。
`launch` 接受可执行文件名称（从 PATH 查找）或路径，后续参数按 argv 原样传递，
不接受 `.desktop` 应用 ID。它等待最多 250 毫秒检查早期退出失败，然后断开长驻进程连接；
返回成功不代表应用窗口已就绪，调用方可用窗口查询确认。
应用没有可见窗口时 `applicationWindows` 返回空数组。
命令非零退出会抛出 `DesktopCommandError`（继承 `CommandExitError`），包含
`operation` 和完整的 `result`。

### noVNC 桌面流

```js
await desktop.stream.start();
const url = desktop.stream.url({ viewOnly: true, resize: 'scale' });
const password = desktop.stream.authKey();
// 将 URL 和密码交给连接端；URL 默认不包含密码。
await desktop.stream.stop();
```

`stream.start()` 默认启用随机 VNC 密码，VNC 端口为 5900，Web 端口为 6080。
可设置 `{ vncPort, webPort, requireAuth, windowID }`；两个端口必须不同且位于 1–65535。
`windowID` 可指定十进制或十六进制 X11 窗口 ID，仅共享该窗口。
已运行的流再次启动会报错，已占用的 Web 端口会在启动前被拒绝。就绪检查确认监听进程属于
本次 noVNC 代理或其子进程，启动失败会尝试清理已启动进程和临时密码文件。
`stop()` 可重复调用；即使清理失败，也会清除本地运行状态和内存中的密码，并返回错误。

`stream.url()` 默认自动连接，缩放方式为 `scale`；也支持 `off` 和 `remote`。
只有显式传入 `authKey` 才会把密码加入 URL；这会使密码可能出现在浏览器历史、代理和日志中。
`requireAuth: false` 可显式禁用 VNC 密码，此时 `authKey()` 会报错。
停止流后不能再获取 URL 或密码。

平台流量鉴权和 VNC 密码是两层独立鉴权。私有流量需要在请求 Header 中携带流量令牌，
浏览器直接打开 noVNC URL 无法附加该 Header，调用方应提供鉴权代理。
需要浏览器直接访问时，可在创建 sandbox 时显式设置
`network: { allowPublicTraffic: true }`，并保留默认 VNC 密码认证。

示例：[sandbox_desktop.js](../examples/sandbox_desktop.js)。运行示例需要
`QINIU_SANDBOX_API_KEY`，可选设置 `QINIU_SANDBOX_ENDPOINT` 和
`QINIU_SANDBOX_DESKTOP_TEMPLATE`，支持从 `.env` 读取。示例保存 `desktop.png`，
启动流后保留 30 秒，再停止流并销毁 sandbox。

`npm run test:sandbox` 覆盖本地 desktop 单元测试与模拟 HTTP/envd 传输；
`npm run test:sandbox:integration:desktop` 显式执行真实环境验收，创建一个 TTL 为 180 秒、
允许公共流量的临时 desktop sandbox，测试截图、键鼠、窗口、noVNC 两种认证模式并清理实例。
普通测试不会自动启动这项真实环境验收。
