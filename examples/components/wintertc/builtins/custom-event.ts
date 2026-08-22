export function testCustomEvent(): boolean {
    const event = new CustomEvent<string>('portable', { detail: 'events' });
    return event.type === 'portable' && event.detail === 'events';
}
