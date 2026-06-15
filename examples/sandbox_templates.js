const {
    qiniu,
    env,
    sandboxClient,
    sandboxTemplate,
    runExample
} = require('./sandbox_common');

runExample(() => {
    const client = sandboxClient({
        accessToken: env('QINIU_SANDBOX_ACCESS_TOKEN')
    });
    const templateName = `nodejs-sdk-example-${Date.now()}`;
    let templateID;
    let buildID;

    return client.listDefaultTemplates().then(defaultTemplates => {
        console.log('Default templates:', Array.isArray(defaultTemplates) ? defaultTemplates.length : defaultTemplates);
        return client.listTemplates({ limit: 10 });
    }).then(templates => {
        console.log('Templates:', Array.isArray(templates) ? templates.map(item => item.templateID || item.template_id || item.name) : templates);
        const first = Array.isArray(templates) && templates[0];
        if (!first) {
            return null;
        }
        const id = first.templateID || first.template_id || first.id || sandboxTemplate();
        return client.getTemplate(id).then(detail => {
            console.log('First template detail:', detail.templateID || detail.template_id || id);
        });
    }).then(() => {
        return qiniu.sandbox.Template()
            .fromImage('ubuntu:22.04')
            .aptInstall(['curl', 'git'])
            .runCmd('echo "hello from template build"')
            .setReadyCmd('echo ready')
            .build({
                client,
                name: templateName,
                tags: ['nodejs-sdk-example']
            });
    }).then(result => {
        templateID = result.templateID || result.template_id || result.id;
        buildID = result.buildID || result.build_id;
        console.log('Template created:', templateID, 'build:', buildID);
        if (!templateID || !buildID) {
            return null;
        }
        return client.getTemplateBuildStatus(templateID, buildID)
            .then(status => {
                console.log('Build status:', status.status || status);
                return client.getTemplateBuildLogs(templateID, buildID, { limit: 5 });
            })
            .then(logs => {
                console.log('Build logs:', logs.logs || logs);
                return client.assignTemplateTags({
                    target: `${templateName}:v1`,
                    tags: ['latest']
                });
            })
            .then(tags => {
                console.log('Assigned tags:', tags);
                return client.deleteTemplateTags({
                    name: templateName,
                    tags: ['latest']
                });
            })
            .then(() => {
                return client.getTemplateFiles(templateID, 'example-hash');
            })
            .then(fileInfo => {
                console.log('Template file info:', fileInfo);
            }, err => {
                console.log('Template file lookup skipped:', err.message);
            });
    }).then(() => {
        if (!templateID) {
            return null;
        }
        return client.deleteTemplate(templateID).then(() => {
            console.log('Template deleted:', templateID);
        }, err => {
            console.log('Failed to delete template:', templateID, err.message);
        });
    });
});
