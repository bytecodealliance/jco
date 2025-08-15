// Creative stdin implementation strategies for IWA
// Since IWAs run in a browser context, we need to use browser APIs creatively

/**
 * Strategy 1: Hidden input field approach
 * Creates an invisible input field that captures keyboard input
 */
class HiddenInputStdin {
    constructor() {
        this.buffer = [];
        this.pending = [];
        this.subscribers = new Set();
        this.inputElement = null;
        this.initializeInput();
    }
    
    initializeInput() {
        if (typeof document === 'undefined') {return;}
        
        // Create hidden input element
        this.inputElement = document.createElement('textarea');
        this.inputElement.style.position = 'fixed';
        this.inputElement.style.left = '-9999px';
        this.inputElement.style.top = '-9999px';
        this.inputElement.style.width = '1px';
        this.inputElement.style.height = '1px';
        this.inputElement.style.opacity = '0';
        this.inputElement.setAttribute('aria-hidden', 'true');
        this.inputElement.setAttribute('tabindex', '-1');
        
        document.body.appendChild(this.inputElement);
        
        // Capture input events
        this.inputElement.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value) {
                this.buffer.push(...new TextEncoder().encode(value));
                e.target.value = '';
                this.notifySubscribers();
            }
        });
        
        // Keep focus on the input when window is active
        document.addEventListener('click', () => {
            if (document.hasFocus()) {
                this.inputElement.focus();
            }
        });
        
        // Initial focus
        this.inputElement.focus();
    }
    
    read(len) {
        const available = Math.min(len, this.buffer.length);
        if (available === 0) {return null;}
        
        const result = new Uint8Array(this.buffer.splice(0, available));
        return result;
    }
    
    notifySubscribers() {
        for (const callback of this.subscribers) {
            callback();
        }
    }
    
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }
}

/**
 * Strategy 2: Prompt-based stdin
 * Uses window.prompt for synchronous-like input (blocking feel)
 */
class PromptStdin {
    constructor() {
        this.buffer = [];
        this.subscribers = new Set();
    }
    
    blockingRead(len) {
        if (this.buffer.length >= len) {
            return new Uint8Array(this.buffer.splice(0, len));
        }
        
        // Use prompt for blocking-like behavior
        if (typeof window !== 'undefined' && window.prompt) {
            const input = window.prompt('Enter input:');
            if (input !== null) {
                const encoded = new TextEncoder().encode(input + '\n');
                this.buffer.push(...encoded);
                
                const available = Math.min(len, this.buffer.length);
                return new Uint8Array(this.buffer.splice(0, available));
            }
        }
        
        return new Uint8Array(0);
    }
}

/**
 * Strategy 3: Clipboard monitoring
 * Monitors clipboard for input (user pastes text)
 */
class ClipboardStdin {
    constructor() {
        this.buffer = [];
        this.subscribers = new Set();
        this.lastClipboard = '';
        this.startMonitoring();
    }
    
    startMonitoring() {
        if (typeof navigator === 'undefined' || !navigator.clipboard) {return;}
        
        // Set up clipboard paste event listener
        document.addEventListener('paste', async (e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text');
            if (text && text !== this.lastClipboard) {
                this.lastClipboard = text;
                const encoded = new TextEncoder().encode(text + '\n');
                this.buffer.push(...encoded);
                this.notifySubscribers();
            }
        });
        
        // Alternative: Polling clipboard (requires permissions)
        if (navigator.clipboard.readText) {
            setInterval(async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && text !== this.lastClipboard) {
                        this.lastClipboard = text;
                        const encoded = new TextEncoder().encode(text + '\n');
                        this.buffer.push(...encoded);
                        this.notifySubscribers();
                    }
                } catch (err) {
                    // Clipboard access denied or not available
                }
            }, 1000);
        }
    }
    
    read(len) {
        const available = Math.min(len, this.buffer.length);
        if (available === 0) {return null;}
        
        return new Uint8Array(this.buffer.splice(0, available));
    }
    
    notifySubscribers() {
        for (const callback of this.subscribers) {
            callback();
        }
    }
}

/**
 * Strategy 4: WebSocket-based stdin
 * Connects to a WebSocket server that provides stdin data
 */
class WebSocketStdin {
    constructor(wsUrl = 'ws://localhost:8080/stdin') {
        this.buffer = [];
        this.subscribers = new Set();
        this.ws = null;
        this.connect(wsUrl);
    }
    
    connect(url) {
        try {
            this.ws = new WebSocket(url);
            
            this.ws.onmessage = (event) => {
                if (event.data instanceof Blob) {
                    event.data.arrayBuffer().then(buffer => {
                        this.buffer.push(...new Uint8Array(buffer));
                        this.notifySubscribers();
                    });
                } else if (typeof event.data === 'string') {
                    const encoded = new TextEncoder().encode(event.data);
                    this.buffer.push(...encoded);
                    this.notifySubscribers();
                }
            };
            
            this.ws.onerror = () => {
                console.warn('WebSocket stdin connection failed');
            };
        } catch (err) {
            console.warn('Could not establish WebSocket connection for stdin');
        }
    }
    
