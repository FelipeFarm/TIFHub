// Replaced by `npm run cf-typegen` (wrangler types). Kept minimal so the project type-checks before that.
interface CloudflareEnv {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  MONDAY_BOARD_ID: string;
  HUB_URL: string;
  MONDAY_API_TOKEN?: string;
  MONDAY_ITEM_PREFIX?: string;
}
