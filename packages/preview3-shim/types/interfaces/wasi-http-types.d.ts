/** @module Interface wasi:http/types@0.3.0-draft **/
export type Duration = import('./wasi-clocks-monotonic-clock.js').Duration;
/**
 * This type corresponds to HTTP standard Methods.
 */
export type Method =
    | MethodGet
    | MethodHead
    | MethodPost
    | MethodPut
    | MethodDelete
    | MethodConnect
    | MethodOptions
    | MethodTrace
    | MethodPatch
    | MethodOther;
export interface MethodGet {
    tag: 'get';
}
export interface MethodHead {
    tag: 'head';
}
export interface MethodPost {
    tag: 'post';
}
export interface MethodPut {
    tag: 'put';
}
export interface MethodDelete {
    tag: 'delete';
}
export interface MethodConnect {
    tag: 'connect';
}
export interface MethodOptions {
    tag: 'options';
}
export interface MethodTrace {
    tag: 'trace';
}
export interface MethodPatch {
    tag: 'patch';
}
export interface MethodOther {
    tag: 'other';
    val: string;
}
/**
 * This type corresponds to HTTP standard Related Schemes.
 */
export type Scheme = SchemeHttp | SchemeHttps | SchemeOther;
export interface SchemeHttp {
    tag: 'HTTP';
}
export interface SchemeHttps {
    tag: 'HTTPS';
}
export interface SchemeOther {
    tag: 'other';
    val: string;
}
/**
 * Defines the case payload type for `DNS-error` above:
 */
export interface DnsErrorPayload {
    rcode?: string;
    infoCode?: number;
}
/**
 * Defines the case payload type for `TLS-alert-received` above:
 */
export interface TlsAlertReceivedPayload {
    alertId?: number;
    alertMessage?: string;
}
/**
 * Defines the case payload type for `HTTP-response-{header,trailer}-size` above:
 */
export interface FieldSizePayload {
    fieldName?: string;
    fieldSize?: number;
}
/**
 * These cases are inspired by the IANA HTTP Proxy Error Types:
 *   <https://www.iana.org/assignments/http-proxy-status/http-proxy-status.xhtml#table-http-proxy-error-types>
 */
export type ErrorCode =
    | ErrorCodeDnsTimeout
    | ErrorCodeDnsError
    | ErrorCodeDestinationNotFound
    | ErrorCodeDestinationUnavailable
    | ErrorCodeDestinationIpProhibited
    | ErrorCodeDestinationIpUnroutable
    | ErrorCodeConnectionRefused
    | ErrorCodeConnectionTerminated
    | ErrorCodeConnectionTimeout
    | ErrorCodeConnectionReadTimeout
    | ErrorCodeConnectionWriteTimeout
    | ErrorCodeConnectionLimitReached
    | ErrorCodeTlsProtocolError
    | ErrorCodeTlsCertificateError
    | ErrorCodeTlsAlertReceived
    | ErrorCodeHttpRequestDenied
    | ErrorCodeHttpRequestLengthRequired
    | ErrorCodeHttpRequestBodySize
    | ErrorCodeHttpRequestMethodInvalid
    | ErrorCodeHttpRequestUriInvalid
    | ErrorCodeHttpRequestUriTooLong
    | ErrorCodeHttpRequestHeaderSectionSize
    | ErrorCodeHttpRequestHeaderSize
    | ErrorCodeHttpRequestTrailerSectionSize
    | ErrorCodeHttpRequestTrailerSize
    | ErrorCodeHttpResponseIncomplete
    | ErrorCodeHttpResponseHeaderSectionSize
    | ErrorCodeHttpResponseHeaderSize
    | ErrorCodeHttpResponseBodySize
    | ErrorCodeHttpResponseTrailerSectionSize
    | ErrorCodeHttpResponseTrailerSize
    | ErrorCodeHttpResponseTransferCoding
    | ErrorCodeHttpResponseContentCoding
    | ErrorCodeHttpResponseTimeout
    | ErrorCodeHttpUpgradeFailed
    | ErrorCodeHttpProtocolError
    | ErrorCodeLoopDetected
    | ErrorCodeConfigurationError
    | ErrorCodeInternalError;
