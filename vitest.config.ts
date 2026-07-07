export default {
  test: {
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 10000,
    retry: 0,
  },
};
