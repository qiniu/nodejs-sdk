const http = require('http');
const https = require('https');

const { HttpClient } = require('../httpc/client');
const { QiniuAuthMiddleware } = require('../httpc/middleware/qiniuAuth');
const digest = require('../auth/digest');
const { DEFAULT_TEMPLATE } = require('./constants');
const { SandboxError } = require('./errors');
const {
    appendQuery,
    copyDefined,
    encodePath,
    normalizeEndpoint,
    poll,
    timeoutSecondsFromOptions
} = require('./util');

function normalizeSandboxCreateOptions (opts) {
    opts = opts || {};
    const body = {};
    body.templateID = opts.templateID || opts.template || DEFAULT_TEMPLATE;

    const timeout = timeoutSecondsFromOptions(opts);
    if (timeout !== undefined) {
        body.timeout = timeout;
    }

    copyDefined(body, opts, 'autoPause');
    copyDefined(body, opts, 'secure');
    copyDefined(body, opts, 'allow_internet_access');
    copyDefined(body, opts, 'allowInternetAccess', 'allow_internet_access');
    copyDefined(body, opts, 'network');
    copyDefined(body, opts, 'metadata');
    copyDefined(body, opts, 'envVars');
    copyDefined(body, opts, 'envs', 'envVars');
    copyDefined(body, opts, 'mcp');
    copyDefined(body, opts, 'injections');
    copyDefined(body, opts, 'resources');

    return body;
}

function hasKodoResource (body) {
    return Array.isArray(body.resources) && body.resources.some(resource => {
        return resource && resource.type === 'kodo';
    });
}

function normalizeInjection (injection) {
    if (!injection || typeof injection !== 'object' || Array.isArray(injection)) {
        return injection;
    }

    const normalized = Object.assign({}, injection);
    if (normalized.apiKey !== undefined && normalized.api_key === undefined) {
        normalized.api_key = normalized.apiKey;
        delete normalized.apiKey;
    }
    if (normalized.baseUrl !== undefined && normalized.base_url === undefined) {
        normalized.base_url = normalized.baseUrl;
        delete normalized.baseUrl;
    }
    if (normalized.ruleId !== undefined && normalized.ruleID === undefined) {
        normalized.ruleID = normalized.ruleId;
        delete normalized.ruleId;
    }
    return normalized;
}

function normalizeInjectionRuleOptions (opts) {
    opts = Object.assign({}, opts || {});
    if (opts.injection) {
        opts.injection = normalizeInjection(opts.injection);
    }
    return opts;
}

function normalizeClientOptions (opts) {
    opts = opts || {};
    const mac = opts.mac || (opts.accessKey || opts.secretKey
        ? new digest.Mac(opts.accessKey, opts.secretKey, opts.macOptions)
        : null);

    return {
        endpoint: normalizeEndpoint(opts.endpoint || opts.apiUrl),
        apiKey: opts.apiKey || process.env.QINIU_SANDBOX_API_KEY,
        accessToken: opts.accessToken || process.env.QINIU_SANDBOX_ACCESS_TOKEN,
        mac,
        httpAgent: opts.httpAgent || http.globalAgent,
        httpsAgent: opts.httpsAgent || https.globalAgent,
        timeout: opts.timeout
    };
}

function SandboxClient (opts) {
    const normalized = normalizeClientOptions(opts);
    this.endpoint = normalized.endpoint;
    this.apiKey = normalized.apiKey;
    this.accessToken = normalized.accessToken;
    this.mac = normalized.mac;
    this.httpClient = new HttpClient({
        httpAgent: normalized.httpAgent,
        httpsAgent: normalized.httpsAgent,
        timeout: normalized.timeout
    });
}

SandboxClient.prototype._headers = function (authType) {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (authType === 'accessToken') {
        if (this.accessToken) {
            headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return headers;
    }

    if (authType === 'qiniu') {
        return headers;
    }

    if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
        headers.Authorization = `Bearer ${this.apiKey}`;
    } else if (this.accessToken) {
        headers.Authorization = `Bearer ${this.accessToken}`;
    }

    return headers;
};

SandboxClient.prototype._middlewares = function (authType) {
    if (authType === 'qiniu' || (!this.apiKey && !this.accessToken && this.mac)) {
        return [new QiniuAuthMiddleware({ mac: this.mac })];
    }
    return [];
};