export interface ErrorCodeDnsTimeout {
    tag: 'DNS-timeout';
}
export interface ErrorCodeDnsError {
    tag: 'DNS-error';
    val: DnsErrorPayload;
}
export interface ErrorCodeDestinationNotFound {
    tag: 'destination-not-found';
}
export interface ErrorCodeDestinationUnavailable {
    tag: 'destination-unavailable';
}
export interface ErrorCodeDestinationIpProhibited {
    tag: 'destination-IP-prohibited';
}
export interface ErrorCodeDestinationIpUnroutable {
    tag: 'destination-IP-unroutable';
}
export interface ErrorCodeConnectionRefused {
    tag: 'connection-refused';
}
export interface ErrorCodeConnectionTerminated {
    tag: 'connection-terminated';
}
export interface ErrorCodeConnectionTimeout {
    tag: 'connection-timeout';
}
export interface ErrorCodeConnectionReadTimeout {
    tag: 'connection-read-timeout';
}
export interface ErrorCodeConnectionWriteTimeout {
    tag: 'connection-write-timeout';
}
export interface ErrorCodeConnectionLimitReached {
    tag: 'connection-limit-reached';
}
export interface ErrorCodeTlsProtocolError {
    tag: 'TLS-protocol-error';
}
export interface ErrorCodeTlsCertificateError {
    tag: 'TLS-certificate-error';
}
export interface ErrorCodeTlsAlertReceived {
    tag: 'TLS-alert-received';
    val: TlsAlertReceivedPayload;
}
export interface ErrorCodeHttpRequestDenied {
    tag: 'HTTP-request-denied';
}
export interface ErrorCodeHttpRequestLengthRequired {
    tag: 'HTTP-request-length-required';
}
export interface ErrorCodeHttpRequestBodySize {
    tag: 'HTTP-request-body-size';
    val: bigint | undefined;
}
export interface ErrorCodeHttpRequestMethodInvalid {
    tag: 'HTTP-request-method-invalid';
}
export interface ErrorCodeHttpRequestUriInvalid {
    tag: 'HTTP-request-URI-invalid';
}
export interface ErrorCodeHttpRequestUriTooLong {
    tag: 'HTTP-request-URI-too-long';
}
export interface ErrorCodeHttpRequestHeaderSectionSize {
    tag: 'HTTP-request-header-section-size';
    val: number | undefined;
}
export interface ErrorCodeHttpRequestHeaderSize {
    tag: 'HTTP-request-header-size';
    val: FieldSizePayload | undefined;
}
export interface ErrorCodeHttpRequestTrailerSectionSize {
    tag: 'HTTP-request-trailer-section-size';
    val: number | undefined;
}
export interface ErrorCodeHttpRequestTrailerSize {
    tag: 'HTTP-request-trailer-size';
    val: FieldSizePayload;
}
export interface ErrorCodeHttpResponseIncomplete {
    tag: 'HTTP-response-incomplete';
}
export interface ErrorCodeHttpResponseHeaderSectionSize {
    tag: 'HTTP-response-header-section-size';
    val: number | undefined;
}
export interface ErrorCodeHttpResponseHeaderSize {
    tag: 'HTTP-response-header-size';
    val: FieldSizePayload;
}
export interface ErrorCodeHttpResponseBodySize {
    tag: 'HTTP-response-body-size';
    val: bigint | undefined;
}
export interface ErrorCodeHttpResponseTrailerSectionSize {
    tag: 'HTTP-response-trailer-section-size';
    val: number | undefined;
}
export interface ErrorCodeHttpResponseTrailerSize {
    tag: 'HTTP-response-trailer-size';
    val: FieldSizePayload;
}
export interface ErrorCodeHttpResponseTransferCoding {
    tag: 'HTTP-response-transfer-coding';
    val: string | undefined;
}
export interface ErrorCodeHttpResponseContentCoding {
    tag: 'HTTP-response-content-coding';
    val: string | undefined;
}
export interface ErrorCodeHttpResponseTimeout {
    tag: 'HTTP-response-timeout';
}
export interface ErrorCodeHttpUpgradeFailed {
    tag: 'HTTP-upgrade-failed';
}
export interface ErrorCodeHttpProtocolError {
    tag: 'HTTP-protocol-error';
}
export interface ErrorCodeLoopDetected {
    tag: 'loop-detected';
}
export interface ErrorCodeConfigurationError {
    tag: 'configuration-error';
}
/**
 * This is a catch-all error for anything that doesn't fit cleanly into a
 * more specific case. It also includes an optional string for an
 * unstructured description of the error. Users should not depend on the
 * string for diagnosing errors, as it's not required to be consistent
 * between implementations.
 */
