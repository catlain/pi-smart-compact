import path from "node:path";
import { defineConfig } from "vitest/config";

const globalNodeModules =
	"/home/lain/.local/share/fnm/node-versions/v22.22.2/installation/lib/node_modules";

export default defineConfig({
	resolve: {
		alias: {
			"@earendil-works/pi-coding-agent": path.resolve(
				globalNodeModules,
				"@earendil-works/pi-coding-agent/dist/index.js",
			),
			"@earendil-works/pi-ai": path.resolve(
				globalNodeModules,
				"@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/index.js",
			),
		},
	},
	test: {
		include: ["**/*.test.ts", "tests/**/*.test.ts"],
		environment: "node",
		testTimeout: 10000,
		fileParallelism: false,
		coverage: {
			provider: "v8" as const,
			reporter: ["text", "html"],
		},
	},
});
