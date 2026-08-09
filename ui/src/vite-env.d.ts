/// <reference types="vite/client" />

/**
 * The hub's version, injected by `vite.config.ts` from the root package.json at build time. Declared
 * here so it type-checks as a plain string wherever the shell reads it (`shell/Footer.tsx`).
 */
declare const __HUB_VERSION__: string;
