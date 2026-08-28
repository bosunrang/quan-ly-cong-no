import { useEffect, useState } from "react";
import {
	consumeStorageIssue,
	subscribeStorageIssues,
} from "../storage/localStorage";

export function useStorageIssue() {
	const [issue, setIssue] = useState<string>();

	useEffect(() => {
		const pending = consumeStorageIssue();
		if (pending) setIssue(pending);
		return subscribeStorageIssues(setIssue);
	}, []);

	return { storageIssue: issue, clearStorageIssue: () => setIssue(undefined) };
}
