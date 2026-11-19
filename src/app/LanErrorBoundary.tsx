import { Component, type ReactNode } from "react";
import { Notice } from "../shared/ui/Notice";

export class LanErrorBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<main className="access-login">
				<section className="panel access-login-panel">
					<Notice tone="danger" title="Không thể tải dữ liệu công ty" announce>
						Kiểm tra kết nối tới máy chủ và tải lại trang.
					</Notice>
					<button
						type="button"
						className="button secondary"
						onClick={() => window.location.reload()}
					>
						Tải lại trang
					</button>
				</section>
			</main>
		);
	}
}
