/** POST the guest's list and return the bytes echoed by the server as text. */
export async function postValues(url, values) {
    const response = await fetch(url, { method: 'POST', body: JSON.stringify(values) });
    return response.text();
}