    read(len) {
        const available = Math.min(len, this.buffer.length);
        if (available === 0) {return null;}
        
        return new Uint8Array(this.buffer.splice(0, available));
    }
    
    notifySubscribers() {
        for (const callback of this.subscribers) {
            callback();
        }
    }
}

/**
 * Strategy 5: File-based stdin
 * Allows user to select a file as stdin input
 */
class FileStdin {
    constructor() {
        this.buffer = [];
        this.subscribers = new Set();
        this.setupFileInput();
    }
    
    setupFileInput() {
        if (typeof document === 'undefined') {return;}
        
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.style.display = 'none';
        fileInput.id = 'stdin-file-input';
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const text = await file.text();
                const encoded = new TextEncoder().encode(text);
                this.buffer.push(...encoded);
                this.notifySubscribers();
            }
        });
        
        document.body.appendChild(fileInput);
        
        // Add a way to trigger file selection
        window.selectStdinFile = () => fileInput.click();
        console.log('Call window.selectStdinFile() to choose input file');
    }
    
    read(len) {
        const available = Math.min(len, this.buffer.length);
        if (available === 0) {return null;}
        
        return new Uint8Array(this.buffer.splice(0, available));
    }
    
    notifySubscribers() {
        for (const callback of this.subscribers) {
            callback();
        }
    }
}

/**
 * Composite stdin provider that tries multiple strategies
 */
export class CompositeStdinProvider {
    constructor() {
        this.providers = [];
        this.buffer = [];
        this.subscribers = new Set();
        this.waitingReads = [];
        
        this.initializeProviders();
    }
    
    initializeProviders() {
        // Try to initialize providers in order of preference
        try {
            // Hidden input is usually the best for interactive use
            this.hiddenInput = new HiddenInputStdin();
            this.providers.push(this.hiddenInput);
        } catch (err) {}
        
        try {
            // Clipboard monitoring as secondary
            this.clipboard = new ClipboardStdin();
            this.providers.push(this.clipboard);
        } catch (err) {}
        
        try {
            // File input as fallback
            this.fileInput = new FileStdin();
            this.providers.push(this.fileInput);
        } catch (err) {}
        
        try {
            // WebSocket if available
            this.webSocket = new WebSocketStdin();
            this.providers.push(this.webSocket);
        } catch (err) {}
        
        // Set up polling for all providers
        this.pollProviders();
    }
    
    pollProviders() {
        setInterval(() => {
            for (const provider of this.providers) {
                if (provider.buffer && provider.buffer.length > 0) {
                    this.buffer.push(...provider.buffer);
                    provider.buffer = [];
                    this.notifySubscribers();
                    this.processWaitingReads();
                }
            }
        }, 100);
    }
    
    read(len) {
        if (this.buffer.length >= len) {
            return new Uint8Array(this.buffer.splice(0, len));
        }
        
        // Return what we have
        if (this.buffer.length > 0) {
            return new Uint8Array(this.buffer.splice(0, this.buffer.length));
        }
        
        return null;
    }
    
    blockingRead(len) {
        if (this.buffer.length >= len) {
            return new Uint8Array(this.buffer.splice(0, len));
        }
        
        // Try prompt as blocking fallback
        if (typeof window !== 'undefined' && window.prompt) {
            const input = window.prompt('Enter input:');
            if (input !== null) {
                const encoded = new TextEncoder().encode(input + '\n');
                this.buffer.push(...encoded);
                
                const available = Math.min(len, this.buffer.length);
                return new Uint8Array(this.buffer.splice(0, available));
            }
        }
        
        // Return empty if no blocking method available
        return new Uint8Array(0);
    }
    
    async asyncRead(len) {
        if (this.buffer.length >= len) {
            return new Uint8Array(this.buffer.splice(0, len));
        }
        
        // Wait for data
        return new Promise((resolve) => {
            this.waitingReads.push({ len, resolve });
            this.processWaitingReads();
        });
    }
    
    processWaitingReads() {
        const remaining = [];
        
        for (const { len, resolve } of this.waitingReads) {
            if (this.buffer.length >= len) {
                resolve(new Uint8Array(this.buffer.splice(0, len)));
            } else if (this.buffer.length > 0) {
                resolve(new Uint8Array(this.buffer.splice(0, this.buffer.length)));
            } else {
                remaining.push({ len, resolve });
            }
        }
        
        this.waitingReads = remaining;
    }
    
    subscribe(callback) {
        this.subscribers.add(callback);
        
        // Check if we already have data
        if (this.buffer.length > 0) {
            callback();
        }
        
        return () => this.subscribers.delete(callback);
    }
    
    notifySubscribers() {
        for (const callback of this.subscribers) {
            callback();
        }
    }
    
    dispose() {
        // Cleanup
        this.providers = [];
        this.subscribers.clear();
        this.waitingReads = [];
    }
}

// Export singleton instance
export const stdinProvider = new CompositeStdinProvider();