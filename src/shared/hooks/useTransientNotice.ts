import { useEffect, useRef, useState } from "react";
import type { NoticeTone } from "../ui/Notice";

interface Message {
	text: string;
	tone: NoticeTone;
}

export function useTransientNotice(defaultDuration = 2600) {
	const [notice, setNotice] = useState<Message>();
	const timeout = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(timeout.current), []);

	function dismissNotice() {
		window.clearTimeout(timeout.current);
		setNotice(undefined);
	}

	function showNotice(
		text: string,
		duration = defaultDuration,
		tone: NoticeTone = "success",
	) {
		window.clearTimeout(timeout.current);
		setNotice({ text, tone });
		timeout.current =
			tone === "danger"
				? undefined
				: window.setTimeout(dismissNotice, duration);
	}

	return { notice, showNotice, dismissNotice };
}
