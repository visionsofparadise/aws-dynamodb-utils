module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	verbose: true,
	rootDir: 'src/',
	timers: 'fake',
	globalSetup: '../node_modules/@shelf/jest-dynamodb/setup.js',
	globalTeardown: '../node_modules/@shelf/jest-dynamodb/teardown.js'
};
