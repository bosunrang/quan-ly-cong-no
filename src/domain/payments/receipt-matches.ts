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
