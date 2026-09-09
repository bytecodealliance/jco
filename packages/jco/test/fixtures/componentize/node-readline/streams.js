import { EventEmitter } from "node:events";

// The application supplies streams; no host or node:process capability is needed.
export class Input extends EventEmitter {
    resume() {
        this.paused = false;
        return this;
    }
    pause() {
        this.paused = true;
        return this;
    }
}
export class Output extends EventEmitter {
    text = "";
    writable = true;
    write(text, callback) {
        this.text += text;
        callback?.();
        return true;
    }
}

// A supplied signal for engines (including QuickJS) without AbortController.
// Node accepts this structural AbortSignal contract as well.
export function suppliedCancellation() {
    const listeners = new Set();
    const signal = {
        aborted: false,
        reason: undefined,
        addEventListener(_event, listener) {
            listeners.add(listener);
        },
        removeEventListener(_event, listener) {
            listeners.delete(listener);
        },
    };
    return {
        signal,
        abort(reason) {
            signal.aborted = true;
            signal.reason = reason;
            const callbacks = [...listeners];
            listeners.clear();
            for (const listener of callbacks) {
                listener();
            }
        },
    };
}
