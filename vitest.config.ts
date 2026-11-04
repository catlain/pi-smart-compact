import path from "node:path";
import { createConfig } from "../vitest.config.base";

export default createConfig({
	alias: {
		"@earendil-works/pi-coding-agent": true,
		"@earendil-works/pi-ai": true,
		"@earendil-works/pi-ai/compat": path.resolve(
			__dirname,
			"../_sdk-link/node_modules/@earendil-works/pi-ai/dist/compat.js",
		),
	},
	include: ["**/*.test.ts", "tests/**/*.test.ts"],
	test: {
		testTimeout: 10000,
		fileParallelism: false,
	},
});
