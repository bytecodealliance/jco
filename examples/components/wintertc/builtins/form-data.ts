export function testFormData(): boolean {
    const form = new FormData();
    form.append('runtime', 'StarlingMonkey');
    return form.get('runtime') === 'StarlingMonkey' && form.has('runtime');
}
