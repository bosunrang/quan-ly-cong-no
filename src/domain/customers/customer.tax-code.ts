import type { Customer } from "./customer.model";
import { normalizeVietnamese } from "./customer.province";

type TaxCodeOwner = Pick<Customer, "name" | "taxCode">;

export function customerTaxCodes(customers: Iterable<TaxCodeOwner>) {
	const ownerByCode = new Map<string, string | null>();
	function add({ taxCode, name }: TaxCodeOwner) {
		if (!taxCode) return;
		const owner = ownerByCode.get(taxCode);
		const normalizedName = normalizeVietnamese(name);
		ownerByCode.set(
			taxCode,
			owner === undefined || owner === normalizedName ? normalizedName : null,
		);
	}
	for (const customer of customers) add(customer);
	return {
		add,
		conflicts({ taxCode, name }: TaxCodeOwner, allowSameOwner = false) {
			const owner = ownerByCode.get(taxCode);
			return (
				owner !== undefined &&
				(!allowSameOwner || !owner || owner !== normalizeVietnamese(name))
			);
		},
	};
}
