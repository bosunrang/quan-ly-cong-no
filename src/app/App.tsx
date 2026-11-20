import { Notice } from "../shared/ui/Notice";
import {
	type ComponentProps,
	lazy,
	Suspense,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { canOpenPage } from "../domain/access/accounts.model";
import {
	accountAwaitingPassword,
	accountSession,
	type AccountSession,
	restoreLanSession,
	sessionAccount,
	signOutLan,
} from "../domain/access/accounts.repository";
import { InitialPasswordPage } from "../features/accounts/InitialPasswordPage";
import { LoginPage } from "../features/accounts/LoginPage";
import { pageMeta } from "./pageConfig";
import { Header } from "./layout/Header";
import { Sidebar } from "./layout/Sidebar";
import { useAppSettings } from "../features/settings/useAppSettings";
import { useStorageIssue } from "../shared/hooks/useStorageIssue";
import type { PageId } from "../types";
import { setActivityActor } from "../shared/storage/activityLog";
import { reportStorageIssue } from "../shared/storage/storageIssues";
import { navItems } from "./navigation";
import { useLocalAccounts } from "./useLocalAccounts";

// Mỗi trang tải riêng khi được mở lần đầu, để màn hình đăng nhập và
// trang tổng quan không phải chờ mã của các trang ít dùng.
const AccountsPage = lazy(() =>
	import("../features/accounts/AccountsPage").then((m) => ({
		default: m.AccountsPage,
	})),
);
const ActivityPage = lazy(() =>
	import("../features/activity/ActivityPage").then((m) => ({
		default: m.ActivityPage,
	})),
);
const Dashboard = lazy(() =>
	import("../features/dashboard/Dashboard").then((m) => ({
		default: m.Dashboard,
	})),
);
const CustomersPage = lazy(() =>
	import("../features/customers/CustomersPage").then((m) => ({
		default: m.CustomersPage,
	})),
);
const MisaDataPage = lazy(() =>
	import("../features/misa/MisaDataPage").then((m) => ({
		default: m.MisaDataPage,
	})),
);
const PaymentsPage = lazy(() =>
	import("../features/payments/PaymentsPage").then((m) => ({
		default: m.PaymentsPage,
	})),
);
const SalesReceivablesPage = lazy(() =>
	import("../features/receivables/SalesReceivablesPage").then((m) => ({
		default: m.SalesReceivablesPage,
	})),
);
const SalesInvoiceDrawer = lazy(() =>
	import("../features/receivables/SalesInvoiceDrawer").then((m) => ({
		default: m.SalesInvoiceDrawer,
	})),
);
// Ngăn chi tiết hóa đơn có Suspense riêng để lần mở đầu không làm trống cả trang.
function DashboardInvoiceDrawer(
	props: ComponentProps<typeof SalesInvoiceDrawer>,
) {
	return (
		<Suspense fallback={null}>
			<SalesInvoiceDrawer {...props} />
		</Suspense>
	);
}
const ReportsPage = lazy(() =>
	import("../features/reports/ReportsPage").then((m) => ({
		default: m.ReportsPage,
	})),
);
const SalesPage = lazy(() =>
	import("../features/sales/SalesPage").then((m) => ({ default: m.SalesPage })),
);
const SettingsPage = lazy(() =>
	import("../features/settings/SettingsPage").then((m) => ({
		default: m.SettingsPage,
	})),
);

const accountPageOptions = navItems.map((item) => ({
	...item,
	description: pageMeta[item.id].subtitle,
}));

function App() {
	const [requestedPage, setActivePage] = useState<PageId>("dashboard");
	const [collapsed, setCollapsed] = useState(false);
	const [session, setSession] = useState<AccountSession>();
	const [restoring, setRestoring] = useState(true);
	const { accounts, error: accountsError, refresh } = useLocalAccounts();
	const signedInAccount = sessionAccount(accounts, session);
	const pendingPassword = accountAwaitingPassword(accounts, session);
	const actor = accountsError ? undefined : signedInAccount;
	const activePage =
		actor &&
		(canOpenPage(actor, requestedPage)
			? requestedPage
			: navItems.find(({ id }) => canOpenPage(actor, id))?.id);
	const {
		settings,
		saveSettings,
		error: settingsError,
		loading: settingsLoading,
	} = useAppSettings(actor?.sessionVersion);
	const { storageIssue, clearStorageIssue } = useStorageIssue();

	useEffect(() => {
		let cancelled = false;
		void restoreLanSession()
			.then((restored) => {
				if (cancelled) return;
				setSession(restored);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setRestoring(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useLayoutEffect(() => {
		setActivityActor(actor);
		return () => setActivityActor(undefined);
	}, [actor]);

	useEffect(() => {
		const root = document.documentElement;
		const pointerFocus = () => {
			root.dataset.focusInput = "pointer";
		};
		const keyboardFocus = (event: KeyboardEvent) => {
			const activateControl =
				(event.key === "Enter" || event.key === " ") &&
				event.target instanceof HTMLElement &&
				event.target.matches(
					'button, a[href], input:is([type="checkbox"], [type="radio"])',
				);
			if (
				event.key === "Tab" ||
				event.key.startsWith("Arrow") ||
				activateControl
			)
				delete root.dataset.focusInput;
		};
		document.addEventListener("pointerdown", pointerFocus, true);
		document.addEventListener("keydown", keyboardFocus, true);
		return () => {
			document.removeEventListener("pointerdown", pointerFocus, true);
			document.removeEventListener("keydown", keyboardFocus, true);
			delete root.dataset.focusInput;
		};
	}, []);

	function openPage(page: PageId) {
		if (!actor || !canOpenPage(actor, page) || page === activePage) return;
		setActivePage(page);
	}

	async function logout() {
		try {
			await signOutLan();
		} catch (error) {
			reportStorageIssue(
				"Máy chủ chưa xác nhận đăng xuất. Hãy thử lại.",
				error,
			);
			return;
		}

		clearStorageIssue();
		setSession(undefined);
		setActivePage("dashboard");
	}

	if (restoring || settingsLoading) {
		return (
			<main className="access-login" aria-busy="true">
				<div className="panel access-login-panel" role="status">
					Đang kết nối máy chủ…
				</div>
			</main>
		);
	}

	if (accountsError || (actor && settingsError)) {
		return (
			<main className="access-login">
				<section className="panel access-login-panel">
					<Notice tone="danger" title="Không thể mở tài khoản" announce>
						{accountsError || settingsError}
					</Notice>
					<button
						className="button secondary"
						type="button"
						onClick={accountsError ? refresh : () => window.location.reload()}
					>
						Thử lại
					</button>
				</section>
			</main>
		);
	}
	if (pendingPassword && session) {
		return (
			<InitialPasswordPage
				key={session.version}
				session={session}
				username={pendingPassword.username}
				logoDataUrl={settings.logoDataUrl}
				sessionError={storageIssue}
				onComplete={(account) => {
					setSession(accountSession(account));
				}}
				onCancel={() => void logout()}
			/>
		);
	}
	if (!actor) {
		return (
			<LoginPage
				settings={settings}
				onSignIn={(account) => {
					setSession(accountSession(account));
					setActivePage("dashboard");
				}}
			/>
		);
	}
	if (!activePage) {
		return (
			<main className="access-login">
				<Notice
					tone="warning"
					title="Tài khoản chưa được cấp thẻ truy cập"
					announce
				>
					Liên hệ quản trị viên để được cấp quyền.
				</Notice>
			</main>
		);
	}
	const meta = pageMeta[activePage];
	const role = actor.role;
	const openMisa = canOpenPage(actor, "misa")
		? () => openPage("misa")
		: undefined;
	const openPayments = canOpenPage(actor, "payments")
		? () => openPage("payments")
		: undefined;
	const openCustomers = canOpenPage(actor, "customers")
		? () => openPage("customers")
		: undefined;

	function renderPage() {
		if (activePage === "dashboard")
			return (
				<Dashboard
					onOpenMisa={openMisa}
					onOpenPayments={openPayments}
					InvoiceDrawer={DashboardInvoiceDrawer}
				/>
			);
		if (activePage === "misa") return <MisaDataPage />;
		if (activePage === "payments")
			return <PaymentsPage onOpenMisa={openMisa} />;
		if (activePage === "reports")
			return <ReportsPage settings={settings} onOpenMisa={openMisa} />;
		if (activePage === "receivables")
			return (
				<SalesReceivablesPage
					showEmployeeFilter={role === "admin"}
					canEditOpeningBalance={role !== "viewer"}
					onOpenMisa={openMisa}
					onOpenCustomers={openCustomers}
				/>
			);
		if (activePage === "customers")
			return <CustomersPage showEmployeeFilter={role === "admin"} />;
		if (activePage === "sales")
			return (
				<SalesPage linkableAccounts={role === "admin" ? accounts : undefined} />
			);
		if (activePage === "users")
			return (
				<AccountsPage
					accounts={accounts}
					pageOptions={accountPageOptions}
					session={session}
					onSignIn={(account) => {
						setSession(accountSession(account));
					}}
				/>
			);
		if (activePage === "audit") return <ActivityPage />;
		if (activePage === "settings")
			return <SettingsPage settings={settings} onSave={saveSettings} />;

		return null;
	}

	return (
		<div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
			<Sidebar
				activePage={activePage}
				collapsed={collapsed}
				settings={settings}
				access={actor}
				onChange={openPage}
				onToggle={() => setCollapsed((value) => !value)}
			/>
			<div className="app-main">
				<Header
					title={meta.title}
					subtitle={meta.subtitle}
					name={actor.name}
					role={role}
					onLogout={signedInAccount ? () => void logout() : undefined}
					onMenuClick={() => setCollapsed((value) => !value)}
				/>
				<main className="page-content">
					{storageIssue && (
						<div className="app-notice">
							<Notice tone="danger" announce onDismiss={clearStorageIssue}>
								{storageIssue}
							</Notice>
						</div>
					)}
					<Suspense
						fallback={
							<div className="page-loading" role="status">
								Đang tải trang…
							</div>
						}
					>
						{renderPage()}
					</Suspense>
				</main>
			</div>
		</div>
	);
}

export default App;
