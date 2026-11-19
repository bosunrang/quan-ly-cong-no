export function cssPixels(
	style: CSSStyleDeclaration,
	token: `--${string}`,
): number {
	return Number.parseFloat(style.getPropertyValue(token)) || 0;
}
