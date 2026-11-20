import { normalizeVietnamese } from "./vietnamese-text.mjs";

export const provinces = [
	"An Giang",
	"Bắc Ninh",
	"Cà Mau",
	"Cao Bằng",
	"Cần Thơ",
	"Đà Nẵng",
	"Đắk Lắk",
	"Điện Biên",
	"Đồng Nai",
	"Đồng Tháp",
	"Gia Lai",
	"Hà Nội",
	"Hà Tĩnh",
	"Hải Phòng",
	"Huế",
	"Hưng Yên",
	"Khánh Hòa",
	"Lai Châu",
	"Lâm Đồng",
	"Lạng Sơn",
	"Lào Cai",
	"Nghệ An",
	"Ninh Bình",
	"Phú Thọ",
	"Quảng Ngãi",
	"Quảng Ninh",
	"Quảng Trị",
	"Sơn La",
	"Tây Ninh",
	"Thái Nguyên",
	"Thanh Hóa",
	"TP Hồ Chí Minh",
	"Tuyên Quang",
	"Vĩnh Long",
] as const;

// Quy tắc bỏ dấu nằm ở tệp .mjs để máy chủ (SQLite) dùng đúng cùng một hàm.
export { normalizeVietnamese };

const provinceAliases: Record<(typeof provinces)[number], string[]> = {
	"An Giang": ["an giang", "kien giang"],
	"Bắc Ninh": ["bac ninh", "bac giang"],
	"Cà Mau": ["ca mau", "bac lieu"],
	"Cao Bằng": ["cao bang"],
	"Cần Thơ": ["can tho", "hau giang", "soc trang"],
	"Đà Nẵng": ["da nang", "quang nam"],
	"Đắk Lắk": ["dak lak", "dak lac", "dac lac", "dac lak", "phu yen"],
	"Điện Biên": ["dien bien"],
	"Đồng Nai": ["dong nai", "binh phuoc", "nhon trach"],
	"Đồng Tháp": ["dong thap", "tien giang"],
	"Gia Lai": ["gia lai", "binh dinh"],
	"Hà Nội": ["ha noi"],
	"Hà Tĩnh": ["ha tinh"],
	"Hải Phòng": ["hai phong", "hai duong"],
	Huế: ["thanh pho hue", "tp hue", "thua thien hue", "hue"],
	"Hưng Yên": ["hung yen", "thai binh"],
	"Khánh Hòa": ["khanh hoa", "ninh thuan"],
	"Lai Châu": ["lai chau"],
	"Lâm Đồng": ["lam dong", "dak nong", "binh thuan"],
	"Lạng Sơn": ["lang son"],
	"Lào Cai": ["lao cai", "yen bai"],
	"Nghệ An": ["nghe an"],
	"Ninh Bình": ["ninh binh", "ha nam", "nam dinh"],
	"Phú Thọ": ["phu tho", "vinh phuc", "hoa binh"],
	"Quảng Ngãi": ["quang ngai", "kon tum"],
	"Quảng Ninh": ["quang ninh"],
	"Quảng Trị": ["quang tri", "quang binh"],
	"Sơn La": ["son la"],
	"Tây Ninh": ["tay ninh", "long an"],
	"Thái Nguyên": ["thai nguyen", "bac kan"],
	"Thanh Hóa": ["thanh hoa"],
	"TP Hồ Chí Minh": [
		"thanh pho ho chi minh",
		"tp ho chi minh",
		"tp hcm",
		"tphcm",
		"ho chi minh",
		"binh duong",
		"ba ria vung tau",
	],
	"Tuyên Quang": ["tuyen quang", "ha giang"],
	"Vĩnh Long": ["vinh long", "ben tre", "tra vinh"],
};

export function inferProvince(address: unknown): string {
	const normalizedAddress = ` ${normalizeVietnamese(address)} `;
	let match: { province: string; index: number; length: number } | undefined;

	for (const [province, aliases] of Object.entries(provinceAliases)) {
		for (const alias of aliases) {
			const normalizedAlias = ` ${normalizeVietnamese(alias)} `;
			const index = normalizedAddress.lastIndexOf(normalizedAlias);
			if (
				index >= 0 &&
				(!match ||
					index > match.index ||
					(index === match.index && normalizedAlias.length > match.length))
			) {
				match = { province, index, length: normalizedAlias.length };
			}
		}
	}

	return match?.province ?? "";
}