SandboxClient.prototype._request = function (method, path, options) {
    options = options || {};
    const body = options.body;
    const hasBody = body !== undefined && body !== null;
    const headers = this._headers(options.authType);
    const urllibOptions = {
        method,
        headers,
        dataType: 'json',
        gzip: true,
        followRedirect: true
    };

    if (hasBody) {
        urllibOptions.content = JSON.stringify(body);
        urllibOptions.contentType = 'application/json';
    } else {
        urllibOptions.contentType = urllibOptions.headers['Content-Type'];
        urllibOptions.headers['Content-Length'] = '0';
    }

    return this.httpClient.sendRequest({
        url: this.endpoint + path,
        middlewares: this._middlewares(options.authType),
        urllibOptions
    }).then(wrapper => this._handleResponse(wrapper, options.empty));
};

SandboxClient.prototype._handleResponse = function (wrapper, empty) {
    if (wrapper.ok()) {
        return empty ? null : wrapper.data;
    }

    const statusCode = wrapper.resp && wrapper.resp.statusCode;
    let message = `Sandbox API request failed with status ${statusCode}`;
    const data = wrapper.data;
    if (data && data.message) {
        message += `: ${data.message}`;
    } else if (typeof data === 'string' && data) {
        message += `: ${data}`;
    }
    throw new SandboxError(message, wrapper.resp, data);
};

SandboxClient.prototype.listSandboxes = function (opts) {
    return this._request('GET', appendQuery('/sandboxes', opts));
};

SandboxClient.prototype.listSandboxesV2 = function (opts) {
    return this._request('GET', appendQuery('/v2/sandboxes', opts));
};

SandboxClient.prototype.createSandbox = function (opts) {
    const body = normalizeSandboxCreateOptions(opts);
    return this._request('POST', '/sandboxes', {
        authType: hasKodoResource(body) && this.mac ? 'qiniu' : undefined,
        body
    });
};

SandboxClient.prototype.getSandboxesMetrics = function (sandboxIDs) {
    const ids = Array.isArray(sandboxIDs) ? sandboxIDs : sandboxIDs.sandbox_ids || sandboxIDs.sandboxIDs;
    return this._request('GET', appendQuery('/sandboxes/metrics', { sandbox_ids: ids }));
};

SandboxClient.prototype.getSandboxLogs = function (sandboxID, opts) {
    return this._request('GET', appendQuery(`/sandboxes/${encodePath(sandboxID)}/logs`, opts));
};

SandboxClient.prototype.getSandbox = function (sandboxID) {
    return this._request('GET', `/sandboxes/${encodePath(sandboxID)}`);
};

SandboxClient.prototype.deleteSandbox = function (sandboxID) {
    return this._request('DELETE', `/sandboxes/${encodePath(sandboxID)}`, { empty: true });
};

SandboxClient.prototype.killSandbox = SandboxClient.prototype.deleteSandbox;

SandboxClient.prototype.pauseSandbox = function (sandboxID) {
    return this._request('POST', `/sandboxes/${encodePath(sandboxID)}/pause`, { empty: true });
};

SandboxClient.prototype.resumeSandbox = function (sandboxID, opts) {
    return this._request('POST', `/sandboxes/${encodePath(sandboxID)}/resume`, { body: opts || {} });
};

SandboxClient.prototype.connectSandbox = function (sandboxID, opts) {
    const timeout = timeoutSecondsFromOptions(opts);
    return this._request('POST', `/sandboxes/${encodePath(sandboxID)}/connect`, {
        body: {
            timeout: timeout === undefined ? 15 : timeout
        }
    });
};

SandboxClient.prototype.updateSandboxTimeout = function (sandboxID, timeoutOrOpts) {
    const timeout = typeof timeoutOrOpts === 'number' ? timeoutOrOpts : timeoutSecondsFromOptions(timeoutOrOpts);
    return this._request('POST', `/sandboxes/${encodePath(sandboxID)}/timeout`, {
        body: { timeout },
        empty: true
    });
};

SandboxClient.prototype.refreshSandbox = function (sandboxID, opts) {
    return this._request('POST', `/sandboxes/${encodePath(sandboxID)}/refreshes`, {
        body: opts || {},
        empty: true
    });
};

SandboxClient.prototype.updateSandbox = function (sandboxID, opts) {
    return this._request('PATCH', `/sandboxes/${encodePath(sandboxID)}`, {
        body: opts || {}
    });
};

SandboxClient.prototype.getSandboxMetrics = function (sandboxID, opts) {
    return this._request('GET', appendQuery(`/sandboxes/${encodePath(sandboxID)}/metrics`, opts));
};

SandboxClient.prototype.createTemplate = function (opts) {
    return this._request('POST', '/v3/templates', { body: opts || {} });
};

SandboxClient.prototype.createTemplateV3 = SandboxClient.prototype.createTemplate;

SandboxClient.prototype.createTemplateV2 = function (opts) {
    return this._request('POST', '/v2/templates', { body: opts || {} });
};

