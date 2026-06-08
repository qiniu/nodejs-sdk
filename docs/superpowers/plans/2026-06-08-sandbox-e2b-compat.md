# Sandbox E2B Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Qiniu Node.js `sandbox` module much closer to E2B JS SDK ergonomics while preserving Qiniu-specific Sandbox APIs such as injection rules, repository resources, and AK/SK authentication.

**Architecture:** Keep the existing split under `qiniu/sandbox/`, add focused compatibility files instead of growing a single module, and expose both `qiniu.sandbox.*` and E2B-style top-level exports where safe. Implement real behavior where Qiniu OpenAPI or envd supports it, and return typed compatibility errors for E2B APIs that require unsupported backend products such as persistent Volumes.

**Tech Stack:** CommonJS Node.js SDK, `urllib`, Mocha, `should`, TypeScript declaration file `index.d.ts`, Qiniu Sandbox OpenAPI, envd Connect JSON RPC.

---

## File Structure

- Modify `index.js`: add E2B-style top-level `Sandbox`, `SandboxClient`, and selected error exports.
- Modify `index.d.ts`: declare E2B-compatible overloads, errors, Git/file/template/network helpers, and Qiniu extensions.
- Modify `qiniu/sandbox/index.js`: export new compatibility classes without breaking existing namespace imports.
- Modify `qiniu/sandbox/errors.js`: expand typed errors: `CommandExitError`, `TimeoutError`, `NotImplementedError`, `GitAuthError`, `GitUpstreamError`, `TemplateBuildError`.
- Modify `qiniu/sandbox/sandbox.js`: support `Sandbox.create(template, opts)`, instance `connect`, `updateNetwork`, snapshots/MCP helpers where OpenAPI supports them, and typed unsupported errors where it does not.
- Modify `qiniu/sandbox/client.js`: add any missing control-plane wrappers found in `spec/openapi-public.yml`, especially sandbox network and template build helpers.
- Modify `qiniu/sandbox/commands.js`: align option names (`requestTimeoutMs`, `signal`) and add E2B-like command failure semantics without breaking existing callers.
- Modify `qiniu/sandbox/filesystem.js`: support read/write formats (`text`, `bytes`, `blob`, `stream`) and add watch compatibility if envd streaming can be represented.
- Modify `qiniu/sandbox/git.js`: add E2B-compatible Git auth, branch, reset, restore, credential cleanup, config scopes, and typed Git errors.
- Create `qiniu/sandbox/template.js`: E2B-style `Template` builder facade mapped to Qiniu template create/build endpoints.
- Create `qiniu/sandbox/network.js`: constants and helpers for Qiniu/E2B network config, including `ALL_TRAFFIC`.
- Create `qiniu/sandbox/volume.js`: explicit unsupported compatibility class unless Qiniu OpenAPI adds a matching volume backend.
- Modify `test/sandbox.test.js`: add unit tests for every compatibility behavior, using fake control-plane/envd servers as existing tests do.
- Modify `test/sandbox_integration.test.js`: extend only with non-destructive real checks; keep slow/destructive template builds behind explicit env flags.

---

### Task 1: E2B-Style Entry Points And Create Overload

**Files:**
- Modify: `index.js`
- Modify: `qiniu/sandbox/index.js`
- Modify: `qiniu/sandbox/sandbox.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to `test/sandbox.test.js`:

```js
it('exports E2B style top-level Sandbox and client classes', function () {
  qiniu.Sandbox.should.equal(qiniu.sandbox.Sandbox);
  qiniu.SandboxClient.should.equal(qiniu.sandbox.SandboxClient);
  qiniu.CommandExitError.should.equal(qiniu.sandbox.CommandExitError);
});

