# Qiniu Cloud SDK for Node.js

[![@qiniu on weibo](http://img.shields.io/badge/weibo-%40qiniutek-blue.svg)](http://weibo.com/qiniutek)
[![Software License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE.md)
[![NodeJS CI](https://github.com/qiniu/nodejs-sdk/actions/workflows/ci-test.yml/badge.svg?branch=master)](https://github.com/qiniu/nodejs-sdk/actions/workflows/ci-test.yml)
[![GitHub release](https://img.shields.io/github/v/tag/qiniu/nodejs-sdk.svg?label=release)](https://github.com/qiniu/nodejs-sdk/releases)
[![Code Climate](https://codeclimate.com/github/qiniu/nodejs-sdk.svg)](https://codeclimate.com/github/qiniu/nodejs-sdk)
[![Coverage Status](https://codecov.io/gh/qiniu/nodejs-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/qiniu/nodejs-sdk)
[![Latest Stable Version](https://img.shields.io/npm/v/qiniu.svg)](https://www.npmjs.com/package/qiniu)

## 下载

### 从 npm 安装

这是我们建议的方式

```bash
$ npm install qiniu
```

### 从 release 版本下载

下载地址：[https://github.com/qiniu/nodejs-sdk/releases](https://github.com/qiniu/nodejs-sdk/releases)

这里可以下载到旧版本的SDK，release 版本有版本号，有 [CHANGELOG](https://github.com/qiniu/nodejs-sdk/blob/master/CHANGELOG.md)，使用规格也会比较稳定。

### 从 git 库下载

你可以直接用 git clone 下载源代码来使用。但是请注意非 master 分支的代码可能会变更，应谨慎使用。

## 使用

参考文档：[七牛云存储 Node.js SDK 使用指南](http://developer.qiniu.com/kodo/sdk/nodejs)

Sandbox SDK 的连接、暂停、快照、模板、资源和 Desktop 桌面操作用法见 [Sandbox 使用指南](docs/sandbox.md)。

## 测试
```
$ cd ./test/
$ source test-env.sh
$ mocha --grep 'bucketinfo'
```

## 贡献代码

1. Fork
2. 创建您的特性分支 (`git checkout -b my-new-feature`)
3. 提交您的改动 (`git commit -am 'Added some feature'`)
4. 将您的修改记录提交到远程 `git` 仓库 (`git push origin my-new-feature`)
5. 然后到 github 网站的该 `git` 远程仓库的 `my-new-feature` 分支下发起 Pull Request

## 维护者发布 npm 包

在 GitHub 仓库设置中创建 `npm` Environment，将部署分支限制为 `master`，部署标签限制为 `v*`。配置发布审核人，并用标签规则集限制版本标签的创建、修改和删除。

在 npm 的 `qiniu` 包设置中配置 GitHub Actions Trusted Publisher。组织填 `qiniu`，仓库填 `nodejs-sdk`，工作流文件填 `npm-publish.yml`，Environment 填 `npm`，允许执行 `npm publish`。

正式 GitHub Release 会触发自动发布并生成来源证明（provenance），包括使用正式版本标签、从预发布转为正式发布的 Release。工作流只接受与包版本一致的 `vX.Y.Z` 标签。目标版本已存在或低于 npm 的 `latest` 时，工作流会拒绝发布。自动发布和手动补发都适用此规则。

如需补发已发布的正式 GitHub Release，从 `master` 手动触发工作流。工作流在检出源码前确认标签对应的 Release 已发布，且已标记为正式版。执行记录会提示该次发布未生成 provenance，因为触发工作流的提交与打包标签来源不同。

```bash
gh workflow run npm-publish.yml --repo qiniu/nodejs-sdk --ref master -f tag=v8.0.0
```

## 许可证

Copyright (c) 2015 qiniu.com

基于 MIT 协议发布:

* [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)
