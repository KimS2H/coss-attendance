// 테스트 설정. 테스트용 PostgreSQL을 따로 켜서(test/global-setup.mjs) 실제 DB로 확인한다.
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, types: ['node', 'jest', 'multer'] } }] },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.mjs',
  globalTeardown: '<rootDir>/test/global-teardown.mjs',
  testTimeout: 60000,
};
