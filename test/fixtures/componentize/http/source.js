export async function test () {
  const res = await fetch('https://www.google.com');
  return await res.text();
}
