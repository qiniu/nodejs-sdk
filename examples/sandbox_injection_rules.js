const {
    qiniu,
    env,
    sandboxEndpoint,
    sandboxApiKey,
    sandboxMac,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    const client = new qiniu.sandbox.SandboxClient({
        endpoint: sandboxEndpoint(),
        apiKey: sandboxApiKey(),
        mac: sandboxMac()
    });
    const ruleName = `nodejs-sdk-example-${Date.now()}`;
    let ruleID;
    let sandbox;

    return client.createInjectionRule({
        name: ruleName,
        injection: {
            type: 'http',
            baseUrl: 'https://httpbin.org',
            headers: {
                Authorization: `Bearer ${env('QINIU_SANDBOX_HTTP_INJECTION_TOKEN', 'real_token')}`
            }
        }
    }).then(rule => {
        ruleID = rule.id || rule.ruleID || rule.rule_id;
        console.log('Injection rule created:', ruleID);
        return client.getInjectionRule(ruleID);
    }).then(rule => {
        console.log('Injection rule detail:', rule.name || rule);
        return client.updateInjectionRule(ruleID, {
            name: `${ruleName}-updated`,
            injection: {
                type: 'http',
                baseUrl: 'https://httpbin.org',
                headers: {
                    Authorization: `Bearer ${env('QINIU_SANDBOX_HTTP_INJECTION_TOKEN', 'updated_token')}`,
                    'X-Sandbox-Example': 'qiniu-nodejs-sdk'
                }
            }
        });
    }).then(updated => {
        console.log('Injection rule updated:', updated.name || updated);
        return client.listInjectionRules();
    }).then(rules => {
        console.log('Injection rules:', Array.isArray(rules) ? rules.length : rules);
        return createSandboxAndWait({
            client,
            injections: [
                {
                    type: 'id',
                    id: ruleID
                }
            ],
            metadata: {
                example: 'sandbox_injection_rules'
            }
        });
    }).then(created => {
        sandbox = created;
        return sandbox.commands.run('curl --max-time 20 -sSL https://httpbin.org/bearer -H "Authorization: Bearer fake_token"', {
            timeout: 30000
        });
    }).then(result => {
        console.log('curl exit:', result.exitCode);
        console.log(result.stdout);
        return cleanupSandbox(sandbox);
    }).then(() => {
        return client.deleteInjectionRule(ruleID);
    }).then(() => {
        console.log('Injection rule deleted:', ruleID);
    }, err => {
        return cleanupSandbox(sandbox)
            .then(() => ruleID ? client.deleteInjectionRule(ruleID).catch(() => null) : null)
            .then(() => {
                throw err;
            });
    });
});