SandboxClient.prototype.getTemplateFiles = function (templateID, hash) {
    return this._request('GET', `/templates/${encodePath(templateID)}/files/${encodePath(hash)}`);
};

SandboxClient.prototype.listDefaultTemplates = function () {
    return this._request('GET', '/default-templates');
};

SandboxClient.prototype.listTemplates = function (opts) {
    return this._request('GET', appendQuery('/templates', opts));
};

SandboxClient.prototype.getTemplate = function (templateID, opts) {
    return this._request('GET', appendQuery(`/templates/${encodePath(templateID)}`, opts));
};

SandboxClient.prototype.deleteTemplate = function (templateID) {
    return this._request('DELETE', `/templates/${encodePath(templateID)}`, { empty: true });
};

SandboxClient.prototype.updateTemplate = function (templateID, opts) {
    return this._request('PATCH', `/templates/${encodePath(templateID)}`, { body: opts || {} });
};

SandboxClient.prototype.startTemplateBuildV2 = function (templateID, buildID, opts) {
    return this._request('POST', `/v2/templates/${encodePath(templateID)}/builds/${encodePath(buildID)}`, {
        body: opts || {},
        empty: true
    });
};

SandboxClient.prototype.getTemplateBuildStatus = function (templateID, buildID, opts) {
    return this._request('GET', appendQuery(`/templates/${encodePath(templateID)}/builds/${encodePath(buildID)}/status`, opts));
};

SandboxClient.prototype.getTemplateBuildLogs = function (templateID, buildID, opts) {
    return this._request('GET', appendQuery(`/templates/${encodePath(templateID)}/builds/${encodePath(buildID)}/logs`, opts));
};

SandboxClient.prototype.assignTemplateTags = function (opts) {
    return this._request('POST', '/templates/tags', { body: opts || {} });
};

SandboxClient.prototype.deleteTemplateTags = function (opts) {
    return this._request('DELETE', '/templates/tags', {
        body: opts || {},
        empty: true
    });
};

SandboxClient.prototype.getTemplateByAlias = function (alias) {
    return this._request('GET', `/templates/aliases/${encodePath(alias)}`);
};

SandboxClient.prototype.listInjectionRules = function () {
    return this._request('GET', '/injection-rules', { authType: 'qiniu' });
};

SandboxClient.prototype.createInjectionRule = function (opts) {
    return this._request('POST', '/injection-rules', {
        authType: 'qiniu',
        body: normalizeInjectionRuleOptions(opts)
    });
};

SandboxClient.prototype.getInjectionRule = function (ruleID) {
    return this._request('GET', `/injection-rules/${encodePath(ruleID)}`, { authType: 'qiniu' });
};

SandboxClient.prototype.updateInjectionRule = function (ruleID, opts) {
    return this._request('PUT', `/injection-rules/${encodePath(ruleID)}`, {
        authType: 'qiniu',
        body: normalizeInjectionRuleOptions(opts)
    });
};

SandboxClient.prototype.deleteInjectionRule = function (ruleID) {
    return this._request('DELETE', `/injection-rules/${encodePath(ruleID)}`, {
        authType: 'qiniu',
        empty: true
    });
};

SandboxClient.prototype.create = SandboxClient.prototype.createSandbox;
SandboxClient.prototype.connect = SandboxClient.prototype.connectSandbox;
SandboxClient.prototype.list = SandboxClient.prototype.listSandboxesV2;
SandboxClient.prototype.kill = SandboxClient.prototype.deleteSandbox;
SandboxClient.prototype.setTimeout = SandboxClient.prototype.updateSandboxTimeout;
SandboxClient.prototype.getInfo = SandboxClient.prototype.getSandbox;
SandboxClient.prototype.getMetrics = SandboxClient.prototype.getSandboxMetrics;
SandboxClient.prototype.getLogs = SandboxClient.prototype.getSandboxLogs;

SandboxClient.prototype.createAndWait = function (opts, pollOpts) {
    return this.createSandbox(opts).then(info => {
        const Sandbox = require('./sandbox').Sandbox;
        const sb = new Sandbox({ client: this, info });
        return sb.waitForReady(pollOpts).then(() => sb);
    });
};

SandboxClient.prototype.waitForBuild = function (templateID, buildID, opts) {
    return poll(() => this.getTemplateBuildStatus(templateID, buildID), opts, info => {
        return info && (info.status === 'ready' || info.status === 'error');
    });
};

SandboxClient.prototype.rebuildTemplate = function (templateID, opts) {
    return this._request('POST', `/templates/${encodePath(templateID)}`, {
        authType: 'accessToken',
        body: opts || {}
    });
};

SandboxClient.prototype.startTemplateBuild = SandboxClient.prototype.startTemplateBuildV2;

exports.SandboxClient = SandboxClient;
