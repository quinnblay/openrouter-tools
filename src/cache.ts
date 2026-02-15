import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CACHE_TTL = 300; // 5 minutes

function getCacheDir(): string {
  // When running from the project directory, use .cache/ there.
  // When running via npx (no local project), fall back to ~/.cache/or-pricing/
  const projectCache = join(process.cwd(), ".cache");
  if (existsSync(projectCache)) return projectCache;

  // Check if we're in the project dir by looking for package.json
  const pkgJson = join(process.cwd(), "package.json");
  if (existsSync(pkgJson)) return projectCache;

  // Also check script directory (for global install / npx)
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  const scriptCache = join(scriptDir, "..", ".cache");
  if (existsSync(scriptCache)) return scriptCache;

  // Fallback to home cache dir
  const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return join(home, ".cache", "or-pricing");
}

function ensureCacheDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readCache(filename: string): string | null {
  const cacheDir = getCacheDir();
  const cachePath = join(cacheDir, filename);

  if (!existsSync(cachePath)) return null;

  const now = Math.floor(Date.now() / 1000);
  const mtime = Math.floor(statSync(cachePath).mtimeMs / 1000);

  if (now - mtime >= CACHE_TTL) return null;

  return readFileSync(cachePath, "utf-8");
}

export function writeCache(filename: string, data: string): void {
  const cacheDir = getCacheDir();
  ensureCacheDir(cacheDir);
  writeFileSync(join(cacheDir, filename), data, "utf-8");
}

export function readCacheRaw(filename: string): string | null {
  const cacheDir = getCacheDir();
  const cachePath = join(cacheDir, filename);
  if (!existsSync(cachePath)) return null;
  return readFileSync(cachePath, "utf-8");
}

export function writeCacheRaw(filename: string, data: string): void {
  const cacheDir = getCacheDir();
  ensureCacheDir(cacheDir);
  writeFileSync(join(cacheDir, filename), data, "utf-8");
}