export interface ErrorCodeInternalError {
    tag: 'internal-error';
    val: string | undefined;
}
/**
 * This type enumerates the different kinds of errors that may occur when
 * setting or appending to a `fields` resource.
 */
export type HeaderError =
    | HeaderErrorInvalidSyntax
    | HeaderErrorForbidden
    | HeaderErrorImmutable;
/**
 * This error indicates that a `field-name` or `field-value` was
 * syntactically invalid when used with an operation that sets headers in a
 * `fields`.
 */
export interface HeaderErrorInvalidSyntax {
    tag: 'invalid-syntax';
}
/**
 * This error indicates that a forbidden `field-name` was used when trying
 * to set a header in a `fields`.
 */
export interface HeaderErrorForbidden {
    tag: 'forbidden';
}
/**
 * This error indicates that the operation on the `fields` was not
 * permitted because the fields are immutable.
 */
export interface HeaderErrorImmutable {
    tag: 'immutable';
}
/**
 * This type enumerates the different kinds of errors that may occur when
 * setting fields of a `request-options` resource.
 */
export type RequestOptionsError =
    | RequestOptionsErrorNotSupported
    | RequestOptionsErrorImmutable;
/**
 * Indicates the specified field is not supported by this implementation.
 */
export interface RequestOptionsErrorNotSupported {
    tag: 'not-supported';
}
/**
 * Indicates that the operation on the `request-options` was not permitted
 * because it is immutable.
 */
export interface RequestOptionsErrorImmutable {
    tag: 'immutable';
}
/**
 * Field names are always strings.
 *
 * Field names should always be treated as case insensitive by the `fields`
 * resource for the purposes of equality checking.
 */
export type FieldName = string;
/**
 * Field values should always be ASCII strings. However, in
 * reality, HTTP implementations often have to interpret malformed values,
 * so they are provided as a list of bytes.
 */
export type FieldValue = Uint8Array;
/**
 * Headers is an alias for Fields.
 */
export type Headers = Fields;
/**
 * Trailers is an alias for Fields.
 */
export type Trailers = Fields;
/**
 * This type corresponds to the HTTP standard Status Code.
 */
export type StatusCode = number;
export type Result<T, E> = { tag: 'ok'; val: T } | { tag: 'err'; val: E };

export class Fields {
    /**
     * Construct an empty HTTP Fields.
     *
     * The resulting `fields` is mutable.
     */
    constructor();
    /**
     * Construct an HTTP Fields.
     *
     * The resulting `fields` is mutable.
     *
     * The list represents each name-value pair in the Fields. Names
     * which have multiple values are represented by multiple entries in this
     * list with the same name.
     *
     * The tuple is a pair of the field name, represented as a string, and
     * Value, represented as a list of bytes. In a valid Fields, all names
     * and values are valid UTF-8 strings. However, values are not always
     * well-formed, so they are represented as a raw list of bytes.
     *
     * An error result will be returned if any header or value was
     * syntactically invalid, or if a header was forbidden.
     */
    static fromList(entries: Array<[FieldName, FieldValue]>): Fields;
    /**
     * Get all of the values corresponding to a name. If the name is not present
     * in this `fields`, an empty list is returned. However, if the name is
     * present but empty, this is represented by a list with one or more
     * empty field-values present.
     */
    get(name: FieldName): Array<FieldValue>;
    /**
     * Returns `true` when the name is present in this `fields`. If the name is
     * syntactically invalid, `false` is returned.
     */
    has(name: FieldName): boolean;
    /**
     * Set all of the values for a name. Clears any existing values for that
     * name, if they have been set.
     *
     * Fails with `header-error.immutable` if the `fields` are immutable.
     */
    set(name: FieldName, value: Array<FieldValue>): void;
    /**
     * Delete all values for a name. Does nothing if no values for the name
     * exist.
     *
     * Fails with `header-error.immutable` if the `fields` are immutable.
     */
    delete(name: FieldName): void;
    /**
     * Delete all values for a name. Does nothing if no values for the name
     * exist.
     *
     * Returns all values previously corresponding to the name, if any.
     *
     * Fails with `header-error.immutable` if the `fields` are immutable.
     */
    getAndDelete(name: FieldName): Array<FieldValue>;
    /**
     * Append a value for a name. Does not change or delete any existing
     * values for that name.
     *
     * Fails with `header-error.immutable` if the `fields` are immutable.
     */
    append(name: FieldName, value: FieldValue): void;
    /**
     * Retrieve the full set of names and values in the Fields. Like the
     * constructor, the list represents each name-value pair.
     *
     * The outer list represents each name-value pair in the Fields. Names
     * which have multiple values are represented by multiple entries in this
     * list with the same name.
     *
     * The names and values are always returned in the original casing and in
     * the order in which they will be serialized for transport.
     */
    entries(): Array<[FieldName, FieldValue]>;
    /**
     * Make a deep copy of the Fields. Equivalent in behavior to calling the
     * `fields` constructor on the return value of `entries`. The resulting
     * `fields` is mutable.
     */
    clone(): Fields;
}

