import PDFDocument from 'pdfkit';
type PDFDoc = InstanceType<typeof PDFDocument>;
type OrderRecord = {
    id: number;
    client_id: number;
    client_short_name: string;
    order_number: string | null;
    received_at: string;
    deadline_at: string | null;
    specialization: string | null;
    specialization_name: string | null;
    language_pair_label: string | null;
    unit_name: string;
    quantity: number;
    rate_per_unit: number;
    amount: number;
    order_vat_rate?: number | null;
    order_vat_code?: string | null;
};
type ClientRecord = {
    id: number;
    name: string;
    short_name: string;
    street: string | null;
    building: string | null;
    local: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    address_extra: string | null;
    nip: string | null;
    phone: string | null;
};
export declare function buildOrderConfirmationPdf(doc: PDFDoc, order: OrderRecord, client: ClientRecord | null, settings: {
    company_name: string;
    first_name: string;
    last_name: string;
    personal_nip: string;
    personal_street: string;
    personal_building: string;
    personal_local: string;
    personal_postal_code: string;
    personal_city: string;
    personal_country: string;
    personal_address_extra: string;
    personal_phone: string;
    vat_rate: string;
}, lang: 'pl' | 'en', fonts: {
    normal: string;
    bold: string;
}): void;
type ContractorRecord = {
    name: string;
    short_name: string;
    street: string | null;
    building: string | null;
    local: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    address_extra: string | null;
    nip: string | null;
    phone: string | null;
};
/** PO dla podzlecenia: Wykonawca = contractor (odbiorca), Zleceniodawca = my (settings). */
export declare function buildOrderConfirmationPdfForSubcontract(doc: PDFDoc, order: OrderRecord, contractor: ContractorRecord | null, settings: {
    company_name: string;
    first_name: string;
    last_name: string;
    personal_nip: string;
    personal_street: string;
    personal_building: string;
    personal_local: string;
    personal_postal_code: string;
    personal_city: string;
    personal_country: string;
    personal_address_extra: string;
    personal_phone: string;
    vat_rate: string;
}, lang: 'pl' | 'en', fonts: {
    normal: string;
    bold: string;
}): void;
export declare function writeOrderConfirmationPdfToFile(filePath: string, order: OrderRecord, client: ClientRecord | null, settings: Record<string, string | null>, lang: 'pl' | 'en'): Promise<void>;
export declare function writeOrderConfirmationPdfForSubcontractToFile(filePath: string, order: OrderRecord & {
    subcontract_number?: string;
}, contractor: ContractorRecord | null, settings: Record<string, string | null>, lang: 'pl' | 'en'): Promise<void>;
export {};
