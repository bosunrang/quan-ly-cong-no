import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { LanErrorBoundary } from "./app/LanErrorBoundary";
import { lanEndpoint } from "./shared/storage/lanStorage";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Không tìm thấy phần tử gốc của ứng dụng.");
const lan = lanEndpoint();

createRoot(root).render(
	<StrictMode>
		<LanErrorBoundary lan={Boolean(lan)}>
			<App />
		</LanErrorBoundary>
	</StrictMode>,
);
