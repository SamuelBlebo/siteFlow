// Waits for something the server does a moment later (Cloud Function triggers)
export async function waitFor(read, check, { timeout = 15000, every = 250 } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await read();
    if (check(last)) return last;
    if (Date.now() > end) throw new Error(`Timed out waiting; last value: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, every));
  }
}