it('supports Sandbox.create(template, opts) overload', function () {
  var requests = [];
  var server = createSandboxApiServer(function (req) {
    requests.push(req);
    return { sandboxID: 'sbx-template', templateID: 'nodejs', envdAccessToken: 'token' };
  });

  return server.listenAsync().then(function () {
    return qiniu.sandbox.Sandbox.create('nodejs', {
      apiKey: 'test-key',
      apiUrl: server.url,
      metadata: { source: 'e2b-overload' }
    });
  }).then(function (sandbox) {
    sandbox.sandboxId.should.equal('sbx-template');
    requests[0].body.templateID.should.equal('nodejs');
    requests[0].body.metadata.source.should.equal('e2b-overload');
  }).finally(function () {
    return server.closeAsync();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "E2B style top-level\\|create\\(template"`

Expected: fail because `qiniu.Sandbox` or `Sandbox.create(template, opts)` is not implemented.

- [ ] **Step 3: Implement the minimal code**

Implement `Sandbox.create` argument normalization:

```js
Sandbox.create = function (templateOrOpts, maybeOpts) {
  var opts = typeof templateOrOpts === 'string'
    ? Object.assign({}, maybeOpts || {}, { templateID: templateOrOpts })
    : (templateOrOpts || {});
  var client = new SandboxClient(opts);
  return client.createSandbox(opts).then(function (info) {
    return new Sandbox(info, client);
  });
};
```

Export top-level aliases from `index.js` after loading `qiniu/sandbox.js`:

```js
var sandbox = require('./qiniu/sandbox.js');
exports.sandbox = sandbox;
exports.Sandbox = sandbox.Sandbox;
exports.SandboxClient = sandbox.SandboxClient;
exports.CommandExitError = sandbox.CommandExitError;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "E2B style top-level\\|create\\(template"`

Expected: both tests pass.

---

### Task 2: Typed Errors

**Files:**
- Modify: `qiniu/sandbox/errors.js`
- Modify: `qiniu/sandbox/index.js`
- Modify: `index.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add:

```js
it('exposes typed sandbox compatibility errors', function () {
  var err = new qiniu.sandbox.CommandExitError({
    command: 'false',
    exitCode: 1,
    stdout: 'out',
    stderr: 'err'
  });

  err.should.be.instanceOf(Error);
  err.name.should.equal('CommandExitError');
  err.exitCode.should.equal(1);
  err.stdout.should.equal('out');
  err.stderr.should.equal('err');

  new qiniu.sandbox.GitAuthError('bad credentials').name.should.equal('GitAuthError');
  new qiniu.sandbox.GitUpstreamError('missing upstream').name.should.equal('GitUpstreamError');
  new qiniu.sandbox.NotImplementedError('volume').name.should.equal('NotImplementedError');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "typed sandbox compatibility errors"`

Expected: fail because error classes are missing.

- [ ] **Step 3: Implement the minimal code**

Use a small base helper in `qiniu/sandbox/errors.js`:

```js
function defineError(name) {
  function TypedSandboxError(message, props) {
    Error.call(this);
    this.name = name;
    this.message = message || name;
    if (props) Object.assign(this, props);
    if (Error.captureStackTrace) Error.captureStackTrace(this, TypedSandboxError);
  }
  TypedSandboxError.prototype = Object.create(Error.prototype);
  TypedSandboxError.prototype.constructor = TypedSandboxError;
  return TypedSandboxError;
}

var SandboxError = defineError('SandboxError');
function CommandExitError(result) {
  SandboxError.call(this, 'Command exited with code ' + result.exitCode, result);
  this.name = 'CommandExitError';
}
CommandExitError.prototype = Object.create(SandboxError.prototype);
CommandExitError.prototype.constructor = CommandExitError;
```

Export `CommandExitError`, `TimeoutError`, `NotImplementedError`, `GitAuthError`, `GitUpstreamError`, and `TemplateBuildError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "typed sandbox compatibility errors"`

Expected: pass.

---

### Task 3: Command Compatibility

**Files:**
- Modify: `qiniu/sandbox/commands.js`
- Modify: `qiniu/sandbox/envd.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add:

```js
it('supports E2B command timeout aliases and optional exit throwing', function () {
  var calls = [];
  var sandbox = createFakeSandbox({
    rpc: function (service, method, body, opts) {
      calls.push({ service: service, method: method, body: body, opts: opts });
      return Promise.resolve({
        process: { pid: 123 },
        event: { end: { exitCode: 2 } },
        stdout: Buffer.from('out').toString('base64'),
        stderr: Buffer.from('err').toString('base64')
      });
    }
  });

  return sandbox.commands.run('false', {
    requestTimeoutMs: 12000,
    throwOnError: true
  }).then(function () {
    throw new Error('expected command to throw');
  }, function (err) {
    err.name.should.equal('CommandExitError');
    err.exitCode.should.equal(2);
    err.stdout.should.equal('out');
    err.stderr.should.equal('err');
    calls[0].opts.timeout.should.equal(12000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "command timeout aliases"`

Expected: fail because `requestTimeoutMs` and `throwOnError` semantics are missing.

- [ ] **Step 3: Implement the minimal code**

Normalize timeout options:

```js
function requestTimeout(opts) {
  return opts && (opts.requestTimeoutMs || opts.timeoutMs || opts.timeout);
}
```

After command completion:

```js
if (opts && opts.throwOnError && result.exitCode) {
  throw new CommandExitError(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "command timeout aliases"`

Expected: pass.

---

### Task 4: Filesystem Format Compatibility

**Files:**
- Modify: `qiniu/sandbox/filesystem.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add:

```js
it('reads files as text, bytes, blob, and stream formats', function () {
  var sandbox = createFakeSandbox({
    fileRead: function () {
      return Promise.resolve(Buffer.from('hello'));
    }
  });

  return sandbox.files.read('/tmp/a.txt').then(function (text) {
    text.should.equal('hello');
    return sandbox.files.read('/tmp/a.txt', { format: 'bytes' });
  }).then(function (bytes) {
    Buffer.isBuffer(bytes).should.equal(true);
    bytes.toString().should.equal('hello');
    return sandbox.files.read('/tmp/a.txt', { format: 'stream' });
  }).then(function (stream) {
    (typeof stream.pipe).should.equal('function');
    return sandbox.files.read('/tmp/a.txt', { format: 'blob' });
  }).then(function (blob) {
    if (typeof Blob !== 'undefined') {
      blob.should.be.instanceOf(Blob);
    } else {
      Buffer.isBuffer(blob).should.equal(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "reads files as text"`

Expected: fail because non-text formats are incomplete.

- [ ] **Step 3: Implement the minimal code**

Convert the existing file read buffer:

```js
var Readable = require('stream').Readable;

function formatReadResult(buffer, opts) {
  var format = opts && opts.format || 'text';
  if (format === 'bytes') return buffer;
  if (format === 'stream') return Readable.from([buffer]);
  if (format === 'blob' && typeof Blob !== 'undefined') return new Blob([buffer]);
  if (format === 'blob') return buffer;
  return buffer.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "reads files as text"`

Expected: pass.

---

### Task 5: Git Advanced Operations And Auth

**Files:**
- Modify: `qiniu/sandbox/git.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`
- Test: `test/sandbox_integration.test.js`

- [ ] **Step 1: Write the failing unit tests**

Add:

```js
it('supports E2B git auth, branches, reset, restore, and safe remote cleanup', function () {
  var commands = [];
  var sandbox = createFakeSandbox({
    run: function (cmd) {
      commands.push(cmd);
      if (cmd.indexOf('branch --format') >= 0) return Promise.resolve({ stdout: '* main\n  feature\n', exitCode: 0 });
      if (cmd.indexOf('remote get-url origin') >= 0) return Promise.resolve({ stdout: 'https://github.com/acme/repo.git\n', exitCode: 0 });
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
    }
  });

  return sandbox.git.clone('https://github.com/acme/repo.git', '/repo', {
    username: 'u',
    password: 'p',
    depth: 1,
    branch: 'main'
  }).then(function () {
    return sandbox.git.branches('/repo');
  }).then(function (branches) {
    branches.should.eql([{ name: 'main', current: true }, { name: 'feature', current: false }]);
    return sandbox.git.reset('/repo', { hard: true, ref: 'HEAD~1' });
  }).then(function () {
    return sandbox.git.restore('/repo', { staged: true, paths: ['a.txt'] });
  }).then(function () {
    commands.join('\n').should.containEql('clone --depth 1 --branch main');
    commands.join('\n').should.containEql('remote set-url origin https://github.com/acme/repo.git');
    commands.join('\n').should.containEql('reset --hard HEAD~1');
    commands.join('\n').should.containEql('restore --staged -- a.txt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "git auth, branches"`

Expected: fail because methods/options are missing or incomplete.

- [ ] **Step 3: Implement the minimal code**

Add helpers:

```js
function authedUrl(url, opts) {
  if (!opts || !opts.username || !opts.password) return url;
  return url.replace(/^https:\/\//, 'https://' + encodeURIComponent(opts.username) + ':' + encodeURIComponent(opts.password) + '@');
}

function stripAuth(url) {
  return url.replace(/^https:\/\/[^/@]+:[^/@]+@/, 'https://');
}
```

After clone/push/pull with credentials, restore `origin` to the stripped URL unless `dangerouslyStoreCredentials` is true.

Add `branches`, `reset`, `restore`, `dangerouslyAuthenticate`, `remoteAdd` overwrite/fetch options, `commit` author options, and config scopes using the current `_runGit()` path.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "git auth, branches"`

Expected: pass.

---

### Task 6: Template Builder Facade

**Files:**
- Create: `qiniu/sandbox/template.js`
- Modify: `qiniu/sandbox/client.js`
- Modify: `qiniu/sandbox/index.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add:

```js
it('builds templates through an E2B style Template facade', function () {
  var requests = [];
  var server = createSandboxApiServer(function (req) {
    requests.push(req);
    return { templateID: 'tpl_1', buildID: 'bld_1', status: 'building' };
  });

  return server.listenAsync().then(function () {
    var template = qiniu.sandbox.Template()
      .fromImage('ubuntu:22.04')
      .aptInstall(['git'])
      .runCmd('node --version')
      .setStartCmd('node server.js')
      .setReadyCmd('curl -f http://localhost:3000/health');

    return template.build({
      apiKey: 'test-key',
      apiUrl: server.url,
      name: 'node-template:test'
    });
  }).then(function (result) {
    result.templateID.should.equal('tpl_1');
    requests[0].body.name.should.equal('node-template:test');
    requests[0].body.cpuCount.should.be.undefined();
    requests[0].body.buildConfig.fromImage.should.equal('ubuntu:22.04');
    requests[0].body.buildConfig.steps[0].type.should.equal('apt');
    requests[0].body.buildConfig.steps[1].type.should.equal('run');
  }).finally(function () {
    return server.closeAsync();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "Template facade"`

Expected: fail because `Template` is missing.

- [ ] **Step 3: Implement the minimal code**

Create a chainable facade:

```js
function Template() {
  if (!(this instanceof Template)) return new Template();
  this.buildConfig = { steps: [] };
}
Template.prototype.fromImage = function (image) { this.buildConfig.fromImage = image; return this; };
Template.prototype.fromTemplate = function (templateID) { this.buildConfig.fromTemplate = templateID; return this; };
Template.prototype.aptInstall = function (packages) { this.buildConfig.steps.push({ type: 'apt', packages: packages }); return this; };
Template.prototype.runCmd = function (cmd) { this.buildConfig.steps.push({ type: 'run', cmd: cmd }); return this; };
Template.prototype.copy = function (src, dest) { this.buildConfig.steps.push({ type: 'copy', src: src, dest: dest }); return this; };
Template.prototype.setStartCmd = function (cmd) { this.buildConfig.startCmd = cmd; return this; };
Template.prototype.setReadyCmd = function (cmd) { this.buildConfig.readyCmd = cmd; return this; };
Template.prototype.build = function (opts) {
  var client = new SandboxClient(opts);
  return client.createTemplateV3(Object.assign({}, opts, { buildConfig: this.buildConfig }));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "Template facade"`

Expected: pass.

---

### Task 7: Network, Snapshot, MCP, And Unsupported Volume Compatibility

**Files:**
- Create: `qiniu/sandbox/network.js`
- Create: `qiniu/sandbox/volume.js`
- Modify: `qiniu/sandbox/sandbox.js`
- Modify: `qiniu/sandbox/client.js`
- Modify: `qiniu/sandbox/index.js`
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`

- [ ] **Step 1: Write the failing tests**

Add:

```js
it('exposes network constants and maps updateNetwork to Qiniu API', function () {
  var requests = [];
  var server = createSandboxApiServer(function (req) {
    requests.push(req);
    return { sandboxID: 'sbx-net', network: req.body.network };
  });

  return server.listenAsync().then(function () {
    var client = new qiniu.sandbox.SandboxClient({ apiKey: 'test-key', apiUrl: server.url });
    var sandbox = new qiniu.sandbox.Sandbox({ sandboxID: 'sbx-net' }, client);
    qiniu.sandbox.ALL_TRAFFIC.should.equal('0.0.0.0/0');
    return sandbox.updateNetwork({ allowOut: [qiniu.sandbox.ALL_TRAFFIC] });
  }).then(function () {
    requests[0].method.should.equal('PATCH');
    requests[0].url.should.containEql('/sandboxes/sbx-net');
    requests[0].body.network.allowOut[0].should.equal('0.0.0.0/0');
  }).finally(function () {
    return server.closeAsync();
  });
});

it('returns typed unsupported errors for E2B volume compatibility', function () {
  var volume = new qiniu.sandbox.Volume();
  return volume.create().then(function () {
    throw new Error('expected volume.create to fail');
  }, function (err) {
    err.name.should.equal('NotImplementedError');
    err.message.should.containEql('Volume');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "network constants\\|volume compatibility"`

Expected: fail because helpers are missing.

- [ ] **Step 3: Implement the minimal code**

Add:

```js
exports.ALL_TRAFFIC = '0.0.0.0/0';
```

Map `sandbox.updateNetwork(network)` to the existing sandbox update endpoint with body `{ network: network }`.

Create `Volume` with methods that reject:

```js
Volume.prototype.create = function () {
  return Promise.reject(new NotImplementedError('Volume is not supported by Qiniu Sandbox OpenAPI'));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "network constants\\|volume compatibility"`

Expected: pass.

---

### Task 8: Qiniu Extensions And Integration Gates

**Files:**
- Modify: `qiniu/sandbox/client.js`
- Modify: `qiniu/sandbox/sandbox.js`
- Modify: `index.d.ts`
- Modify: `test/sandbox_integration.test.js`

- [ ] **Step 1: Write the failing tests**

Add unit coverage for Qiniu-only sandbox creation body fields:

```js
it('keeps Qiniu sandbox extensions in create body', function () {
  var requests = [];
  var server = createSandboxApiServer(function (req) {
    requests.push(req);
    return { sandboxID: 'sbx-qiniu', templateID: 'base' };
  });

  return server.listenAsync().then(function () {
    return qiniu.sandbox.Sandbox.create({
      apiKey: 'test-key',
      apiUrl: server.url,
      mcp: { enabled: true },
      injections: [{ injectionRuleID: 'rule_1' }],
      resources: [{ type: 'github_repository', url: 'https://github.com/acme/repo' }]
    });
  }).then(function () {
    requests[0].body.mcp.enabled.should.equal(true);
    requests[0].body.injections[0].injectionRuleID.should.equal('rule_1');
    requests[0].body.resources[0].type.should.equal('github_repository');
  }).finally(function () {
    return server.closeAsync();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "Qiniu sandbox extensions"`

Expected: fail if any extension field is dropped.

- [ ] **Step 3: Implement the minimal code**

Extend the allowed create body field list in `SandboxClient.createSandbox()` to pass through `mcp`, `injections`, and `resources`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js --grep "Qiniu sandbox extensions"`

Expected: pass.

---

### Task 9: Type Declarations And Verification

**Files:**
- Modify: `index.d.ts`
- Test: `test/sandbox.test.js`
- Test: `test/sandbox_integration.test.js`

- [ ] **Step 1: Add declaration coverage through `npm run check-type`**

Update `index.d.ts` with:

```ts
export const Sandbox: typeof sandbox.Sandbox
export const SandboxClient: typeof sandbox.SandboxClient
export const CommandExitError: typeof sandbox.CommandExitError
```

Add overloads:

```ts
static create(opts?: SandboxCreateOptions): Promise<Sandbox>
static create(template: string, opts?: SandboxCreateOptions): Promise<Sandbox>
```

Declare `Template`, `Volume`, `ALL_TRAFFIC`, command `requestTimeoutMs`, file read formats, and Git methods from Tasks 3-7.

- [ ] **Step 2: Run full unit tests**

Run: `./node_modules/.bin/mocha -t 300000 test/sandbox.test.js`

Expected: all sandbox unit tests pass.

- [ ] **Step 3: Run type check**

Run: `npm run check-type`

Expected: pass.

- [ ] **Step 4: Run focused lint**

Run: `./node_modules/.bin/eslint qiniu/sandbox test/sandbox.test.js test/sandbox_integration.test.js`

Expected: pass.

- [ ] **Step 5: Run optional integration**

Run: `./node_modules/.bin/mocha -t 600000 test/sandbox_integration.test.js`

Expected: real integration passes when `.env` has `QINIU_SANDBOX_INTEGRATION=true`, `QINIU_SANDBOX_API_KEY`, and optional `GIT_REPO_URL`, `GIT_USERNAME`, `GIT_PASSWORD`; injection rule test remains pending unless `QINIU_SANDBOX_TEST_INJECTION_RULES=true` and AK/SK are present.

---

## Self-Review

- Spec coverage: The plan covers E2B-style Sandbox entry points, command behavior, filesystem read formats, Git operations/auth, template builder, network update, unsupported Volume handling, Qiniu injection/resource extensions, TypeScript declarations, and integration gates.
- Backend reality check: E2B persistent Volume is not present in the Qiniu public OpenAPI observed during planning, so the compatibility surface returns `NotImplementedError` instead of pretending a server-backed Volume exists.
- Placeholder scan: The plan avoids deferred TODOs and gives each task explicit test snippets, implementation shape, and verification commands.
- Type consistency: Method names match the current `qiniu.sandbox` namespace and proposed E2B-compatible aliases.
