export async function testQueueMicrotask(): Promise<boolean> {
    let ran = false;
    await new Promise<void>((resolve) => {
        queueMicrotask(() => {
            ran = true;
            resolve();
        });
    });
    return ran;
}
