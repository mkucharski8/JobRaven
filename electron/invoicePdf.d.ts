import PDFDocument from 'pdfkit';
type PDFDoc = InstanceType<typeof PDFDocument>;
type OrderRecord = {
    id: number;
    client_id: number;
    client_short_name: string;
    order_number: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    invoice_sale_date?: string | null;
    payment_due_at: string | null;
    received_at: string;
    specialization: string | null;
    specialization_name: string | null;
    language_pair_label: string | null;
    invoice_description?: string | null;
    translation_type?: 'oral' | 'written' | null;
    service_name?: string | null;
    include_service_on_invoice?: number | null;
    include_language_pair_on_invoice?: number | null;
    include_invoice_description_on_invoice?: number | null;
    unit_name: string;
    quantity: number;
    rate_per_unit: number;
    amount: number;
    oral_duration?: number | null;
    oral_rate?: number | null;
    oral_net?: number | null;
    oral_gross?: number | null;
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
    country_code?: string | null;
    address_extra: string | null;
    nip: string | null;
    phone: string | null;
};
type BankAccountRecord = {
    bank_name: string;
    bank_address?: string;
    account_number: string;
    swift: string;
    currency: string;
} | null;
/** Definicje kodów VAT (na fakturze drukujemy zawsze kod, np. NP, ZW – nie etykietę). */
type VatCodeDef = {
    code_pl: string;
    label_pl: string;
    code_en: string;
    label_en: string;
};
export declare function buildInvoicePdf(doc: PDFDoc, order: OrderRecord, client: ClientRecord | null, settings: {
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
    vat_rate?: string;
    invoice_logo_path?: string;
}, lang: 'pl' | 'en', fonts: {
    normal: string;
    bold: string;
}, notes?: string, bankAccount?: BankAccountRecord, vatCodeDefinitions?: VatCodeDef[]): void;
/** Jedna faktura z wieloma pozycjami (każde zlecenie = jedna pozycja). */
export declare function buildInvoicePdfMulti(doc: PDFDoc, orders: OrderRecord[], client: ClientRecord | null, settings: {
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
    invoice_logo_path?: string;
}, lang: 'pl' | 'en', fonts: {
    normal: string;
    bold: string;
}, notes?: string, bankAccount?: BankAccountRecord): void;
export declare function writeInvoicePdfToFile(filePath: string, order: OrderRecord, client: ClientRecord | null, settings: Record<string, string | null>, lang: 'pl' | 'en', notes?: string, bankAccount?: BankAccountRecord): Promise<void>;
export declare function writeInvoicePdfMultiToFile(filePath: string, orders: OrderRecord[], client: ClientRecord | null, settings: Record<string, string | null>, lang: 'pl' | 'en', notes?: string, bankAccount?: BankAccountRecord): Promise<void>;
export {};
