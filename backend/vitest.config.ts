import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The engine is consumed as TypeScript source via workspace symlink;
    // tell Vitest to transform it rather than treat it as an external dep.
    server: {
      deps: {
        inline: [/@container\/(engine|bot)/],
      },
    },
  },
});
