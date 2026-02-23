/**
 * wFirma API – tworzenie faktury.
 * Dokumentacja: https://doc.wfirma.pl (moduł invoices).
 *
 * URL: POST https://api2.wfirma.pl/invoices/add?inputFormat=json&outputFormat=json[&company_id=...]
 * Autoryzacja: nagłówki HTTP  accessKey / secretKey  (ApiKeysAuth).
 * Ciało: JSON { "invoice": { contractor, invoicecontents, … } }
 */
export type OrderLike = {
    id: number;
    client_id: number;
    invoice_description?: string | null;
    translation_type?: 'oral' | 'written' | null;
    service_name?: string | null;
    include_service_on_invoice?: number | null;
    include_language_pair_on_invoice?: number | null;
    include_invoice_description_on_invoice?: number | null;
    language_pair_label?: string | null;
    unit_name: string;
    quantity: number;
    rate_per_unit: number;
    amount: number;
    oral_duration?: number | null;
    oral_rate?: number | null;
    oral_net?: number | null;
    order_vat_rate?: number | null;
    order_vat_code?: string | null;
    rate_currency?: string | null;
};
export type ClientLike = {
    name: string;
    short_name?: string;
    street: string | null;
    building: string | null;
    local: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    country_code?: string | null;
    address_extra: string | null;
    nip: string | null;
} | null;
export type SellerLike = Record<string, string | null | undefined>;
/**
 * Znajduje fakturę w wFirma po pełnym numerze. Zwraca ID faktury albo rzuca błąd.
 * Używa formatu jak w oficjalnym PHP (invoices.parameters.conditions["0"].condition). Weryfikuje, że zwrócona faktura ma ten sam numer.
 */
export declare function findInvoiceIdByFullNumber(params: {
    fullNumber: string;
    accessKey: string;
    secretKey: string;
    appKey?: string;
    companyId?: string | null;
}): Promise<number>;
/**
 * Pobiera PDF faktury z wFirma po ID. Zwraca buffer PDF. Przy błędzie rzuca (bez fallbacku).
 */
export declare function downloadInvoicePdf(params: {
    invoiceId: number;
    accessKey: string;
    secretKey: string;
    appKey?: string;
    companyId?: string | null;
}): Promise<Buffer>;
export type CreateInvoiceParams = {
    orders: OrderLike[];
    client: ClientLike;
    seller: SellerLike;
    invoiceNumber: string;
    invoiceDate: string;
    paymentDue: string;
    saleDate?: string | null;
    notes?: string | null;
    /** Czy sprzedawca (Twoje dane) jest płatnikiem VAT – decyduje o type: normal (VAT) vs bill (bez VAT). */
    isVatPayer?: boolean;
    accessKey: string;
    secretKey: string;
    appKey?: string;
    companyId?: string | null;
    companyAccountId?: number | null;
};
export declare function createInvoiceFromOrder(params: CreateInvoiceParams): Promise<{
    invoiceNumber: string;
}>;
type WfirmaCompanyAccount = {
    id: number;
    account_number: string;
    bank_name?: string;
    name?: string;
    currency?: string;
};
export declare function listCompanyAccounts(params: {
    accessKey: string;
    secretKey: string;
    appKey?: string;
    companyId?: string | null;
}): Promise<WfirmaCompanyAccount[]>;
export declare function testConnection(params: {
    accessKey: string;
    secretKey: string;
    appKey?: string;
    companyId?: string | null;
}): Promise<{
    ok: boolean;
    message: string;
}>;
export {};
