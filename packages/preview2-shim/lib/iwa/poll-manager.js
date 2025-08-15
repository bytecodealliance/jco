// Creative polling implementation for IWA
// Uses browser APIs to implement async I/O polling

const symbolDispose = Symbol.dispose || Symbol.for('dispose');

/**
 * PollableHandle wraps various async resources that can be polled
 */
class PollableHandle {
    constructor(resource, type = 'generic') {
        this.resource = resource;
        this.type = type;
        this.ready = false;
        this.error = null;
        this.callbacks = new Set();
        this.checkPromise = null;
    }
    
    /**
     * Check if the resource is ready based on its type
     */
    async checkReady() {
        switch (this.type) {
            case 'promise':
                // For promises, ready means resolved or rejected
                if (this.checkPromise) {return this.ready;}
                
                this.checkPromise = Promise.race([
                    this.resource.then(() => {
                        this.ready = true;
                        return true;
                    }),
                    this.resource.catch((err) => {
                        this.ready = true;
                        this.error = err;
                        return true;
                    })
                ]);
                return this.checkPromise;
                
            case 'stream':
                // For streams, check if data is available
                if (this.resource.readable) {
                    // Check ReadableStream
                    const reader = this.resource.readable.getReader();
                    try {
                        const { done } = await reader.read();
                        reader.releaseLock();
                        this.ready = !done;
                        return this.ready;
                    } catch (err) {
                        reader.releaseLock();
                        this.error = err;
                        return false;
                    }
                }
                if (this.resource.writable) {
                    // Check WritableStream
                    const writer = this.resource.writable.getWriter();
                    try {
                        await writer.ready;
                        writer.releaseLock();
                        this.ready = true;
                        return true;
                    } catch (err) {
                        writer.releaseLock();
                        this.error = err;
                        return false;
                    }
                }
                return false;
                
            case 'websocket':
                // For WebSocket, check readyState
                return this.resource.readyState === WebSocket.OPEN;
                
            case 'timer':
                // For timers, check if time has elapsed
                return Date.now() >= this.resource.targetTime;
                
            case 'animation':
                // Use requestAnimationFrame for high-resolution timing
                if (!this.checkPromise) {
                    this.checkPromise = new Promise(resolve => {
                        requestAnimationFrame(() => {
                            this.ready = true;
                            resolve(true);
                        });
                    });
                }
                return this.checkPromise;
                
            case 'idle':
                // Use requestIdleCallback for when browser is idle
                if (!this.checkPromise && typeof requestIdleCallback !== 'undefined') {
                    this.checkPromise = new Promise(resolve => {
                        requestIdleCallback(() => {
                            this.ready = true;
                            resolve(true);
                        });
                    });
                }
                return this.checkPromise || Promise.resolve(true);
                
            case 'custom':
                // For custom resources with a ready() method
                if (typeof this.resource.ready === 'function') {
                    return await this.resource.ready();
                }
                return false;
                
            default:
                // Generic polling - always ready
                return true;
        }
    }
    
    /**
     * Subscribe to ready state changes
     */
    subscribe(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }
    
    /**
     * Notify all subscribers
     */
    notify() {
        for (const callback of this.callbacks) {
            callback(this);
        }
    }
}

/**
 * Global poll manager using various browser timing APIs
 */
class PollManager {
    constructor() {
        this.pollables = new Map();
        this.pollGroups = new Map();
        this.nextId = 1;
        this.polling = false;
        this.pollInterval = null;
        
        // Use different polling strategies based on context
        this.strategies = {
            raf: false,     // requestAnimationFrame
            interval: true, // setInterval
            idle: false,    // requestIdleCallback
            worker: false   // Web Worker
        };
        
        this.detectCapabilities();
        this.startPolling();
    }
    
    detectCapabilities() {
        // Check available APIs
        if (typeof requestAnimationFrame !== 'undefined') {
            this.strategies.raf = true;
        }
        if (typeof requestIdleCallback !== 'undefined') {
            this.strategies.idle = true;
        }
        if (typeof Worker !== 'undefined') {
            // Could use a Web Worker for background polling
            this.strategies.worker = true;
        }
    }
    
    /**
     * Register a pollable resource
     */
    register(resource, type = 'generic') {
        const id = this.nextId++;
        const handle = new PollableHandle(resource, type);
        this.pollables.set(id, handle);
        return id;
    }
    
    /**
     * Unregister a pollable
     */
    unregister(id) {
        this.pollables.delete(id);
        
        // Clean up any groups containing this pollable
        for (const [groupId, group] of this.pollGroups.entries()) {
            group.pollables.delete(id);
            if (group.pollables.size === 0) {
                this.pollGroups.delete(groupId);
            }
        }
    }
    
