import { AppLogo } from "../../shared/ui/AppLogo";

export function AccessBrand({
	title,
	subtitle,
	logoDataUrl,
}: {
	title: string;
	subtitle: string;
	logoDataUrl: string | null;
}) {
	return (
		<div className="access-brand">
			<div className="brand-mark" aria-hidden="true">
				<AppLogo logoDataUrl={logoDataUrl} />
			</div>
			<div className="brand-copy">
				<strong>{title}</strong>
				{subtitle && <span>{subtitle}</span>}
			</div>
		</div>
	);
}