export class Request {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    /**
     * Construct a new `request` with a default `method` of `GET`, and
     * `none` values for `path-with-query`, `scheme`, and `authority`.
     *
     * `headers` is the HTTP Headers for the Request.
     *
     * `contents` is the optional body content stream.
     * Once it is closed, `trailers` future must resolve to a result.
     * If `trailers` resolves to an error, underlying connection
     * will be closed immediately.
     *
     * `options` is optional `request-options` resource to be used
     * if the request is sent over a network connection.
     *
     * It is possible to construct, or manipulate with the accessor functions
     * below, a `request` with an invalid combination of `scheme`
     * and `authority`, or `headers` which are not permitted to be sent.
     * It is the obligation of the `handler.handle` implementation
     * to reject invalid constructions of `request`.
     *
     * The returned future resolves to result of transmission of this request.
     */
    static new(
        headers: Headers,
        contents: ReadableStream<number> | undefined,
        trailers: Promise<Result<Trailers | undefined, ErrorCode>>,
        options: RequestOptions | undefined
    ): [Request, Promise<Result<void, ErrorCode>>];
    /**
     * Get the Method for the Request.
     */
    method(): Method;
    /**
     * Set the Method for the Request. Fails if the string present in a
     * `method.other` argument is not a syntactically valid method.
     */
    setMethod(method: Method): void;
    /**
     * Get the combination of the HTTP Path and Query for the Request.  When
     * `none`, this represents an empty Path and empty Query.
     */
    pathWithQuery(): string | undefined;
    /**
     * Set the combination of the HTTP Path and Query for the Request.  When
     * `none`, this represents an empty Path and empty Query. Fails is the
     * string given is not a syntactically valid path and query uri component.
     */
    setPathWithQuery(pathWithQuery: string | undefined): void;
    /**
     * Get the HTTP Related Scheme for the Request. When `none`, the
     * implementation may choose an appropriate default scheme.
     */
    scheme(): Scheme | undefined;
    /**
     * Set the HTTP Related Scheme for the Request. When `none`, the
     * implementation may choose an appropriate default scheme. Fails if the
     * string given is not a syntactically valid uri scheme.
     */
    setScheme(scheme: Scheme | undefined): void;
    /**
     * Get the authority of the Request's target URI. A value of `none` may be used
     * with Related Schemes which do not require an authority. The HTTP and
     * HTTPS schemes always require an authority.
     */
    authority(): string | undefined;
    /**
     * Set the authority of the Request's target URI. A value of `none` may be used
     * with Related Schemes which do not require an authority. The HTTP and
     * HTTPS schemes always require an authority. Fails if the string given is
     * not a syntactically valid URI authority.
     */
    setAuthority(authority: string | undefined): void;
    /**
     * Get the `request-options` to be associated with this request
     *
     * The returned `request-options` resource is immutable: `set-*` operations
     * will fail if invoked.
     *
     * This `request-options` resource is a child: it must be dropped before
     * the parent `request` is dropped, or its ownership is transferred to
     * another component by e.g. `handler.handle`.
     */
    options(): RequestOptions | undefined;
    /**
     * Get the headers associated with the Request.
     *
     * The returned `headers` resource is immutable: `set`, `append`, and
     * `delete` operations will fail with `header-error.immutable`.
     */
    headers(): Headers;
    /**
     * Get body of the Request.
     *
     * Stream returned by this method represents the contents of the body.
     * Once the stream is reported as closed, callers should await the returned future
     * to determine whether the body was received successfully.
     * The future will only resolve after the stream is reported as closed.
     *
     * The stream and future returned by this method are children:
     * they should be closed or consumed before the parent `response`
     * is dropped, or its ownership is transferred to another component
     * by e.g. `handler.handle`.
     *
     * This method may be called multiple times.
     *
     * This method will return an error if it is called while either:
     * - a stream or future returned by a previous call to this method is still open
     * - a stream returned by a previous call to this method has reported itself as closed
     * Thus there will always be at most one readable stream open for a given body.
     * Each subsequent stream picks up where the last stream left off, up until it is finished.
     */
    body(): [
        ReadableStream<number>,
        Promise<Result<Trailers | undefined, ErrorCode>>,
    ];
}

