/**
 * typescript definition for qiniu 7.0.2
 * @date 2017-06-27
 * @author xialeistudio<xialeistudio@gmail.com>
 */
import { Callback, RequestOptions } from 'urllib';
import { Agent as HttpAgent, IncomingMessage} from 'http';
import { Agent as HttpsAgent } from 'https';
import { Readable } from "stream";

export declare type callback = (e?: Error, respBody?: any, respInfo?: any) => void;

export declare namespace auth {
    namespace digest {
        interface MacOptions {
            disableQiniuTimestampSignature?: boolean;
        }

        class Mac {
            accessKey: string;
            secretKey: string;

            constructor(accessKey?: string, secretKey?: string, options?: MacOptions);
        }
    }
}

export declare namespace cdn {
    class CdnManager {
        mac: auth.digest.Mac;

        constructor(mac?: auth.digest.Mac);

        /**
         * 获取域名日志下载链接
         * @see http://developer.qiniu.com/article/fusion/api/log.html
         *
         * @param domains 域名列表  如：['obbid7qc6.qnssl.com','7xkh68.com1.z0.glb.clouddn.com']
         * @param logDay logDay 如 2016-07-01
         * @param callback  callbackFunc(err, respBody, respInfo)
         */
        getCdnLogList(domains: string[], logDay: string, callback: callback): void;

        /**
         * 获取域名访问流量数据
         * @see http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html#batch-flux
         *
         * @param startDate 开始日期，例如：2016-07-01
         * @param endDate 结束日期，例如：2016-07-03
         * @param granularity 粒度，取值：5min／hour／day
         * @param domains  域名列表 domain = ['obbid7qc6.qnssl.com','obbid7qc6.qnssl.com'];
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        getFluxData(startDate: string, endDate: string, granularity: string, domains: string[], callback: callback): void;

        /**
         * 获取域名带宽数据
         * @see http://developer.qiniu.com/article/fusion/api/traffic-bandwidth.html#batch-flux
         * @param startDate 开始日期，例如：2016-07-01
         * @param endDate 结束日期，例如：2016-07-03
         * @param granularity 粒度，取值：5min／hour／day
         * @param domains  域名列表 domain = ['obbid7qc6.qnssl.com','obbid7qc6.qnssl.com'];
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        getBandwidthData(startDate: string, endDate: string, granularity: string, domains: string[], callback: callback): void;

        /**
         * 预取文件链接
         * @see http://developer.qiniu.com/article/fusion/api/prefetch.html
         *
         * @param urls 预取urls  urls = ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        prefetchUrls(urls: string[], callback: callback): void;

        /**
         * 刷新链接
         * @see http://developer.qiniu.com/article/fusion/api/refresh.html
         *
         * @param urls refreshUrls =  ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        refreshUrls(urls: string[], callback: callback): void;

        /**
         * 刷新目录列表，每次最多不可以超过10个目录, 刷新目录需要额外开通权限，可以联系七牛技术支持处理
         * @see http://developer.qiniu.com/article/fusion/api/refresh.html
         *
         * @param dirs refreshDirs =  ['http://obbid7qc6.qnssl.com/wo/','http://obbid7qc6.qnssl.com/']
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        refreshDirs(dirs: string[], callback: callback): void;

        /**
         * 刷新目录和链接
         * @param urls refreshUrls =  ['http://obbid7qc6.qnssl.com/023','http://obbid7qc6.qnssl.com/025']
         * @param dirs refreshDirs =  ['http://obbid7qc6.qnssl.com/wo/','http://obbid7qc6.qnssl.com/']
         * @param callback callbackFunc(err, respBody, respInfo)
         */
        refreshUrlsAndDirs(urls: string[], dirs: string[], callback: callback): void;

        /**
         * 构建标准的基于时间戳的防盗链
         * @param domain  自定义域名，例如 http://img.abc.com
         * @param fileName 待访问的原始文件名，必须是utf8编码，不需要进行urlencode
         * @param query  业务自身的查询参数，必须是utf8编码，不需要进行urlencode, 例如 {aa:"23", attname:"11111111111111"}
         * @param encryptKey 时间戳防盗链的签名密钥，从七牛后台获取
         * @param deadline 链接的有效期时间戳，是以秒为单位的Unix时间戳
         * @return signedUrl  最终的带时间戳防盗链的url
         */
        createTimestampAntiLeechUrl(domain: string, fileName: string, query: any, encryptKey: string, deadline: number): string;
    }
}

export declare namespace conf {
    let ACCESS_KEY: string;
    let SECRET_KEY: string;
    let USER_AGENT: string;
    let BLOCK_SIZE: number;
    let FormMimeUrl: string;
    let FormMimeJson: string;
    let FormMimeRaw: string;
    let RS_HOST: string;
    let RPC_TIMEOUT: number;

    interface ConfigOptions {
        /**
         * @default false
         */
        useHttpsDomain?: boolean;

        /**
         * @default true
         */
        useCdnDomain?: boolean;

        /**
         * @default null
         */
        zone?: Zone,

        /**
         * @default -1
         */
        zoneExpire?: number;

        /**
         * @default null
         */
        regionsProvider?: httpc.RegionsProvider;
    }
    class Config implements ConfigOptions {
        constructor(options?: ConfigOptions);
    }

    class Zone {
        srcUpHosts: any;
        cdnUpHosts: any;
        ioHost: string;
        rsHost: string;
        rsfHost: string;
        apiHost: string;

