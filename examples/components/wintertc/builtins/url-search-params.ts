export function testUrlSearchParams(): boolean {
    const params = new URLSearchParams('api=url&api=search-params');
    params.append('portable', 'true');
    return params.getAll('api').join(',') === 'url,search-params' && params.get('portable') === 'true';
}
