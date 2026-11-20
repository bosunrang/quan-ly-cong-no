export function AppLogo({
	logoDataUrl,
	alt = "",
}: {
	logoDataUrl: string | null;
	alt?: string;
}) {
	return <img src={logoDataUrl || "/assets/app-icon.png"} alt={alt} />;
}
