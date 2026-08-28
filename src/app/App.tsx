import { useMemo, useState } from "react";
import { pageMeta, placeholderPages } from "./pageConfig";
import { Dashboard } from "../features/dashboard/Dashboard";
import { CustomersPage } from "../features/customers/CustomersPage";
import { Header } from "./layout/Header";
import { MisaDataPage } from "../features/misa/MisaDataPage";
import { PlaceholderPage } from "../shared/ui/PlaceholderPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { ReconcilePage } from "../features/reconciliation/ReconcilePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { SalesPage } from "../features/sales/SalesPage";
import { Sidebar } from "./layout/Sidebar";
import { useAppSettings } from "../features/settings/useAppSettings";
import { useStorageIssue } from "../shared/hooks/useStorageIssue";
import type { PageId } from "../types";

function App() {
	const [activePage, setActivePage] = useState<PageId>("dashboard");
	const [collapsed, setCollapsed] = useState(false);
	const { settings, saveSettings } = useAppSettings();
	const { storageIssue, clearStorageIssue } = useStorageIssue();
	const meta = pageMeta[activePage];

	const page = useMemo(() => {
		if (activePage === "dashboard")
			return <Dashboard onNavigate={setActivePage} />;
		if (activePage === "reconcile") return <ReconcilePage />;
		if (activePage === "misa") return <MisaDataPage />;
		if (activePage === "products") return <ProductsPage />;
		if (activePage === "customers") return <CustomersPage />;
		if (activePage === "sales") return <SalesPage />;
		if (activePage === "settings")
			return <SettingsPage settings={settings} onSave={saveSettings} />;

		const config = placeholderPages[activePage];
		if (!config) return null;
		return (
			<PlaceholderPage
				title={meta.title}
				description={config.description}
				icon={config.icon}
				bullets={config.bullets}
			/>
		);
	}, [activePage, meta.title, saveSettings, settings]);

	return (
		<div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
			{storageIssue && (
				<div className="storage-alert" role="alert">
					<span>{storageIssue}</span>
					<button type="button" onClick={clearStorageIssue}>
						Đóng
					</button>
				</div>
			)}
			<Sidebar
				activePage={activePage}
				collapsed={collapsed}
				settings={settings}
				onChange={setActivePage}
				onToggle={() => setCollapsed((value) => !value)}
			/>
			<div className="app-main">
				<Header
					title={meta.title}
					subtitle={meta.subtitle}
					onMenuClick={() => setCollapsed((value) => !value)}
				/>
				<main className="page-content">{page}</main>
			</div>
		</div>
	);
}

export default App;
