const {
    env,
    createSandboxAndWait,
    cleanupSandbox,
    runExample
} = require('./sandbox_common');

runExample(() => {
    let sandbox;

    return createSandboxAndWait({
        injections: [
            {
                type: 'http',
                base_url: 'https://httpbin.org',
                headers: {
                    Authorization: `Bearer ${env('QINIU_SANDBOX_HTTP_INJECTION_TOKEN', 'real_token')}`
                }
            }
        ],
        metadata: {
            example: 'sandbox_request_injections'
        }
    }).then(created => {
        sandbox = created;
        return sandbox.commands.run('curl --max-time 20 -sSL https://httpbin.org/bearer -H "Authorization: Bearer fake_token"', {
            timeout: 30000
        });
    }).then(result => {
        console.log('HTTP injection curl exit:', result.exitCode);
        console.log(result.stdout);
        if (!env('QINIU_SANDBOX_OPENAI_API_KEY')) {
            console.log('Skip OpenAI-compatible injection: set QINIU_SANDBOX_OPENAI_API_KEY to try it.');
            return null;
        }
        return cleanupSandbox(sandbox).then(() => {
            return createSandboxAndWait({
                injections: [
                    {
                        type: 'openai',
                        api_key: env('QINIU_SANDBOX_OPENAI_API_KEY')
                    }
                ],
                metadata: {
                    example: 'sandbox_openai_injection'
                }
            });
        }).then(created => {
            sandbox = created;
            return sandbox.commands.run('python3 - <<\'PY\'\nimport os\nprint("OpenAI-compatible request injection is configured outside the sandbox")\nPY');
        }).then(openaiResult => {
            console.log(openaiResult.stdout);
        });
    }).then(() => {
        return cleanupSandbox(sandbox);
    }, err => {
        return cleanupSandbox(sandbox).then(() => {
            throw err;
        });
    });
});
