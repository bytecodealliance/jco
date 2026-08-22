export async function testTimers(): Promise<boolean> {
    let ran = false;
    await new Promise<void>((resolve) => {
        setTimeout(() => {
            ran = true;
            resolve();
        }, 0);
    });
    return ran;
}
