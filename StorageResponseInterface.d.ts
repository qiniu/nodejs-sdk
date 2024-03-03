/** 文件元信息 */
export interface StatObjectResult {
    [k: string]: any;
    /** 对象大小，单位为字节 */
    fsize?: number;
    /** 对象哈希值 */
    hash: string;
    /** 对象 MIME 类型 */
    mimeType: string;
    /** 对象存储类型，`0` 表示普通存储，`1` 表示低频存储，`2` 表示归档存储 */
    type: number;
    /** 文件上传时间，UNIX 时间戳格式，单位为 100 纳秒 */
    putTime: number;
    /** 资源内容的唯一属主标识 */
    endUser?: string;
    /** 归档存储文件的解冻状态，`2` 表示解冻完成，`1` 表示解冻中；归档文件冻结时，不返回该字段 */
    restoreStatus?: number;
    /** 文件状态。`1` 表示禁用；只有禁用状态的文件才会返回该字段 */
    status?: number;
    /** 对象 MD5 值，只有通过直传文件和追加文件 API 上传的文件，服务端确保有该字段返回 */
    md5?: string;
    /** 文件过期删除日期，UNIX 时间戳格式，文件在设置过期时间后才会返回该字段 */
    expiration?: number;
    /** 文件生命周期中转为低频存储的日期，UNIX 时间戳格式，文件在设置转低频后才会返回该字段 */
    transitionToIA?: number;
    /** 文件生命周期中转为归档存储的日期，UNIX 时间戳格式，文件在设置转归档后才会返回该字段 */
    transitionToARCHIVE?: number;
    /** 文件生命周期中转为深度归档存储的日期，UNIX 时间戳格式，文件在设置转归档后才会返回该字段 */
    transitionToDeepArchive?: number;
    /** 文件生命周期中转为归档直读存储的日期，UNIX 时间戳格式，文件在设置转归档直读后才会返回该字段 */
    transitionToArchiveIR?: number;
    /** 对象存储元信息 */
    'x-qn-meta'?: Record<string, string>;
    /** 每个分片的大小，如没有指定 need_parts 参数则不返回 */
    parts?: number[];
}

/** 对象条目，包含对象的元信息 */
interface ListedObjectEntry {
    [k: string]: any;
    /** 对象名称 */
    key: string;
    /** 文件上传时间，UNIX 时间戳格式，单位为 100 纳秒 */
    putTime: number;
    /** 文件的哈希值 */
    hash: string;
    /** 对象大小，单位为字节 */
    fsize?: number;
    /** 对象 MIME 类型 */
    mimeType: string;
    /** 对象存储类型，`0` 表示普通存储，`1` 表示低频存储，`2` 表示归档存储 */
    type?: number;
    /** 资源内容的唯一属主标识 */
    endUser?: string;
    /** 文件的存储状态，即禁用状态和启用状态间的的互相转换，`0` 表示启用，`1`表示禁用 */
    status?: number;
    /** 对象 MD5 值，只有通过直传文件和追加文件 API 上传的文件，服务端确保有该字段返回 */
    md5?: string;
    /** 每个分片的大小，如没有指定 need_parts 参数则不返回 */
    parts?: number[];
}

/** 本次列举的对象条目信息 */
export interface GetObjectsResult {
    [k: string]: any;
    /** 有剩余条目则返回非空字符串，作为下一次列举的参数传入，如果没有剩余条目则返回空字符串 */
    marker?: string;
    /** 公共前缀的数组，如没有指定 delimiter 参数则不返回 */
    commonPrefixes?: string[];
    /** 条目的数组，不能用来判断是否还有剩余条目 */
    items: ListedObjectEntry[];
}

/** 存储空间列表 */
export type GetBucketsResult = string[];

/** 空间规则 */
interface BucketRule {
    [k: string]: any;
    /** 空间规则名称 */
    name: string;
    /** 匹配的对象名称前缀 */
    prefix: string;
    /** 上传文件多少天后删除 */
    delete_after_days?: number;
    /** 文件上传多少天后转低频存储 */
    to_line_after_days?: number;
    /** 文件上传多少天后转归档存储 */
    to_archive_after_days?: number;
    /** 文件上传多少天后转深度归档存储 */
    to_deep_archive_after_days?: number;
    /** 文件上传多少天后转归档直读存储 */
    to_archive_ir_after_days?: number;
    /** 规则创建时间 */
    ctime: string;
}

/** 空间规则列表 */
export type GetBucketRulesResult = BucketRule[];

