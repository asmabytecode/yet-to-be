// Чекає, доки URL почне відповідати 2xx (наприклад, readiness API після `docker compose up`).
//   node scripts/wait-for.mjs http://localhost:8080/api/v1/health/ready [timeoutSeconds=120]

export async function waitFor(
  url,
  { timeoutMs = 120_000, intervalMs = 1_000, fetchImpl = fetch } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `${url} is not ready after ${Math.round(timeoutMs / 1000)}s (last: ${lastError})`,
  );
}

const isMain = process.argv[1]?.endsWith('wait-for.mjs');
if (isMain) {
  const [url, seconds = '120'] = process.argv.slice(2);
  if (!url) {
    console.error('Usage: node scripts/wait-for.mjs <url> [timeoutSeconds]');
    process.exit(2);
  }
  try {
    await waitFor(url, { timeoutMs: Number(seconds) * 1000 });
    console.log(`Ready: ${url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
