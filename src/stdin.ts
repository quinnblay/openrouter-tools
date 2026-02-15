/**
 * Read model IDs from stdin when input is piped (one per line).
 * Returns an empty array if stdin is a TTY (interactive).
 */
export async function readStdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks)
    .toString("utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