/** 跨域规则 */
interface CorsRule {
    [k: string]: any;
    /** 允许的域名。必填；支持通配符 * ；*表示全部匹配；只有第一个 * 生效；需要设置 "Scheme"；大小写敏感 */
    allowed_origin: string[];
    /** 允许的方法。必填；不支持通配符；大小写不敏感； */
    allowed_method: string[];
    allowed_header?: string[];
    /** 选填；不支持通配符；X-Log, X-Reqid 是默认会暴露的两个 header；其他的 header 如果没有设置，则不会暴露；大小写不敏感； */
    exposed_header?: string[];
    /** 结果可以缓存的时间。选填；空则不缓存 */
    max_age?: number;
}

/** 跨域规则列表 */
export type GetBucketCorsRulesResult = CorsRule[];

/** 抓取到的文件元信息 */
export interface FetchObjectResult {
    [k: string]: any;
    /** 抓取的对象内容的 Etag 值 */
    hash: string;
    /** 抓取后保存的对象名称 */
    key: string;
    /** 对象大小，单位为字节 */
    fsize?: number;
    /** 对象 MIME 类型 */
    mimeType: string;
}

/** 管理指令的响应数据 */
interface OperationResponseData {
    [k: string]: any;
    /** 管理指令的错误信息，仅在发生错误时才返回 */
    error?: string;
    /** 对象大小，单位为字节，仅对 stat 指令才有效 */
    fsize?: number;
    /** 对象哈希值，仅对 stat 指令才有效 */
    hash?: string;
    /** 对象 MIME 类型，仅对 stat 指令才有效 */
    mimeType?: string;
    /** 对象存储类型，`0` 表示普通存储，`1` 表示低频存储，`2` 表示归档存储，仅对 stat 指令才有效 */
    type?: number;
    /** 文件上传时间，UNIX 时间戳格式，单位为 100 纳秒，仅对 stat 指令才有效 */
    putTime?: number;
    /** 资源内容的唯一属主标识 */
    endUser?: string;
    /** 归档存储文件的解冻状态，`2` 表示解冻完成，`1` 表示解冻中；归档文件冻结时，不返回该字段，仅对 stat 指令才有效 */
    restoreStatus?: number;
    /** 文件状态。`1` 表示禁用；只有禁用状态的文件才会返回该字段，仅对 stat 指令才有效 */
    status?: number;
    /** 对象 MD5 值，只有通过直传文件和追加文件 API 上传的文件，服务端确保有该字段返回，仅对 stat 指令才有效 */
    md5?: string;
    /** 文件过期删除日期，UNIX 时间戳格式，文件在设置过期时间后才会返回该字段，仅对 stat 指令才有效 */
    expiration?: number;
    /** 文件生命周期中转为低频存储的日期，UNIX 时间戳格式，文件在设置转低频后才会返回该字段，仅对 stat 指令才有效 */
    transitionToIA?: number;
    /** 文件生命周期中转为归档存储的日期，UNIX 时间戳格式，文件在设置转归档后才会返回该字段，仅对 stat 指令才有效 */
    transitionToARCHIVE?: number;
    /** 文件生命周期中转为深度归档存储的日期，UNIX 时间戳格式，文件在设置转归档后才会返回该字段，仅对 stat 指令才有效 */
    transitionToDeepArchive?: number;
    /** 文件生命周期中转为归档直读存储的日期，UNIX 时间戳格式，文件在设置转归档直读后才会返回该字段，仅对 stat 指令才有效 */
    transitionToArchiveIR?: number;
}

/** 每个管理指令的响应信息 */
interface OperationResponse {
    [k: string]: any;
    /** 响应状态码 */
    code: number;
    /** 响应数据 */
    data?: OperationResponseData;
}

/** 所有管理指令的响应信息 */
export type BatchOpsResult = OperationResponse[];

interface BucketEvent {
    [k: string]: any;
    name: string;
    prefix: string;
    suffix: string;
    events: string[];
    callback_urls: string[];
    access_key?: string;
    host?: string;
    ctime: string;
}

export type GetBucketEventsResult = BucketEvent[];

interface AntiLeech {
    [k: string]: any;
    no_refer: boolean;
    anti_leech_mode: number;
    anti_leech_used: boolean;
    source_enabled: boolean;
}

interface BucketDomainV3 {
    [k: string]: any;
    domain: string;
    tbl: string;
    owner: number;
    ctime: number;
    utime: number;
    antileech: AntiLeech;
    domainType?: number;
}

export type GetBucketDomainsV3Result = BucketDomainV3[];

export interface GetBucketInfoV2Result {
    [k: string]: any;
    source: string;
    host: string;
    protected: number;
    private: number;
    no_index_page: number;
    max_age: number;
    separator: string;
    styles: Record<string, string>;
    anti_leech_mode: number;
    token_anti_leech: number;
    refer_wl: string[];
    refer_bl: string[];
    source_enabled: boolean;
    no_refer: boolean;
    mac_key: string;
    mac_key2: string;
    remark: string;
    ctime: string;
}
