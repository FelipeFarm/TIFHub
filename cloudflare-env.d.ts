// Replaced by `npm run cf-typegen` (wrangler types). Kept minimal so the project type-checks before that.
interface CloudflareEnv {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
}