        constructor(srcUpHosts?: any, cdnUpHosts?: any, ioHost?: string, rsHost?: string, rsfHost?: string, apiHost?: string);
    }
}

export declare namespace form_up {
    type UploadResult = {
        data: any;
        resp: IncomingMessage;
    }

    class FormUploader {
        conf: conf.Config;

        constructor(config?: conf.Config);

        /**
         *
         * @param uploadToken
         * @param key
         * @param fsStream
         * @param putExtra
         * @param callback
         */
        putStream(
            uploadToken: string,
            key: string | null,
            fsStream: NodeJS.ReadableStream,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         *
         * @param uploadToken
         * @param key
         * @param body
         * @param putExtra
         * @param callback
         */
        put(
            uploadToken: string,
            key: string | null,
            body: any,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         *
         * @param uploadToken
         * @param body
         * @param putExtra
         * @param callback
         */
        putWithoutKey(
            uploadToken: string,
            body: any,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         * 上传本地文件
         * @param uploadToken 上传凭证
         * @param key 目标文件名
         * @param localFile 本地文件路径
         * @param putExtra 额外选项
         * @param callback
         */
        putFile(
            uploadToken: string,
            key: string | null,
            localFile: string,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         *
         * @param uploadToken
         * @param localFile
         * @param putExtra
         * @param callback
         */
        putFileWithoutKey(
            uploadToken: string,
            localFile: string,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;
    }

    class PutExtra {
        /**
         * @default ''
         */
        fname: string;

        /**
         * @default {}
         */
        params: Record<string, string>;

        /**
         * @default null
         */
        mimeType?: string;

        /**
         * @default null
         */
        crc32?: string;

        /**
         * @default 0|false
         */
        checkCrc?: number | boolean;

        /**
         * @default {}
         */
        metadata?: Record<string, string>;

        /**
         * 上传可选参数
         * @param fname 请求体中的文件的名称
         * @param params 额外参数设置，参数名称必须以x:开头
         * @param mimeType 指定文件的mimeType
         * @param crc32 指定文件的crc32值
         * @param checkCrc 指定是否检测文件的crc32值
         * @param metadata 元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
         */
        constructor(fname?: string, params?: Record<string, string>, mimeType?: string, crc32?: string, checkCrc?: number | boolean, metadata?: Record<string, string>);
    }
}

export declare namespace resume_up {
    type UploadResult = {
        data: any;
        resp: IncomingMessage;
    }

    class ResumeUploader {
        config: conf.Config;

        constructor(config?: conf.Config);

        /**
         *
         * @param uploadToken
         * @param key
         * @param rsStream
         * @param rsStreamLen
         * @param putExtra
         * @param callback
         */
        putStream(
            uploadToken: string,
            key: string | null,
            rsStream: NodeJS.ReadableStream,
            rsStreamLen: number,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         *
         * @param uploadToken
         * @param key
         * @param localFile
         * @param putExtra
         * @param callback
         */
        putFile(
            uploadToken: string,
            key: string | null,
            localFile: string,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;

        /**
         *
         * @param uploadToken
         * @param localFile
         * @param putExtra
         * @param callback
         */
        putFileWithoutKey(
            uploadToken: string,
            localFile: string,
            putExtra: PutExtra | null,
            callback: callback
        ): Promise<UploadResult>;
    }

    class PutExtra {
        /**
         * @default ''
         */
        fname?: string;

        /**
         * @default {}
         */
        params?: Record<string, string>;

        /**
         * @default null
         */
        mimeType?: string;

        /**
         * @default null
         */
        resumeRecordFile?: string

        /**
         * @default null
         */
        progressCallback?: (uploadBytes: number, totalBytes: number) => void

        /**
         * @default v1
         */
        version?: string

        /**
         * @default 4 * 1024 * 1024
         */
        partSize?: number

        /**
         * @default {}
         */
        metadata?: Record<string, string>

        /**
         * 上传可选参数
         * @param fname 请求体中的文件的名称
         * @param params 额外参数设置，参数名称必须以x:开头
         * @param mimeType 指定文件的mimeType
         * @param resumeRecordFile
         * @param progressCallback
         * @param partSize 分片上传v2必传字段 默认大小为4MB 分片大小范围为1 MB - 1 GB
         * @param version 分片上传版本 目前支持v1/v2版本 默认v1
         * @param metadata 元数据设置，参数名称必须以 x-qn-meta-${name}: 开头
         */
        constructor(fname?: string, params?: Record<string, string>, mimeType?: string, resumeRecordFile?: string,
                    progressCallback?: (uploadBytes: number, totalBytes: number) => void,
                    partSize?:number, version?:string, metadata?: Record<string, string>);
    }
}

export declare namespace util {
    function isTimestampExpired(timestamp: number): boolean;

    /**
     * 使用 UTC 时间来格式化日期时间
     *
     * @param date 与 new Date() 接受的参数一样，内部会使用 new Date(date) 生成日期时间对象
     * @param layout 目前仅接受
     *      YYYY
     *      MM
     *      DD
     *      HH
     *      mm
     *      ss
     *      SSS
     */
    function formatDateUTC(date: Date | number | string, layout?: string): string;

    function encodedEntry(bucket: string, key?: string): string;

    function getAKFromUptoken(uploadToken: string): string;

    function getBucketFromUptoken(uploadToken: string): string;

    function base64ToUrlSafe(v: string): string;

    function urlSafeToBase64(v: string): string;

    function urlsafeBase64Encode(jsonFlags: string): string;

    function urlSafeBase64Decode(fromStr: string): string;

    function hmacSha1(encodedFlags: string | Buffer, secretKey: string | Buffer): string;

    function canonicalMimeHeaderKey(fieldName: string): string;

    /**
     * 创建AccessToken凭证
     * @param mac AK&SK对象
     * @param requestURI 请求URL
     * @param reqBody  请求Body，仅当请求的ContentType为application/x-www-form-urlencoded 时才需要传入该参数
     */
    function generateAccessToken(mac: auth.digest.Mac, requestURI: string, reqBody?: string): string;


    /**
     * 创建AccessToken凭证
     * @param mac            AK&SK对象
     * @param requestURI     请求URL
     * @param reqMethod      请求方法，例如 GET，POST
     * @param reqContentType 请求类型，例如 application/json 或者  application/x-www-form-urlencoded
     * @param reqBody        请求Body，仅当请求的 ContentType 为 application/json 或者 application/x-www-form-urlencoded 时才需要传入该参数
     * @param reqHeaders     请求Headers，例如 {"X-Qiniu-Name": "Qiniu", "Content-Type": "application/x-www-form-urlencoded"}
     */
    function generateAccessTokenV2(mac: auth.digest.Mac, requestURI: string, reqMethod: string, reqContentType: string, reqBody?: string, reqHeaders?: Record<string, string>): string;

    /**
     * 校验七牛上传回调的Authorization
     * @param mac AK&SK对象
     * @param requestURI 回调的URL中的requestURI
     * @param reqBody 回调的URL中的requestURI 请求Body，仅当请求的ContentType为application/x-www-form-urlencoded时才需要传入该参数
     * @param callbackAuth 回调时请求的Authorization头部值
     */
    function isQiniuCallback(mac: auth.digest.Mac, requestURI: string, reqBody: string | null, callbackAuth: string): boolean;
}

export declare namespace httpc {
    interface ReqOpts<T = any> {
        agent?: HttpAgent;
        httpsAgent?: HttpsAgent;
        url: string;
        middlewares: middleware.Middleware[];
        callback?: Callback<T>;
        urllibOptions: RequestOptions;
    }

    interface ResponseWrapperOptions<T = any> {
        data: T;
        resp: IncomingMessage;
    }

    // responseWrapper.js
    class ResponseWrapper<T = any> {
        data: T;
        resp: IncomingMessage;
        constructor(options: ResponseWrapperOptions);
        ok(): boolean;
        needRetry(): boolean;
    }

    // middleware package
    namespace middleware {
        interface Middleware {
            send<T>(
                request: ReqOpts<T>,
                next: (reqOpts: ReqOpts<T>) => Promise<ResponseWrapper<T>>
            ): Promise<ResponseWrapper<T>>;
        }

        /**
         * 组合中间件为一个调用函数
         * @param middlewares 中间件列表
         * @param handler 请求函数
         */
        function composeMiddlewares<T>(
            middlewares: Middleware[],
            handler: (reqOpts: ReqOpts<T>) => Promise<ResponseWrapper<T>>
        );

        /**
         * 设置 User-Agent 请求头中间件
         */
        class UserAgentMiddleware implements Middleware {
            constructor(sdkVersion: string);
            send<T>(
                request: httpc.ReqOpts<T>,
                next: (reqOpts: httpc.ReqOpts<T>) => Promise<httpc.ResponseWrapper<T>>
            ): Promise<httpc.ResponseWrapper<T>>;
        }

        interface RetryDomainsMiddlewareOptions {
            backupDomains: string[];
            maxRetryTimes: number;
            retryCondition: () => boolean;
        }

        class RetryDomainsMiddleware implements Middleware {
            /**
             * 备用域名
             */
            backupDomains: string[];

            /**
             * 最大重试次数，包括首次请求
             */
            maxRetryTimes: number;

            /**
             * 是否可以重试，可以通过该函数配置更详细的重试规则
             */
            retryCondition: () => boolean;

            /**
             * 已经重试的次数
             * @private
             */
            private _retriedTimes: number;

            /**
             * 实例化重试域名中间件
             * @param retryDomainsOptions
             */
            constructor(retryDomainsOptions: RetryDomainsMiddlewareOptions)

            /**
             * 重试域名中间件逻辑
             * @param request
             * @param next
             */
            send<T>(
                request: httpc.ReqOpts<T>,
                next: (reqOpts: httpc.ReqOpts<T>) => Promise<httpc.ResponseWrapper<T>>
            ): Promise<httpc.ResponseWrapper<T>>;

            /**
             * 控制重试逻辑，主要为 {@link retryCondition} 服务。若没有设置 retryCondition，默认 2xx 才会终止重试
             * @param err
             * @param respWrapper
             * @param reqOpts
             * @private
             */
            private _shouldRetry<T>(
                err: Error | null,
                respWrapper: ResponseWrapper<T>,
                reqOpts: ReqOpts<T>
            ): boolean;
        }
    }

    // client.js
    interface HttpClientOptions {
        httpAgent?: HttpAgent;
        httpsAgent?: HttpsAgent;
        middlewares?: middleware.Middleware[];
    }

    interface GetOptions<T = any> extends ReqOpts<T> {
        params: Record<string, string>;
        headers: Record<string, string>;
    }

    interface PostOptions<T = any> extends ReqOpts<T> {
        data: string | Buffer | Readable;
        headers: Record<string, string>;
    }

    interface PutOptions<T = any> extends ReqOpts<T> {
        data: string | Buffer | Readable;
        headers: Record<string, string>
    }

    class HttpClient {
        httpAgent: HttpAgent;
        httpsAgent: HttpsAgent;
        middlewares: middleware.Middleware[];
        constructor(options: HttpClientOptions)
        sendRequest(requestOptions: ReqOpts): Promise<ResponseWrapper>
        get(getOptions: GetOptions): Promise<ResponseWrapper>
        post(postOptions: PostOptions): Promise<ResponseWrapper>
        put(putOptions: PutOptions): Promise<ResponseWrapper>
    }

    // endpoint.js
    interface EndpointOptions {
        defaultScheme?: string;
    }

    interface EndpointPersistInfo {
        host: string;
        defaultScheme: string;
    }

    class Endpoint {
        static fromPersistInfo(persistInfo: EndpointPersistInfo): Endpoint;

        host: string;
        defaultScheme: string;

        constructor(host: string, options?: EndpointOptions);

        getValue(options?: {scheme?: string}): string;

        get persistInfo(): EndpointPersistInfo;
    }

    // region.js
    enum SERVICE_NAME {
        UC = 'uc',
        UP = 'up',
        IO = 'io',
        RS = 'rs',
        RSF = 'rsf',
        API = 'api',
        S3 = 's3'
    }

    interface RegionOptions {
        regionId?: string;
        s3RegionId?: string;
        services?: Record<string, Endpoint[]>;
        ttl?: number;
        createTime?: Date;
    }

    interface RegionFromZoneOptions {
        regionId?: string;
        s3RegionId?: string;
        ttl?: number;
        isPreferCdnHost?: boolean;
    }

    interface RegionFromRegionIdOptions {
        s3RegionId?: string;
        ttl?: number;
        createTime?: Date;
        extendedServices?: Record<SERVICE_NAME | string, Endpoint[]>
    }

    interface RegionPersistInfo {
        regionId?: string;
        s3RegionId?: string;
        services: Record<SERVICE_NAME | string, EndpointPersistInfo[]>;
        ttl: number;
        createTime: number;
    }

    interface QueryRegionsRespData {
        region: string;
        ttl: number;
        s3: {
            domains: string[];
            region_alias: string;
        };
        uc: {
            domains: string[];
        };
        up: {
            domains: string[];
        };
        io: {
            domains: string[];
        };
        rs: {
            domains: string[];
        };
        rsf: {
            domains: string[];
        };
        api: {
            domains: string[];
        };
    }

    class Region {
        static fromZone(zone: conf.Zone, options?: RegionFromZoneOptions): Region;
        static fromRegionId(regionId: string, options?: RegionFromRegionIdOptions): Region;
        static fromPersistInfo(persistInfo: RegionPersistInfo): Region;
        static fromQueryData(data: QueryRegionsRespData): Region;

        // non-unique
        regionId?: string;
        s3RegionId?: string;
        services: Record<SERVICE_NAME | string, Endpoint[]>

        ttl: number;
        createTime: Date;

        constructor(options: RegionOptions);

        get isLive(): boolean;
        get persistInfo(): RegionPersistInfo;
    }

    // endpointProvider.js
    interface EndpointsProvider {
        getEndpoints(): Promise<Endpoint[]>
    }

    interface MutableEndpointsProvider extends EndpointsProvider {
        setEndpoints(endpoints: Endpoint[]): Promise<void>
    }

    class StaticEndpointsProvider implements EndpointsProvider {
        static fromRegion(region: Region, serviceName: SERVICE_NAME | string): StaticEndpointsProvider;

        constructor(endpoints: Endpoint[]);

        getEndpoints(): Promise<Endpoint[]>;
    }

    // regionsProvider.js
    interface RegionsProvider {
        getRegions(): Promise<Region[]>
    }

    interface MutableRegionsProvider extends RegionsProvider {
       setRegions(regions: Region[]): Promise<void>
    }

    // StaticRegionsProvider
    class StaticRegionsProvider implements RegionsProvider {
        regions: Region[];

        constructor(regions: Region[]);

        getRegions(): Promise<Region[]>;
    }

    // CachedRegionsProviderOptions
    interface CachedRegionsProviderOptions {
        cacheKey: string;
        baseRegionsProvider: RegionsProvider;
        persistPath?: string;
        shrinkInterval?: number; // ms
    }

    class CachedRegionsProvider implements MutableRegionsProvider {
        cacheKey: string;
        baseRegionsProvider: RegionsProvider;

        lastShrinkAt: Date;
        shrinkInterval: number;

        constructor(
            options: CachedRegionsProviderOptions
        );

        setRegions(regions: Region[]): Promise<void>;

        getRegions(): Promise<Region[]>;
    }

    // QueryRegionsProvider
    interface QueryRegionsProviderOptions {
        accessKey: string;
        bucketName: string;
        endpointsProvider: EndpointsProvider;
    }

    class QueryRegionsProvider implements RegionsProvider {
        accessKey: string;
        bucketName: string;
        endpointsProvider: EndpointsProvider;

        constructor(options: QueryRegionsProviderOptions);

        getRegions(): Promise<Region[]>;
    }
}

export declare namespace rpc {
    type Headers = Record<string, string> & {
        'User-Agent'?: string;
        Connection?: string;
    }

    interface RequestOptions {
        headers: Headers;
        mac: auth.digest.Mac;
    }

    const qnHttpClient: httpc.HttpClient;

    /**
     *
     * @param requestUrl 请求地址
     * @param headers 请求 headers
     * @param callbackFunc 回调函数
     */
    function get(requestUrl: string, headers: Headers | null, callbackFunc: callback): void;

    /**
     * @param requestUrl 请求地址
     * @param options 请求的配置
     * @param callbackFunc 回调函数
     */
    function getWithOptions(
        requestUrl: string,
        options: RequestOptions | null,
        callbackFunc: callback
    ): ReturnType<typeof get>;

    /**
     *
     * @param requestUrl 请求地址
     * @param token 请求认证签名
     * @param callbackFunc 回调函数
     */
    function getWithToken(requestUrl: string, token: string | null, callbackFunc: callback): void;

    /**
     *
     * @param requestURI
     * @param requestForm
     * @param headers
     * @param callback
     */
    function post(requestURI: string, requestForm: Buffer | string | NodeJS.ReadableStream | null, headers: Headers | null, callback: callback): void;


    /**
     * @param requestUrl 请求地址
     * @param requestForm 请求体
     * @param options 请求的配置
     * @param callbackFunc 回调函数
     */
    function postWithOptions(
        requestUrl: string,
        requestForm: Buffer | string | NodeJS.ReadableStream | null,
        options: RequestOptions | null,
        callbackFunc: callback
    ): ReturnType<typeof post>;

    /**
     *
     * @param requestURI
     * @param requestForm
     * @param callback
     */
    function postMultipart(requestURI: string, requestForm: Buffer | string | NodeJS.ReadableStream | null, callback: callback): void;

    /**
     *
     * @param requestURI
     * @param requestForm
     * @param token
     * @param callback
     */
    function postWithForm(requestURI: string, requestForm: Buffer | string | NodeJS.ReadableStream | null, token: string | null, callback: callback): void;

    /**
     *
     * @param requestURI
     * @param token
     * @param callback
     */
    function postWithoutForm(requestURI: string, token: string | null, callback: callback): void;
}

export declare namespace zone {
    //huadong
    const Zone_z0: conf.Zone;
    //huadong2
    const Zone_cn_east_2: conf.Zone;
    //huabei
    const Zone_z1: conf.Zone;
    //huanan
    const Zone_z2: conf.Zone;
    //beimei
    const Zone_na0: conf.Zone;
    //Southeast Asia
    const Zone_as0: conf.Zone;
}

export declare namespace fop {
    interface PfopOptions {
        /**
         * 回调业务服务器，通知处理结果
         */
        notifyURL?: string;

        /**
         * 结果是否强制覆盖已有的同名文件
         */
        force?: boolean;
    }
    class OperationManager {
        mac: auth.digest.Mac;
        config: conf.Config;

        constructor(mac?: auth.digest.Mac, config?: conf.Config);

        /**
         * 发送持久化数据处理请求
         * @param bucket 空间名称
         * @param key 文件名称
         * @param fops 处理指令集合
         * @param pipeline 处理队列名称
         * @param options
         * @param callback
         */
        pfop(bucket: string, key: string, fops: string[], pipeline: string, options: PfopOptions | null, callback: callback): void;

        /**
         * 查询持久化数据处理进度
         * @param persistentId pfop操作返回的持久化处理ID
         * @param callback
         */
        prefop(persistentId: string, callback: callback): void;
    }
}

export declare namespace rs {
    interface ListPrefixOptions {
        /**
         * 列举的文件前缀
         */
        prefix?: string;

        /**
         * 上一次列举返回的位置标记
         */
        marker?: any;

        /**
         * 每次返回的最大列举文件数量
         */
        limit?: number;

        /**
         * 指定目录分隔符
         */
        delimiter?: string;
    }

    type BucketEventName = 'put'
        | 'mkfile'
        | 'delete'
        | 'copy'
        | 'move'
        | 'append'
        | 'disable'
        | 'enable'
        | 'deleteMarkerCreate'
        | 'predelete'
        | 'restore:completed';

    class BucketManager {
        mac: auth.digest.Mac;
        config: conf.Config;

        constructor(mac?: auth.digest.Mac, config?: conf.Config);

        /**
         * 获取资源信息
         * @see https://developer.qiniu.com/kodo/api/1308/stat
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param callback
         */
        stat(bucket: string, key: string, callback: callback): void;

        /**
         * 修改文件的类型
         * @see https://developer.qiniu.com/kodo/api/1252/chgm
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param newMime 新文件类型
         * @param callback
         */
        changeMime(bucket: string, key: string, newMime: string, callback: callback): void;

        /**
         * 修改文件的Headers
         * @see TODO
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param headers Headers对象
         * @param callback
         */
        changeHeaders(bucket: string, key: string, headers: { [k: string]: string }, callback: callback): void;

        /**
         * 移动或重命名文件，当bucketSrc==bucketDest相同的时候，就是重命名文件操作
         * @see https://developer.qiniu.com/kodo/api/1288/move
         *
         * @param srcBucket 源空间名称
         * @param srcKey 源文件名称
         * @param destBucket 目标空间名称
         * @param destKey 目标文件名称
         * @param options
         * @param callback
         */
        move(srcBucket: string, srcKey: string, destBucket: string, destKey: string, options: { force?: boolean } | null, callback: callback): void;

        /**
         * 复制文件
         * @see https://developer.qiniu.com/kodo/api/1254/copy
         *
         * @param srcBucket 源空间名称
         * @param srcKey 源文件名称
         * @param destBucket 目标空间名称
         * @param destKey 目标文件名称
         * @param options
         * @param callback
         */
        copy(srcBucket: string, srcKey: string, destBucket: string, destKey: string, options: { force?: boolean } | null, callback: callback): void;

        /**
         * 删除资源
         * @see https://developer.qiniu.com/kodo/api/1257/delete
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param callback
         */
        delete(bucket: string, key: string, callback: callback): void;

        /**
         * 设置文件删除的生命周期
         * @see https://developer.qiniu.com/kodo/api/1732/update-file-lifecycle
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param days 有效期天数
         * @param callback
         */
        deleteAfterDays(bucket: string, key: string, days: number, callback: callback): void;

        /**
         * 设置文件的生命周期
         * @param { string } bucket - 空间名称
         * @param { string } key - 文件名称
         * @param { Object } options - 配置项
         * @param { number } options.toIaAfterDays - 多少天后将文件转为低频存储，设置为 -1 表示取消已设置的转低频存储的生命周期规则， 0 表示不修改转低频生命周期规则。
         * @param { number } options.toArchiveAfterDays - 多少天后将文件转为归档存储，设置为 -1 表示取消已设置的转归档存储的生命周期规则， 0 表示不修改转归档生命周期规则。
         * @param { number } options.toDeepArchiveAfterDays - 多少天后将文件转为深度归档存储，设置为 -1 表示取消已设置的转深度归档存储的生命周期规则， 0 表示不修改转深度归档生命周期规则。
         * @param { number } options.deleteAfterDays - 多少天后将文件删除，设置为 -1 表示取消已设置的删除存储的生命周期规则， 0 表示不修改删除存储的生命周期规则。
         * @param { Object } options.cond - 匹配条件，只有条件匹配才会设置成功
         * @param { string } options.cond.hash
         * @param { string } options.cond.mime
         * @param { number } options.cond.fsize
         * @param { number } options.cond.putTime
         * @param { function } callbackFunc - 回调函数
         */
        setObjectLifeCycle(
            bucket: string,
            key: string,
            options: {
                toIaAfterDays?: number,
                toArchiveAfterDays?: number,
                toDeepArchiveAfterDays?: number,
                deleteAfterDays?: number
                cond?: {
                    hash?: string,
                    mime?: string,
                    fsize?: number,
                    putTime?: number
                }
            },
            callbackFunc: callback
        )

        /**
         * 解冻归档存储文件
         * @param entry
         * @param freezeAfterDays
         * @param callbackFunc
         */
        restoreAr(entry: string, freezeAfterDays: number, callbackFunc: callback): void;

        /**
         * 抓取资源
         * @see https://developer.qiniu.com/kodo/api/1263/fetch
         *
         * @param resUrl 资源链接
         * @param bucket 空间名称
         * @param key 文件名称
         * @param callback
         */
        fetch(resUrl: string, bucket: string, key: string, callback: callback): void;

        /**
         * 更新镜像副本
         * @see https://developer.qiniu.com/kodo/api/1293/prefetch
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param callback
         */
        prefetch(bucket: string, key: string, callback: callback): void;

        /**
         * 修改文件的存储类型
         * @see https://developer.qiniu.com/kodo/api/3710/modify-the-file-type
         *
         * @param bucket 空间名称
         * @param key 文件名称
         * @param newType 0 表示标准存储；1 表示低频存储。
         * @param callback
         */
        changeType(bucket: string, key: string, newType: number, callback: callback): void;

        /**
         * 设置空间镜像源
         * @see https://developer.qiniu.com/kodo/api/1370/mirror
         *
         * @param bucket 空间名称
         * @param srcSiteUrl 镜像源地址
         * @param srcHost 镜像Host
         * @param callback
         */
        image(bucket: string, srcSiteUrl: string, srcHost: string, callback: callback): void;

        /**
         * 取消设置空间镜像源
         * @see https://developer.qiniu.com/kodo/api/1370/mirror
         *
         * @param bucket 空间名称
         * @param callback
         */
        unimage(bucket: string, callback: callback): void;

        /**
         * 获取指定前缀的文件列表
         * @see https://developer.qiniu.com/kodo/api/1284/list
         *
         * @param bucket 空间名称
         * @param options 列举操作的可选参数
         * @param callback 回调函数
         */
        listPrefix(bucket: string, options: ListPrefixOptions | null, callback: callback): void;

        /**
         * 获取制定前缀的文件列表 V2
         *
         * @deprecated API 可能返回仅包含 marker，不包含 item 或 dir 的项，请使用 {@link listPrefix}
         *
         * @param bucket 空间名称
         * @param options 列举操作的可选参数
         * @param callback 回调函数
         */
        listPrefixV2(bucket: string, options: ListPrefixOptions | null, callback: callback): void;

        /**
         * 批量文件管理请求，支持stat，chgm，chtype，delete，copy，move
         * @param operations
         * @param callback
         */
        batch(operations: any, callback: callback): void;

        /**
         * 获取私有空间的下载链接
         * @param domain 空间绑定的域名，比如以http或https开头
         * @param fileName 原始文件名
         * @param deadline 文件有效期时间戳（单位秒）
         */
        privateDownloadUrl(domain: string, fileName: string, deadline: number): string;

        /**
         * 获取公开空间的下载链接
         * @param domain 空间绑定的域名，比如以http或https开头
         * @param fileName 原始文件名
         */
        publicDownloadUrl(domain: string, fileName: string): string;

        /**
         * rules/add 增加 bucket 规则
         *
         * @param bucket - 空间名
         *
         * @param options - 配置项
         * @param options.name - 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
         * @param options.prefix - 同一个 bucket 里面前缀不能重复
         * @param options.to_line_after_days - 指定文件上传多少天后转低频存储。指定为0表示不转低频存储，小于0表示上传的文件立即变低频存储
         * @param options.to_archive_after_days - 指定文件上传多少天后转归档存储。指定为0表示不转归档存储，小于0表示上传的文件立即变归档存储
         * @param options.to_deep_archive_after_days - 指定文件上传多少天后转深度归档存储。指定为0表示不转深度归档存储，小于0表示上传的文件立即变深度归档存储
         * @param options.delete_after_days - 指定上传文件多少天后删除，指定为0表示不删除，大于0表示多少天后删除
         * @param options.history_delete_after_days - 指定文件成为历史版本多少天后删除，指定为0表示不删除，大于0表示多少天后删除
         * @param options.history_to_line_after_days - 指定文件成为历史版本多少天后转低频存储。指定为0表示不转低频存储
         *
         * @param callbackFunc - 回调函数
         */
        putBucketLifecycleRule(
            bucket: string,
            options: {
                name: string,
                prefix?: string,
                to_line_after_days?: number,
                to_archive_after_days?: number,
                to_deep_archive_after_days?: number,
                delete_after_days?: number,
                history_delete_after_days?: number,
                history_to_line_after_days?: number,
            },
            callbackFunc: callback
        ): void;

        /** rules/delete 删除 bucket 规则
         * @param bucket - 空间名
         * @param name - 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
         * @param callbackFunc - 回调函数
         */
        deleteBucketLifecycleRule(bucket: string, name: string, callbackFunc: callback): void;

        /**
         * rules/update 更新 bucket 规则
         *
         * @param bucket - 空间名
         *
         * @param options - 配置项
         * @param options.name - 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
         * @param options.prefix - 同一个 bucket 里面前缀不能重复
         * @param options.to_line_after_days - 指定文件上传多少天后转低频存储。指定为0表示不转低频存储，小于0表示上传的文件立即变低频存储
         * @param options.to_archive_after_days - 指定文件上传多少天后转归档存储。指定为0表示不转归档存储，小于0表示上传的文件立即变归档存储
         * @param options.to_deep_archive_after_days - 指定文件上传多少天后转深度归档存储。指定为0表示不转深度归档存储，小于0表示上传的文件立即变深度归档存储
         * @param options.delete_after_days - 指定上传文件多少天后删除，指定为0表示不删除，大于0表示多少天后删除
         * @param options.history_delete_after_days - 指定文件成为历史版本多少天后删除，指定为0表示不删除，大于0表示多少天后删除
         * @param options.history_to_line_after_days - 指定文件成为历史版本多少天后转低频存储。指定为0表示不转低频存储
         *
         * @param callbackFunc - 回调函数
         */
        updateBucketLifecycleRule(
            bucket: string,
            options: {
                name: string,
                prefix?: string,
                to_line_after_days?: number,
                to_archive_after_days?: number,
                to_deep_archive_after_days?: number,
                delete_after_days?: number,
                history_delete_after_days?: number,
                history_to_line_after_days?: number,
            },
            callbackFunc: callback
        ): void;


        /** rules/get - 获取 bucket 规则
         *  @param bucket - 空间名
         *  @param callbackFunc - 回调函数
         */
        getBucketLifecycleRule(bucket: string, callbackFunc: callback): void

        /**
         * 添加事件通知
         * https://developer.qiniu.com/kodo/8610/dev-event-notification
         * @param bucket - 空间名
         * @param options - 配置项
         * @param options.name - 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
         * @param options.event - 事件类型，接受数组设置多个
         * @param options.callbackUrl - 事件通知回调 URL，接受数组设置多个，失败依次重试
         * @param options.prefix - 可选，文件配置的前缀
         * @param options.suffix - 可选，文件配置的后缀
         * @param options.access_key - 可选，设置的话会对通知请求用对应的ak、sk进行签名
         * @param options.host - 可选，通知请求的host
         * @param callbackFunc - 回调函数
         */
        putBucketEvent(
            bucket: string,
            options: {
                name: string,
                event: BucketEventName | BucketEventName[],
                callbackUrl: string | string[],
                prefix?: string,
                suffix?: string,
                access_key?: string,
                host?: string,
            },
            callbackFunc: callback,
        ): void

        /**
         * 更新事件通知
         * https://developer.qiniu.com/kodo/8610/dev-event-notification
         * @param bucket - 空间名
         * @param options - 配置项
         * @param options.name - 规则名称 bucket 内唯一，长度小于50，不能为空，只能为字母、数字、下划线
         * @param options.event - 事件类型，接受数组设置多个
         * @param options.callbackUrl - 事件通知回调 URL，接受数组设置多个，失败依次重试
         * @param options.prefix - 可选，文件配置的前缀
         * @param options.suffix - 可选，文件配置的后缀
         * @param options.access_key - 可选，设置的话会对通知请求用对应的ak、sk进行签名
         * @param options.host - 可选，通知请求的host
         * @param callbackFunc - 回调函数
         */
        updateBucketEvent(
            bucket: string,
            options: {
                name: string,
                event?: BucketEventName | BucketEventName[],
                callbackUrl?: string | string[],
                prefix?: string,
                suffix?: string,
                access_key?: string,
                host?: string,
            },
            callbackFunc: callback,
        ): void

        /**
         * 获取事件通知规则
         * https://developer.qiniu.com/kodo/8610/dev-event-notification
         *
         * @param bucket - 空间名
         * @param callbackFunc - 回调函数
         */
        getBucketEvent(bucket: string, callbackFunc: callback): void

        /**
         * 删除事件通知规则
         * https://developer.qiniu.com/kodo/8610/dev-event-notification
         *
         * @param bucket - 空间名
         * @param name - 规则名称
         * @param callbackFunc - 回调函数
         */
        deleteBucketEvent(bucket: string, name: string, callbackFunc: callback): void

        /**
         * 设置 bucket 的 cors（跨域）规则
         * https://developer.qiniu.com/kodo/8539/set-the-cross-domain-resource-sharing
         * @param bucket - 空间名
         * @param body - 规则配置
         * @param body[].allowed_origin - 允许的域名
         * @param body[].allowed_method - 允许的请求方法；大小写不敏感
         * @param body[].allowed_header - 可选，允许的 header；默认不允许任何 header；大小写不敏感
         * @param body[].exposed_header - 可选，暴露的 header；默认 X-Log, X-Reqid；大小写不敏感
         * @param body[].max_age - 可选，结果可以缓存的时间；默认不缓存
         * @param callbackFunc - 回调函数
         */
        putCorsRules(
            bucket: string,
            body: {
                allowed_origin: string[],
                allowed_method: string[],
                allowed_header?: string[],
                exposed_header?: string[],
                max_age?: number,
            }[],
            callbackFunc: callback
        ): void

        /**
         * 获取 bucket 的 cors（跨域）规则
         * https://developer.qiniu.com/kodo/8539/set-the-cross-domain-resource-sharing
         * @param bucket - 空间名
         * @param callbackFunc - 回调函数
         */
        getCorsRules(bucket: string, callbackFunc: callback): void
    }

    /**
     *
     * @param bucket
     * @param key
     */
    function statOp(bucket: string, key: string): string;

    /**
     *
     * @param bucket
     * @param key
     */
    function deleteOp(bucket: string, key: string): string;

    /**
     *
     * @param bucket
     * @param key
     * @param days
     */
    function deleteAfterDaysOp(bucket: string, key: string, days: number): string;

    /**
     *
     * @param bucket
     * @param key
     * @param newMime
     */
    function changeMimeOp(bucket: string, key: string, newMime: string): string;

    /**
     *
     * @param bucket
     * @param key
     * @param headers
     */
    function changeHeadersOp(bucket: string, key: string, headers: { [k: string]: string }): string;

    /**
     *
     * @param bucket
     * @param key
     * @param newType
     */
    function changeTypeOp(bucket: string, key: string, newType: number): string;

    /**
     *
     * @param srcBucket
     * @param srcKey
     * @param destBucket
     * @param destKey
     * @param options
     */
    function moveOp(srcBucket: string, srcKey: string, destBucket: string, destKey: string, options?: { force?: boolean }): string;

    /**
     *
     * @param srcBucket
     * @param srcKey
     * @param destBucket
     * @param destKey
     * @param options
     */
    function copyOp(srcBucket: string, srcKey: string, destBucket: string, destKey: string, options?: { force?: boolean }): string;

    interface PutPolicyOptions {
        scope?: string;
        isPrefixalScope?: number;
        expires?: number;
        insertOnly?: number;
        saveKey?: string;
        endUser?: string;
        returnUrl?: string;
        returnBody?: string;
        callbackUrl?: string;
        callbackHost?: string;
        callbackBody?: string;
        callbackBodyType?: string;
        callbackFetchKey?: number;

        persistentOps?: string;
        persistentNotifyUrl?: string;
        persistentPipeline?: string;

        fsizeLimit?: number;
        fsizeMin?: number;
        mimeLimit?: string;

        detectMime?: number;
        deleteAfterDays?: number;
        fileType?: number;
    }
    class PutPolicy {
        constructor(options?: PutPolicyOptions);

        getFlags(): any;

        uploadToken(mac?: auth.digest.Mac): string;
    }
}

export declare namespace sms {
  namespace message {
    /**
     * 发送短信 (POST Message)
     * @link https://developer.qiniu.com/sms/5897/sms-api-send-message#1
     * @param reqBody
     * @param mac
     * @param callback
     */
    function sendMessage(
      reqBody: {
        "template_id": string,
        "mobiles": string[],
        "parameters"?: Record<string, string>
      },
      mac: auth.digest.Mac,
      callback: Callback<{ job_id: string }>
    ): void;

    /**
     * 发送单条短信 (POST Single Message)
     * @link https://developer.qiniu.com/sms/5897/sms-api-send-message#2
     * @param reqBody
     * @param mac
     * @param callback
     */
    function sendSingleMessage(
      reqBody: {
        "template_id": string,
        "mobile": string,
        "parameters"?: Record<string, string>
      },
      mac: auth.digest.Mac,
      callback: Callback<{ message_id: string }>
    ): void;

    /**
     * 发送国际/港澳台短信 (POST Oversea Message)
     * @link https://developer.qiniu.com/sms/5897/sms-api-send-message#3
     * @param reqBody
     * @param mac
     * @param callback
     */
    function sendOverseaMessage(
      reqBody: {
        "template_id": string,
        "mobile": string,
        "parameters"?: Record<string, string>
      },
      mac: auth.digest.Mac,
      callback: Callback<{ message_id: string }>
    ): void;

    /**
     * 发送全文本短信(不需要传模版 ID) (POST Fulltext Message)
     * @link https://developer.qiniu.com/sms/5897/sms-api-send-message#4
     * @param reqBody
     * @param mac
     * @param callback
     */
    function sendFulltextMessage(
      reqBody: {
        "mobiles": string[],
        "content": string,
        "template_type": string
      },
      mac: auth.digest.Mac,
      callback: Callback<{ job_id: string }>
    ): void;
  }
}
