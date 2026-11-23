interface MatchAmount {
	remaining: number;
}

const matchLimit = 5;
const searchBudget = 75_000;

export function findReceiptMatches<T extends MatchAmount>(
	candidates: readonly T[],
	target: number,
) {
	const matches: T[][] = [];
	if (!Number.isSafeInteger(target) || target <= 0)
		return { matches, incomplete: false };

	const entries = candidates
		.filter(
			({ remaining }) =>
				Number.isSafeInteger(remaining) && remaining > 0 && remaining <= target,
		)
		.map((candidate, index) => ({ candidate, index }));
	const smaller = entries.filter(
		({ candidate }) => candidate.remaining < target,
	);

	const save = (group: typeof entries) => {
		matches.push(
			group
				.slice()
				.sort((left, right) => left.index - right.index)
				.map(({ candidate }) => candidate),
		);
		return matches.length > matchLimit;
	};
	const limited = () => ({
		matches: matches.slice(0, matchLimit),
		incomplete: true,
	});

	for (const entry of entries) {
		if (entry.candidate.remaining === target && save([entry])) return limited();
	}
	const seen = new Map<number, typeof entries>();
	for (const entry of smaller) {
		const amount = entry.candidate.remaining;
		for (const other of seen.get(target - amount) ?? []) {
			if (save([other, entry])) return limited();
		}
		const sameAmount = seen.get(amount);
		if (sameAmount) sameAmount.push(entry);
		else seen.set(amount, [entry]);
	}

	// Look for groups of three or more. The suffix bound cuts off branches
	// that cannot reach the target, and the explicit stack avoids recursion.
	const ordered = smaller.sort(
		(left, right) =>
			right.candidate.remaining - left.candidate.remaining ||
			left.index - right.index,
	);
	const suffix = new Array<number>(ordered.length + 1).fill(0);
	for (let index = ordered.length - 1; index >= 0; index -= 1) {
		suffix[index] = Math.min(
			target,
			suffix[index + 1] + ordered[index].candidate.remaining,
		);
	}
	const stack = [{ next: 0, left: target }];
	const chosen: typeof entries = [];
	let steps = 0;
	while (stack.length && steps < searchBudget) {
		steps += 1;
		const frame = stack[stack.length - 1];
		if (frame.next >= ordered.length || suffix[frame.next] < frame.left) {
			stack.pop();
			chosen.pop();
			continue;
		}
		const entry = ordered[frame.next++];
		const remainder = frame.left - entry.candidate.remaining;
		if (remainder < 0) continue;
		if (remainder === 0) {
			if (chosen.length >= 2 && save([...chosen, entry])) return limited();
			continue;
		}
		chosen.push(entry);
		stack.push({ next: frame.next, left: remainder });
	}
	return { matches, incomplete: stack.length > 0 };
}

export function findNearReceiptMatches<T extends MatchAmount>(
	candidates: readonly T[],
	target: number,
	available: (item: T) => number,
) {
	const nearMatches: {
		difference: number;
		lines: { item: T; amount: number }[];
	}[] = [];
	const tolerance = Math.floor(target / 20);
	if (!Number.isSafeInteger(target) || tolerance < 1)
		return { nearMatches, incomplete: false };
	const upper = Math.min(Number.MAX_SAFE_INTEGER, target + tolerance);
	const lower = target - tolerance;
	const ordered = candidates
		.filter(
			({ remaining }) =>
				Number.isSafeInteger(remaining) && remaining > 0 && remaining <= upper,
		)
		.map((item, index) => ({ item, index }))
		.sort((a, b) => b.item.remaining - a.item.remaining);
	type Entry = (typeof ordered)[number];
	const chosen: Entry[] = [];
	let steps = 0;
	function consider(last: Entry, total: number) {
		const difference = target - total;
		if (!difference || total < lower) return;
		const size = chosen.length + 1;
		const position = nearMatches.findIndex(
			(group) =>
				Math.abs(difference) < Math.abs(group.difference) ||
				(Math.abs(difference) === Math.abs(group.difference) &&
					size < group.lines.length),
		);
		if (position < 0 && nearMatches.length >= matchLimit) return;
		// Building a suggestion also costs work proportional to the group size.
		if (size > 1) steps += size;

		const group = [...chosen, last].sort((a, b) => a.index - b.index);
		const amounts = group.map(({ item }) =>
			Math.min(item.remaining, available(item)),
		);
		let left = Math.min(total, target);
		if (
			left < size ||
			amounts.some((amount) => amount <= 0) ||
			amounts.reduce((sum, amount) => sum + amount, 0) < left
		)
			return;
		const lines = group.map(({ item }, index) => {
			// Pay in the original order, reserving one đồng for each remaining invoice.
			const amount = Math.min(amounts[index], left - (size - index - 1));
			left -= amount;
			return { item, amount };
		});
		nearMatches.splice(position < 0 ? nearMatches.length : position, 0, {
			difference,
			lines,
		});
		if (nearMatches.length > matchLimit) nearMatches.pop();
	}

	// Score single invoices first so they are considered even when the search budget is exhausted.
	for (const entry of [...ordered].sort((a, b) => a.index - b.index))
		consider(entry, entry.item.remaining);
	const suffix = new Array<number>(ordered.length + 1).fill(0);
	for (let index = ordered.length - 1; index >= 0; index -= 1)
		suffix[index] = Math.min(
			upper,
			suffix[index + 1] + ordered[index].item.remaining,
		);
	const stack = [{ next: 0, total: 0 }];
	while (stack.length && steps < searchBudget) {
		steps += 1;
		const frame = stack[stack.length - 1];
		const worst = nearMatches[matchLimit - 1];
		const minimum = worst ? target - Math.abs(worst.difference) : lower;
		const maximum = worst
			? Math.min(upper, target + Math.abs(worst.difference))
			: upper;
		if (
			frame.next >= ordered.length ||
			frame.total >= maximum ||
			suffix[frame.next] < minimum - frame.total
		) {
			stack.pop();
			chosen.pop();
			continue;
		}
		const entry = ordered[frame.next++];
		if (entry.item.remaining > maximum - frame.total) continue;
		const total = frame.total + entry.item.remaining;
		if (chosen.length) consider(entry, total);
		if (total < maximum) {
			chosen.push(entry);
			stack.push({ next: frame.next, total });
		}
	}
	return { nearMatches, incomplete: stack.length > 0 };
}
