import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		environmentOptions: {
			jsdom: { url: "http://localhost/" },
		},
		setupFiles: ["tests/setup.ts"],
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "json-summary"],
			reportsDirectory: "coverage",
			include: [
				"src/domain/assignments/assignment.service.ts",
				"src/domain/customers/customer.service.ts",
				"src/domain/reconciliation/reconciliation.selectors.ts",
				"src/domain/orders/order.model.ts",
				"src/shared/lib/date.ts",
				"src/features/customers/customer.import.ts",
				"src/shared/storage/localStorage.ts",
			],
			thresholds: {
				lines: 75,
				functions: 75,
				statements: 75,
				branches: 65,
			},
		},
	},
});
