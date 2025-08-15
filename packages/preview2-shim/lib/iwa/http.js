// improved http implementation for iwa
// uses fetch api instead of deprecated xmlhttprequest

const activeRequests = new Map();
let requestId = 0;

// fields implementation for headers
class Fields {
    constructor(entries = []) {
        this.map = new Map(entries);
    }
    
    get(name) {
        return this.map.get(name.toLowerCase());
    }
    
    set(name, value) {
        this.map.set(name.toLowerCase(), value);
    }
    
    delete(name) {
        return this.map.delete(name.toLowerCase());
    }
    
    append(name, value) {
        const key = name.toLowerCase();
        const existing = this.map.get(key);
        if (existing) {
            this.map.set(key, `${existing}, ${value}`);
        } else {
            this.map.set(key, value);
        }
    }
    
    entries() {
        return Array.from(this.map.entries());
    }
    
    clone() {
        return new Fields(this.entries());
    }
}

// async http request using fetch
export async function send(req) {
    try {
        const options = {
            method: req.method || 'GET',
            headers: {}
        };
        
        // convert headers
        if (req.headers) {
            for (const [name, value] of req.headers) {
                if (name.toLowerCase() !== 'host' && name.toLowerCase() !== 'user-agent') {
                    options.headers[name] = value;
                }
            }
        }
        
        // add body if present
        if (req.body && req.body.length > 0) {
            options.body = req.body;
        }
        
        // perform fetch
        const response = await fetch(req.uri, options);
        
        // convert response headers
        const headers = [];
        response.headers.forEach((value, key) => {
            headers.push([key, value]);
        });
        
        // get response body
        const body = new Uint8Array(await response.arrayBuffer());
        
        return {
            status: response.status,
            headers,
            body
        };
    } catch (error) {
        console.error('http request failed:', error);
        throw error;
    }
}

// incoming request handler
class IncomingRequest {
    constructor(method, path, headers, body) {
        this.method = method;
        this.path = path;
        this.headers = new Fields(headers);
        this.body = body;
        this.consumed = false;
    }
    
    consume() {
        if (this.consumed) {
            throw new Error('request already consumed');
        }
        this.consumed = true;
        return this.body;
    }
}

// outgoing response handler
class OutgoingResponse {
    constructor(status, headers) {
        this.status = status;
        this.headers = new Fields(headers);
        this.body = [];
    }
    
    write(chunk) {
        this.body.push(chunk);
    }
    
    finish() {
        // combine body chunks
        const totalLength = this.body.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of this.body) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
}

export const incomingHandler = {
    handle(request, responseOut) {
        // handle incoming http request
        const req = new IncomingRequest(
            request.method,
            request.path,
            request.headers,
            request.body
        );
        
        // create response
        const resp = new OutgoingResponse(200, []);
        
        // store for later processing
        const id = requestId++;
        activeRequests.set(id, { request: req, response: resp });
        
        // return response handle
        responseOut(resp);
        
        return id;
    }
};

export const outgoingHandler = {
    async handle(request) {
        // handle outgoing http request
        const response = await send(request);
        return response;
    }
};

export const types = {
    Fields,
    IncomingRequest,
    OutgoingResponse,
    
    dropFields(fields) {
        // cleanup
        if (fields instanceof Fields) {
            fields.map.clear();
        }
    },
    
    newFields(entries) {
        return new Fields(entries);
    },
    
    fieldsGet(fields, name) {
        return fields.get(name);
    },
    
    fieldsSet(fields, name, value) {
        fields.set(name, value);
    },
    
    fieldsDelete(fields, name) {
        return fields.delete(name);
    },
    
    fieldsAppend(fields, name, value) {
        fields.append(name, value);
    },
    
    fieldsEntries(fields) {
        return fields.entries();
    },
    
    fieldsClone(fields) {
        return fields.clone();
    },
    
    finishIncomingStream(stream) {
        // mark stream as finished
        if (stream && stream.finish) {
            stream.finish();
        }
    },
    
    finishOutgoingStream(stream, trailers) {
        // finish with optional trailers
        if (stream && stream.finish) {
            return stream.finish(trailers);
        }
    },
    
    dropIncomingRequest(req) {
        // cleanup request
        if (req instanceof IncomingRequest) {
            req.headers.map.clear();
            req.body = null;
        }
    },
    
    dropOutgoingRequest(req) {
        // cleanup outgoing
        if (req) {
            req.headers = null;
            req.body = null;
        }
    },
    
    incomingRequestMethod(req) {
        return req.method;
    },
    
    incomingRequestPathWithQuery(req) {
        return req.path;
    },
    
    incomingRequestScheme(req) {
        // extract from url
        try {
            const url = new URL(req.path, 'http://localhost');
            return url.protocol.replace(':', '');
        } catch {
            return 'http';
        }
    },
    
    incomingRequestAuthority(req) {
        return req.headers.get('host') || 'localhost';
    },
    
    incomingRequestHeaders(req) {
        return req.headers;
    },
    
    incomingRequestConsume(req) {
        return req.consume();
    },
    
    newOutgoingRequest(method, pathWithQuery, scheme, authority, headers) {
        const url = `${scheme}://${authority}${pathWithQuery}`;
        return {
            method,
            uri: url,
            headers: headers instanceof Fields ? headers.entries() : headers
        };
    },
    
    outgoingRequestWrite(req) {
        // return writable stream for body
        const chunks = [];
        return {
            write(chunk) {
                chunks.push(chunk);
            },
            finish() {
                req.body = chunks;
            }
        };
    },
    
    dropResponseOutparam(_res) {
        // cleanup response parameter
    },
    
    setResponseOutparam(response) {
        // set response for outgoing
        return response;
    },
    
    dropIncomingResponse(res) {
        // cleanup incoming response
        if (res) {
            res.headers = null;
            res.body = null;
        }
    },
    
    dropOutgoingResponse(res) {
        // cleanup outgoing response
        if (res instanceof OutgoingResponse) {
            res.headers.map.clear();
            res.body = [];
        }
    },
    
    incomingResponseStatus(res) {
        return res.status;
    },
    
    incomingResponseHeaders(res) {
        return new Fields(res.headers);
    },
    
    incomingResponseConsume(res) {
        return res.body;
    },
    
    newOutgoingResponse(statusCode, headers) {
        return new OutgoingResponse(statusCode, headers);
    },
    
    outgoingResponseWrite(res) {
        // return writable stream
        return {
            write(chunk) {
                res.write(chunk);
            },
            finish() {
                return res.finish();
            }
        };
    },
    
    dropFutureIncomingResponse(future) {
        // cleanup future
        if (future && future.cancel) {
            future.cancel();
        }
    },
    
    futureIncomingResponseGet(future) {
        // get response from future
        return future.response;
    },
    
    listenToFutureIncomingResponse(future) {
        // return pollable for future
        return {
            ready: () => future.ready,
            blockUntilReady: async () => {
                await future.promise;
            }
        };
    }
};