/** Browser shim for Ora */
export default function ora(_options?: unknown) {
    return new Ora();
}

class Ora {
    text = "";
    start() {}
    stop() {}
}
