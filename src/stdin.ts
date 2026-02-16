export async function readStdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks)
    .toString("utf-8")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}
