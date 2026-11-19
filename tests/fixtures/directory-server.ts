import { vi } from "vitest";
import * as transport from "../../src/shared/api/client";
import { defaultSettings } from "../../src/domain/settings/settings.model";

export function directoryServer(
	customers: unknown[] = [],
	employees: unknown[] = [],
) {
	const datasets = new Map<string, unknown>([
		["customers", customers],
		["employees", employees],
		["settings", { data: defaultSettings, revision: "test-revision" }],
		["branding", defaultSettings],
	]);
	const api = vi
		.spyOn(transport, "api")
		.mockImplementation(async (_method, path) => datasets.get(path) as never);
	return { datasets, api };
}
