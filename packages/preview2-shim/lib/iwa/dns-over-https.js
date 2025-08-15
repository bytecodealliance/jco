// dns over https client for iwa
// uses public doh servers

const DOH_SERVERS = [
    {
        name: 'cloudflare',
        url: 'https://1.1.1.1/dns-query',
        headers: { 'accept': 'application/dns-json' }
    },
    {
        name: 'cloudflare secondary', 
        url: 'https://1.0.0.1/dns-query',
        headers: { 'accept': 'application/dns-json' }
    },
    {
        name: 'google',
        url: 'https://dns.google/resolve',
        headers: { 'accept': 'application/json' }
    },
    {
        name: 'quad9',
        url: 'https://dns.quad9.net/dns-query',
        headers: { 'accept': 'application/dns-json' }
    }
];

// dns cache with ttl
const dnsCache = new Map();

// server rotation index
let currentServerIndex = 0;

// rotate server
function rotateServer() {
    currentServerIndex = (currentServerIndex + 1) % DOH_SERVERS.length;
}

// get cache key
function getCacheKey(hostname, type) {
    return `${hostname}:${type}`;
}

// check cache validity
function isCacheValid(entry) {
    return entry && Date.now() < entry.expires;
}

// parse dns response
function parseDnsResponse(data, format) {
    if (format === 'google') {
        // google format differs
        return {
            answers: data.Answer || [],
            ttl: data.Answer?.[0]?.TTL || 300
        };
    } else {
        // standard rfc 8427 format
        return {
            answers: data.Answer || [],
            ttl: data.Answer?.[0]?.TTL || 300
        };
    }
}

// dns lookup using doh
// hostname - name to resolve
// type - record type (a, aaaa)
// maxretries - retry count with rotation
export async function dnsLookup(hostname, type = 'a', maxRetries = 3) {
    const cacheKey = getCacheKey(hostname, type);
    
    // check cache
    const cached = dnsCache.get(cacheKey);
    if (isCacheValid(cached)) {
        return cached.addresses;
    }
    
    let lastError = null;
    let attempts = 0;
    
    while (attempts < maxRetries) {
        const server = DOH_SERVERS[currentServerIndex];
        
        try {
            // build query
            const params = new URLSearchParams({
                name: hostname,
                type: type
            });
            
            // google uses diferent params
            if (server.name.includes('google')) {
                params.set('name', hostname);
                params.set('type', type);
            }
            
            const url = `${server.url}?${params}`;
            
            // perform query
            const response = await fetch(url, {
                method: 'get',
                headers: {
                    ...server.headers,
                    'user-agent': 'iwa-doh-client/1.0'
                },
                signal: AbortSignal.timeout(5000) // 5 sec timeout
            });
            
            if (!response.ok) {
                throw new Error(`http ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // parse response
            const format = server.name.includes('google') ? 'google' : 'standard';
            const parsed = parseDnsResponse(data, format);
            
            if (!parsed.answers || parsed.answers.length === 0) {
                throw new Error('no dns records found');
            }
            
            // extract ips
            const addresses = parsed.answers
                .filter(answer => answer.type === (type === 'a' ? 1 : 28)) // 1=a, 28=aaaa
                .map(answer => answer.data || answer.rdata);
            
            if (addresses.length === 0) {
                throw new Error('no valid adresses in response');
            }
            
            // cache result
            const ttl = Math.min(parsed.ttl, 3600); // cap at 1 hour
            dnsCache.set(cacheKey, {
                addresses,
                expires: Date.now() + (ttl * 1000)
            });
            
            return addresses;
            
        } catch (error) {
            lastError = error;
            console.warn(`doh query failed with ${server.name}: ${error.message}`);
            
            // rotate and retry
            rotateServer();
            attempts++;
        }
    }
    
    // all attempts failed
    throw new Error(`dns resolution failed after ${attempts} attempts: ${lastError?.message}`);
}

// resolve ipv4 and ipv6
export async function dnsResolveAll(hostname) {
    try {
        // resolve both in paralel
        const [ipv4, ipv6] = await Promise.allSettled([
            dnsLookup(hostname, 'a'),
            dnsLookup(hostname, 'aaaa')
        ]);
        
        return {
            ipv4: ipv4.status === 'fulfilled' ? ipv4.value : [],
            ipv6: ipv6.status === 'fulfilled' ? ipv6.value : []
        };
    } catch (error) {
        console.error('dns resolution error:', error);
        return { ipv4: [], ipv6: [] };
    }
}

// clear cache
export function clearDnsCache() {
    dnsCache.clear();
}

// purge expired entries
export function purgeExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of dnsCache.entries()) {
        if (now >= entry.expires) {
            dnsCache.delete(key);
        }
    }
}

// periodic cache purge (5 min)
if (typeof globalThis !== 'undefined' && globalThis.setInterval) {
    setInterval(purgeExpiredCache, 5 * 60 * 1000);
}