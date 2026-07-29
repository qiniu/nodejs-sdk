/**
 * 幂等重试示例：同一幂等键连续两次 Create，验证返回同一沙箱。
 */
const qiniu = require('../');

const apiKey = process.env.QINIU_SANDBOX_API_KEY;
if (!apiKey) {
    console.error('请设置 QINIU_SANDBOX_API_KEY 环境变量');
    process.exit(1);
}

const idempotencyKey = `sdk-example-${Math.floor(Date.now() / 1000)}`;
console.log('幂等键:', idempotencyKey);

const createOpts = {
    templateID: 'base',
    timeout: 300,
    endpoint: process.env.QINIU_SANDBOX_ENDPOINT,
    apiKey
};

Promise.all([
    qiniu.Sandbox.create(Object.assign({}, createOpts, { idempotencyKey })),
    qiniu.Sandbox.create(Object.assign({}, createOpts, { idempotencyKey }))
]).then(([sb1, sb2]) => {
    console.log('第一次创建:', sb1.sandboxId);
    console.log('第二次创建:', sb2.sandboxId);

    const sameSandbox = sb1.sandboxId === sb2.sandboxId;
    if (sameSandbox) {
        console.log('\n幂等重试验证通过：两次创建返回同一沙箱');
    } else {
        console.log('\nWARNING: 两次创建返回不同沙箱');
    }

    const cleanup = sameSandbox
        ? sb1.kill()
        : Promise.all([sb1.kill(), sb2.kill()]);
    return cleanup.then(() => {
        console.log('沙箱已清理');
    });
}).catch(err => {
    console.error('失败:', err.message);
    process.exit(1);
});
