export function testAtob(): boolean {
    return atob('Y29tcG9uZW50LW1vZGVs') === 'component-model';
}
