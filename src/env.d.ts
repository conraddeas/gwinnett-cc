/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly ENCHARGE_WRITE_KEY: string;
  readonly ADMIN_PASSWORD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
