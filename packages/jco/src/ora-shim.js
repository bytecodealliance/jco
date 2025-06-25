/** Browser shim for Ora */
export default function ora() {
    return new Ora();
}

class Ora {
    start() {}
    stop() {}
}
