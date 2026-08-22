export function testEventTarget(): boolean {
    const target = new EventTarget();
    let received = false;
    target.addEventListener('portable', () => {
        received = true;
    });
    target.dispatchEvent(new Event('portable'));
    return received;
}