    /**
     * Create a poll group for multiple resources
     */
    createGroup(pollableIds) {
        const groupId = `group_${this.nextId++}`;
        this.pollGroups.set(groupId, {
            pollables: new Set(pollableIds),
            ready: new Set(),
            callbacks: new Set()
        });
        return groupId;
    }
    
    /**
     * Start the polling loop
     */
    startPolling() {
        if (this.polling) {return;}
        this.polling = true;
        
        // Use multiple strategies simultaneously
        
        // Strategy 1: High-frequency polling with RAF
        if (this.strategies.raf) {
            const rafPoll = () => {
                if (!this.polling) {return;}
                this.pollOnce();
                requestAnimationFrame(rafPoll);
            };
            requestAnimationFrame(rafPoll);
        }
        
        // Strategy 2: Regular interval polling as fallback
        if (this.strategies.interval) {
            this.pollInterval = setInterval(() => {
                this.pollOnce();
            }, 10); // 10ms = 100Hz polling
        }
        
        // Strategy 3: Idle polling for low-priority
        if (this.strategies.idle) {
            const idlePoll = () => {
                if (!this.polling) {return;}
                this.pollOnce();
                requestIdleCallback(idlePoll, { timeout: 50 });
            };
            requestIdleCallback(idlePoll);
        }
    }
    
    /**
     * Stop polling
     */
    stopPolling() {
        this.polling = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        // cleanup all handles
        for (const handle of this.pollables.values()) {
            if (handle.callbacks) {
                handle.callbacks.clear();
            }
        }
        this.pollables.clear();
        this.pollGroups.clear();
    }
    
    /**
     * Poll all registered resources once
     */
    async pollOnce() {
        const promises = [];
        
        // Check all individual pollables
        for (const [id, handle] of this.pollables) {
            promises.push(
                handle.checkReady().then(ready => {
                    if (ready && !handle.wasReady) {
                        handle.wasReady = true;
                        handle.notify();
                    }
                    return { id, ready };
                })
            );
        }
        
        // Wait for all checks to complete
        const results = await Promise.allSettled(promises);
        
        // Update poll groups
        for (const [groupId, group] of this.pollGroups) {
            for (const pollableId of group.pollables) {
                const handle = this.pollables.get(pollableId);
                if (handle && handle.ready) {
                    group.ready.add(pollableId);
                }
            }
            
            // Notify group callbacks if any pollable is ready
            if (group.ready.size > 0) {
                for (const callback of group.callbacks) {
                    callback(Array.from(group.ready));
                }
            }
        }
        
        return results;
    }
    
    /**
     * Poll specific resources and wait for at least one to be ready
     */
    async pollList(pollableIds, timeout = null) {
        const startTime = Date.now();
        
        while (true) {
            const ready = [];
            
            for (const id of pollableIds) {
                const handle = this.pollables.get(id);
                if (handle && await handle.checkReady()) {
                    ready.push(id);
                }
            }
            
            if (ready.length > 0) {
                return ready;
            }
            
            // Check timeout
            if (timeout !== null && Date.now() - startTime > timeout) {
                return [];
            }
            
            // Wait a bit before next poll
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
    
    /**
     * Poll and wait for exactly one resource
     */
    async pollOne(pollableId, timeout = null) {
        const result = await this.pollList([pollableId], timeout);
        return result.length > 0;
    }
}

// Global instance
const globalPollManager = new PollManager();

/**
 * Create a Pollable from various resource types
 */
export function createPollable(resource, type) {
    // Detect type if not provided
    if (!type) {
        if (resource instanceof Promise) {
            type = 'promise';
        } else if (resource.readable || resource.writable) {
            type = 'stream';
        } else if (resource instanceof WebSocket) {
            type = 'websocket';
        } else if (typeof resource.ready === 'function') {
            type = 'custom';
        } else {
            type = 'generic';
        }
    }
    
    const id = globalPollManager.register(resource, type);
    
    return {
        id,
        ready: async () => {
            const handle = globalPollManager.pollables.get(id);
            return handle ? await handle.checkReady() : false;
        },
        blockUntilReady: async (timeout) => {
            return globalPollManager.pollOne(id, timeout);
        },
        [symbolDispose]() {
            globalPollManager.unregister(id);
        }
    };
}

/**
 * Poll a list of pollables
 */
export async function pollList(pollables) {
    const ids = pollables.map(p => p.id || globalPollManager.register(p));
    const readyIds = await globalPollManager.pollList(ids);
    
    // Return pollables that are ready
    return pollables.filter((p, index) => readyIds.includes(ids[index]));
}

/**
 * Poll a single pollable
 */
export async function pollOne(pollable) {
    const id = pollable.id || globalPollManager.register(pollable);
    return globalPollManager.pollOne(id);
}

// Export for testing
export { PollManager, PollableHandle, globalPollManager };