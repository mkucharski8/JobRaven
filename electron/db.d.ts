/** Wersja schemy bazy – zwiększ przy każdej nowej migracji. */
export declare const CURRENT_SCHEMA_VERSION = 1;
/** Zwraca aktualną wersję schemy bazy (po initDb). Do wyświetlenia w UI / diagnostyce. */
export declare function getDbSchemaVersion(): number | null;
export declare function initDb(): Promise<void>;
/** Zapisuje powiązanie pliku bazy z bieżącą organizacją i użytkownikiem (po potwierdzeniu DB_NOT_LINKED). */
export declare function linkDatabaseFileToCurrentSession(): Promise<void>;
declare function nextSubcontractNumber(): string;
export declare const dbApi: {
    auth: {
        getSession: () => {
            hasAnyUser: boolean;
            user: null;
        } | {
            hasAnyUser: boolean;
            user: {
                id: number;
                email: string;
                display_name: string | null;
                role: string;
            };
        };
        register: (email: string, password: string, displayName?: string | null) => {
            ok: boolean;
            error: string;
            user?: undefined;
        } | {
            ok: boolean;
            user: {
                id: number;
                email: string;
                display_name: string | null;
                role: string;
            };
            error?: undefined;
        };
        login: (email: string, password: string) => {
            ok: boolean;
            error: string;
            user?: undefined;
        } | {
            ok: boolean;
            user: {
                id: number;
                email: string;
                display_name: string | null;
                role: string;
            };
            error?: undefined;
        };
        logout: () => void;
    };
    languages: {
        list: () => Record<string, unknown>[];
        add: (row: {
            code: string;
            name: string;
            sort_order?: number;
        }) => number;
        update: (id: number, row: {
            code?: string;
            name?: string;
            sort_order?: number;
        }) => void;
        delete: (id: number) => void;
    };
    languagePairs: {
        list: () => {
            label: string;
        }[];
        add: (row: {
            source_lang_id: number;
            target_lang_id: number;
            label?: string;
            bidirectional?: boolean;
        }) => number;
        update: (id: number, row: {
            source_lang_id?: number;
            target_lang_id?: number;
            label?: string;
            bidirectional?: boolean;
        }) => void;
        delete: (id: number) => void;
    };
    unitCategories: {
        list: () => Record<string, unknown>[];
        add: (row: {
            name: string;
            sort_order?: number;
        }) => number;
        update: (id: number, row: {
            name?: string;
            base_unit_id?: number | null;
            oral_unit_id?: number | null;
            page_unit_id?: number | null;
        }) => void;
        delete: (id: number) => void;
    };
    units: {
        list: () => {
            unit_category_ids: number[];
            id: number;
            name: string;
            multiplier_to_base: number;
            is_base: number;
            unit_category_id: number | null;
            category_name: string | null;
            category_base_rate: number | null;
            category_currency: string | null;
            unit_category_ids_csv: string | null;
        }[];
        add: (row: {
            name: string;
            multiplier_to_base: number;
            is_base?: number;
            unit_category_id?: number | null;
            unit_category_ids?: number[];
        }) => number;
        update: (id: number, row: {
            name?: string;
            multiplier_to_base?: number;
            is_base?: number;
            unit_category_id?: number | null;
            unit_category_ids?: number[];
        }) => void;
        delete: (id: number) => void;
        setBase: (id: number) => void;
    };
    contractors: {
        list: () => Record<string, unknown>[];
        get: (id: number) => Record<string, unknown> | undefined;
        add: (row: Record<string, unknown>) => number;
        update: (id: number, row: Record<string, unknown>) => void;
        delete: (id: number) => void;
    };
    specializations: {
        list: () => Record<string, unknown>[];
        add: (row: {
            name: string;
            sort_order?: number;
        }) => number;
        update: (id: number, row: {
            name?: string;
            sort_order?: number;
        }) => void;
        delete: (id: number) => void;
    };
    services: {
        list: () => {
            id: number;
            name: string;
            vat_rate: number;
        }[];
        add: (row: {
            name: string;
            vat_rate?: number;
        }) => number;
        update: (id: number, row: {
            name?: string;
            vat_rate?: number;
        }) => void;
        delete: (id: number) => void;
    };
    serviceVatRules: {
        listByService: (serviceId: number) => {
            id: number;
            service_id: number;
            client_segment: string;
            country_code: string | null;
            value_type: "rate" | "code";
            rate_value: number | null;
            code_value: string | null;
        }[];
        upsert: (row: {
            service_id: number;
            client_segment: string;
            country_code?: string | null;
            value_type: "rate" | "code";
            rate_value?: number | null;
            code_value?: string | null;
        }) => number;
        delete: (id: number) => void;
    };
    clients: {
        list: () => Record<string, unknown>[];
        get: (id: number) => Record<string, unknown> | undefined;
        add: (row: Record<string, unknown>) => number;
        update: (id: number, row: Record<string, unknown>) => void;
        delete: (id: number) => void;
    };
    orders: {
        list: (bookId?: number) => Record<string, unknown>[];
        get: (id: number) => Record<string, unknown> | undefined;
        add: (row: Record<string, unknown>) => number;
        update: (id: number, row: Record<string, unknown>) => void;
        delete: (id: number) => void;
        /** Usuwa wszystkie zlecenia w księdze oprócz pierwszego (najmniejszy id). */
        deleteAllButFirstInBook: (bookId: number) => number;
        issueInvoice: (id: number, invoice_number: string, invoice_date: string, opts?: {
            invoice_sale_date?: string | null;
            payment_due_at?: string | null;
            invoice_notes?: string | null;
            invoice_bank_account_id?: number | null;
            invoice_provider_source?: string | null;
        }) => void;
        issueInvoices: (orderIds: number[], invoice_number: string, invoice_date: string, opts?: {
            invoice_sale_date?: string | null;
            payment_due_at?: string | null;
            invoice_notes?: string | null;
            invoice_bank_account_id?: number | null;
            invoice_provider_source?: string | null;
        }) => void;
        clearInvoice: (id: number) => void;
        nextOrderNumber: (bookId?: number) => string;
        nextInvoiceNumber: (providerSource?: "local" | "wfirma") => string;
    };
    orderBooks: {
        list: () => {
            id: number;
            name: string;
            view_type: string;
            sort_order: number;
            archived: number;
            order_number_format: string | null;
            repertorium_oral_unit_id: number | null;
            repertorium_page_unit_id: number | null;
        }[];
        get: (id: number) => {
            id: number;
            name: string;
            view_type: string;
            sort_order: number;
            archived: number;
            order_number_format: string | null;
            repertorium_oral_unit_id: number | null;
            repertorium_page_unit_id: number | null;
        } | undefined;
        add: (row: {
            name: string;
            view_type?: string;
            order_number_format?: string | null;
            repertorium_oral_unit_id?: number | null;
            repertorium_page_unit_id?: number | null;
        }) => number;
        update: (id: number, row: {
            name?: string;
            view_type?: string;
            archived?: number;
            order_number_format?: string | null;
            repertorium_oral_unit_id?: number | null;
            repertorium_page_unit_id?: number | null;
        }) => void;
        delete: (id: number) => void;
    };
    subcontracts: {
        list: () => {
            received_at: unknown;
            quantity: {};
            rate_per_unit: {};
            amount: {};
        }[];
        get: (id: number) => {
            received_at: unknown;
            quantity: {};
            rate_per_unit: {};
            amount: {};
        } | undefined;
        add: (row: Record<string, unknown>) => number;
        update: (id: number, row: Record<string, unknown>) => void;
        delete: (id: number) => void;
        listByOrderId: (orderId: number) => Record<string, unknown>[];
        nextSubcontractNumber: typeof nextSubcontractNumber;
    };
    clientUnitRates: {
        list: (clientId: number) => {
            unit_id: number;
            rate: number;
            currency: string;
        }[];
        get: (clientId: number, unitId: number, preferredCurrency?: string | null) => {
            rate: number;
            currency: string;
        } | undefined;
        set: (clientId: number, unitId: number, rate: number, currency?: string | null) => void;
    };
    clientDefaultUnitRates: {
        list: (clientId: number) => {
            id: number;
            client_id: number;
            unit_id: number;
            unit_name: string;
            language_pair_id: number | null;
            language_pair_label: string | null;
            argument_key: string | null;
            argument_value: string | null;
            argument2_key: string | null;
            argument2_value: string | null;
            argument3_key: string | null;
            argument3_value: string | null;
            rate: number;
            currency: string;
        }[];
        get: (clientId: number, unitId: number, argumentCandidates?: {
            key: string;
            value?: string | null;
        }[] | null, preferredCurrency?: string | null) => {
            rate: number;
            currency: string;
        } | undefined;
        set: (clientId: number, unitId: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => void;
        update: (id: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => void;
        delete: (id: number) => void;
    };
    contractorUnitRates: {
        list: (contractorId: number) => {
            unit_id: number;
            language_pair_id: number | null;
            rate: number;
        }[];
        get: (contractorId: number, unitId: number, languagePairId?: number | null) => {
            rate: number;
        } | undefined;
        set: (contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => void;
    };
    defaultUnitRates: {
        list: () => {
            id: number;
            unit_id: number;
            unit_name: string;
            language_pair_id: number | null;
            language_pair_label: string | null;
            argument_key: string | null;
            argument_value: string | null;
            argument2_key: string | null;
            argument2_value: string | null;
            argument3_key: string | null;
            argument3_value: string | null;
            rate: number;
            currency: string;
        }[];
        get: (unitId: number, argumentCandidates?: {
            key: string;
            value?: string | null;
        }[] | null, preferredCurrency?: string | null) => {
            rate: number;
            currency: string;
        } | undefined;
        set: (unitId: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => void;
        update: (id: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => void;
        delete: (id: number) => void;
    };
    customColumns: {
        listByBook: (bookId: number) => {
            id: number;
            book_id: number;
            name: string;
            col_type: string;
            sort_order: number;
        }[];
        add: (row: {
            book_id: number;
            name: string;
            col_type?: string;
        }) => number;
        update: (id: number, row: {
            name?: string;
            col_type?: string;
            sort_order?: number;
        }) => void;
        delete: (id: number) => void;
    };
    customColumnValues: {
        getByOrder: (orderId: number) => Record<number, string | null>;
        set: (orderId: number, columnId: number, value: string | null) => void;
        bulkSet: (orderId: number, values: Record<number, string | null>) => void;
    };
    bankAccounts: {
        list: () => {
            id: number;
            bank_name: string;
            bank_address: string;
            account_number: string;
            swift: string;
            currency: string;
            is_default: number;
            sort_order: number;
        }[];
        add: (row: {
            bank_name?: string;
            bank_address?: string;
            account_number: string;
            swift?: string;
            currency?: string;
            is_default?: number;
        }) => number;
        update: (id: number, row: {
            bank_name?: string;
            bank_address?: string;
            account_number?: string;
            swift?: string;
            currency?: string;
            is_default?: number;
        }) => void;
        delete: (id: number) => void;
        setDefault: (id: number) => void;
        get: (id: number) => {
            id: number;
            bank_name: string;
            bank_address: string;
            account_number: string;
            swift: string;
            currency: string;
            is_default: number;
            sort_order: number;
        } | undefined;
    };
    settings: {
        get: (key: string) => string | null;
        set: (key: string, value: string | number) => void;
        /** Czy jest co najmniej jedna waluta (lista walut niepusta LUB ustawiona waluta domyślna). */
        hasRateCurrencies: () => boolean;
    };
    analytics: {
        totals: (bookId?: number) => {
            byCurrency: {
                currency: string;
                byCategory: {
                    categoryId: number | null;
                    categoryName: string;
                    baseUnitName: string;
                    totalInBaseUnit: number;
                    byUnit: {
                        id: number;
                        name: string;
                        multiplier_to_base: number;
                        order_count: number;
                        total: number;
                    }[];
                }[];
            }[];
        };
        paymentSummary: (bookId?: number) => {
            byCurrency: {
                currency: string;
                byStatus: {
                    invoice_status: string;
                    count: number;
                    total: number;
                }[];
                overdue: {
                    count: number;
                    total: number;
                };
            }[];
        };
    };
};
export {};
