export type CompanyFromVat = {
    name: string;
    short_name: string;
    nip: string;
    street: string;
    building: string;
    local: string;
    postal_code: string;
    city: string;
    country: string;
    regon: string | null;
    statusVat: string;
    /** When API returns person name (sole proprietor), we put it here and leave name empty for user to enter business name */
    contact_person: string;
};
/**
 * Pobiera dane firmy po NIP: najpierw Python GUS (najpełniejsze dane),
 * potem rejestr VAT, a na końcu natywne GUS SOAP jako fallback.
 */
export declare function fetchCompanyByNip(nip: string): Promise<CompanyFromVat | {
    error: string;
}>;
