const STORAGE_ISSUE_EVENT = "cong-no:storage-issue";
let pendingStorageIssue: string | undefined;

export function reportStorageIssue(message: string, cause?: unknown): void {
	pendingStorageIssue = message;
	console.error(message, cause);
	if (typeof window !== "undefined") {
		queueMicrotask(() =>
			window.dispatchEvent(
				new CustomEvent<string>(STORAGE_ISSUE_EVENT, { detail: message }),
			),
		);
	}
}

export function consumeStorageIssue(): string | undefined {
	const issue = pendingStorageIssue;
	pendingStorageIssue = undefined;
	return issue;
}

export function subscribeStorageIssues(
	listener: (message: string) => void,
): () => void {
	if (typeof window === "undefined") return () => undefined;
	const handleIssue = (event: Event) =>
		listener((event as CustomEvent<string>).detail);
	window.addEventListener(STORAGE_ISSUE_EVENT, handleIssue);
	return () => window.removeEventListener(STORAGE_ISSUE_EVENT, handleIssue);
}
