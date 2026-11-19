import { useCallback, useEffect, useState } from "react";
import {
	readAccounts,
	subscribeAccounts,
} from "../domain/access/accounts.repository";

function snapshot() {
	try {
		return { accounts: readAccounts(), error: "" };
	} catch (reason) {
		return {
			accounts: [],
			error:
				reason instanceof Error
					? reason.message
					: "Không thể mở danh sách tài khoản.",
		};
	}
}

export function useLocalAccounts() {
	const [state, setState] = useState(snapshot);
	const refresh = useCallback(() => setState(snapshot()), []);
	useEffect(() => {
		const unsubscribe = subscribeAccounts(refresh);
		refresh();
		return unsubscribe;
	}, [refresh]);
	return { ...state, refresh };
}