export class RequestOptions {
    /**
     * Construct a default `request-options` value.
     */
    constructor();
    /**
     * The timeout for the initial connect to the HTTP Server.
     */
    connectTimeout(): Duration | undefined;
    /**
     * Set the timeout for the initial connect to the HTTP Server. An error
     * return value indicates that this timeout is not supported or that this
     * handle is immutable.
     */
    setConnectTimeout(duration: Duration | undefined): void;
    /**
     * The timeout for receiving the first byte of the Response body.
     */
    firstByteTimeout(): Duration | undefined;
    /**
     * Set the timeout for receiving the first byte of the Response body. An
     * error return value indicates that this timeout is not supported or that
     * this handle is immutable.
     */
    setFirstByteTimeout(duration: Duration | undefined): void;
    /**
     * The timeout for receiving subsequent chunks of bytes in the Response
     * body stream.
     */
    betweenBytesTimeout(): Duration | undefined;
    /**
     * Set the timeout for receiving subsequent chunks of bytes in the Response
     * body stream. An error return value indicates that this timeout is not
     * supported or that this handle is immutable.
     */
    setBetweenBytesTimeout(duration: Duration | undefined): void;
    /**
     * Make a deep copy of the `request-options`.
     * The resulting `request-options` is mutable.
     */
    clone(): RequestOptions;
}

export class Response {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    /**
     * Construct a new `response`, with a default `status-code` of `200`.
     * If a different `status-code` is needed, it must be set via the
     * `set-status-code` method.
     *
     * `headers` is the HTTP Headers for the Response.
     *
     * `contents` is the optional body content stream.
     * Once it is closed, `trailers` future must resolve to a result.
     * If `trailers` resolves to an error, underlying connection
     * will be closed immediately.
     *
     * The returned future resolves to result of transmission of this response.
     */
    static new(
        headers: Headers,
        contents: ReadableStream<number> | undefined,
        trailers: Promise<Result<Trailers | undefined, ErrorCode>>
    ): [Response, Promise<Result<void, ErrorCode>>];
    /**
     * Get the HTTP Status Code for the Response.
     */
    statusCode(): StatusCode;
    /**
     * Set the HTTP Status Code for the Response. Fails if the status-code
     * given is not a valid http status code.
     */
    setStatusCode(statusCode: StatusCode): void;
    /**
     * Get the headers associated with the Response.
     *
     * The returned `headers` resource is immutable: `set`, `append`, and
     * `delete` operations will fail with `header-error.immutable`.
     */
    headers(): Headers;
    /**
     * Get body of the Response.
     *
     * Stream returned by this method represents the contents of the body.
     * Once the stream is reported as closed, callers should await the returned future
     * to determine whether the body was received successfully.
     * The future will only resolve after the stream is reported as closed.
     *
     * The stream and future returned by this method are children:
     * they should be closed or consumed before the parent `response`
     * is dropped, or its ownership is transferred to another component
     * by e.g. `handler.handle`.
     *
     * This method may be called multiple times.
     *
     * This method will return an error if it is called while either:
     * - a stream or future returned by a previous call to this method is still open
     * - a stream returned by a previous call to this method has reported itself as closed
     * Thus there will always be at most one readable stream open for a given body.
     * Each subsequent stream picks up where the last stream left off, up until it is finished.
     */
    body(): [
        ReadableStream<number>,
        Promise<Result<Trailers | undefined, ErrorCode>>,
    ];
}
