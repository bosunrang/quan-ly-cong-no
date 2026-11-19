export interface MisaSalesLine {
	rowNumber: number;
	date: string;
	documentNumber: string;
	invoiceNumber: string;
	customerName: string;
	productName: string;
	unit: string;
	quantity: number | null;
	unitPrice: number | null;
	salesAmount: number | null;
	paymentTotal: number | null;
	origin?: { fileName: string; rowNumber: number };
	source?: {
		customerCode: string;
		invoiceSeries: string;
		invoiceDate: string;
		postingDate?: string;
		debitAccount?: string;
		productCode?: string;
		lotNumber?: string;
	};
}

export interface MisaSalesBook {
	fileName: string;
	importedAt: string;
	rows: MisaSalesLine[];
}
