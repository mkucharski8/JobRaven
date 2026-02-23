declare const api: {
    auth: {
        getSession: () => Promise<any>;
        register: (email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string) => Promise<any>;
        login: (email: string, password: string, organizationId?: string) => Promise<any>;
        logout: () => Promise<any>;
        changePassword: (currentPassword: string, newPassword: string) => Promise<any>;
        changeDisplayName: (currentPassword: string, newDisplayName: string) => Promise<any>;
        resendVerification: (email: string, lang?: string) => Promise<any>;
        forgotPassword: (email: string, lang?: string) => Promise<any>;
    };
    app: {
        getDbSchemaVersion: () => Promise<number | null>;
        getVersion: () => Promise<string>;
        getUpdateStatus: () => Promise<{
            version: string;
            updateAvailable: boolean;
            updateAvailableVersion?: string;
        }>;
        getUpdateRequired: () => Promise<{
            required: boolean;
            version: string | null;
        }>;
        openUpdateDownloadUrl: () => Promise<void>;
        isPackaged: () => Promise<boolean>;
        getUpdaterDebugInfo: () => Promise<{
            ok: boolean;
            status?: number;
            error?: string;
            releasesCount?: number;
            latestVersion?: string;
            tagNames?: string[];
        }>;
        relaunch: () => Promise<any>;
        refocusWindow: () => Promise<any>;
        getNotices: () => Promise<any>;
        recordNoticeRead: (noticeId: string) => Promise<any>;
        getDataFolderPath: () => Promise<string>;
        openDataFolder: () => Promise<{
            ok: boolean;
            error?: string;
        }>;
        setDataFolderPath: (newPath: string) => Promise<{
            ok: boolean;
            needRestart?: boolean;
            error?: string;
        }>;
        ensurePredefinedSettings: (uiLocale: string) => Promise<void>;
        chooseDataFolder: () => Promise<{
            ok: boolean;
            path?: string;
            needRestart?: boolean;
            canceled?: boolean;
            error?: string;
        }>;
    };
    languages: {
        list: () => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    languagePairs: {
        list: () => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    unitCategories: {
        list: () => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    units: {
        list: () => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
        setBase: (id: number) => Promise<any>;
    };
    contractors: {
        list: () => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    specializations: {
        list: () => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    services: {
        list: () => Promise<any>;
        add: (row: {
            name: string;
            vat_rate?: number;
        }) => Promise<any>;
        update: (id: number, row: {
            name?: string;
            vat_rate?: number;
        }) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    serviceVatRules: {
        listByService: (serviceId: number) => Promise<any>;
        upsert: (row: {
            service_id: number;
            client_segment: string;
            country_code?: string | null;
            value_type: "rate" | "code";
            rate_value?: number | null;
            code_value?: string | null;
        }) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    clients: {
        list: () => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    orderBooks: {
        list: () => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: {
            name: string;
            view_type?: string;
            order_number_format?: string | null;
            repertorium_oral_unit_id?: number | null;
            repertorium_page_unit_id?: number | null;
        }) => Promise<any>;
        update: (id: number, row: {
            name?: string;
            view_type?: string;
            archived?: number;
            order_number_format?: string | null;
            repertorium_oral_unit_id?: number | null;
            repertorium_page_unit_id?: number | null;
        }) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    orders: {
        list: (bookId?: number) => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
        deleteAllButFirstInBook: (bookId: number) => Promise<any>;
        issueInvoice: (id: number, invoice_number: string, invoice_date: string, opts?: {
            invoice_sale_date?: string | null;
            payment_due_at?: string | null;
            invoice_notes?: string | null;
            invoice_bank_account_id?: number | null;
            wfirma_company_account_id?: number | null;
            invoice_provider_source?: string | null;
        }) => Promise<any>;
        issueInvoices: (orderIds: number[], invoice_number: string, invoice_date: string, opts?: {
            invoice_sale_date?: string | null;
            payment_due_at?: string | null;
            invoice_notes?: string | null;
            invoice_bank_account_id?: number | null;
            wfirma_company_account_id?: number | null;
            invoice_provider_source?: string | null;
        }) => Promise<any>;
        clearInvoice: (id: number) => Promise<any>;
        nextInvoiceNumber: (providerSource?: "local" | "wfirma") => Promise<any>;
    };
    subcontracts: {
        list: () => Promise<any>;
        listByOrderId: (orderId: number) => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: object) => Promise<any>;
        update: (id: number, row: object) => Promise<any>;
        delete: (id: number) => Promise<any>;
        nextSubcontractNumber: () => Promise<any>;
    };
    clientUnitRates: {
        list: (clientId: number) => Promise<any>;
        get: (clientId: number, unitId: number, preferredCurrency?: string | null) => Promise<any>;
        set: (clientId: number, unitId: number, rate: number, currency?: string | null) => Promise<any>;
    };
    clientDefaultUnitRates: {
        list: (clientId: number) => Promise<any>;
        get: (clientId: number, unitId: number, argumentCandidates?: {
            key: string;
            value?: string | null;
        }[] | null, preferredCurrency?: string | null) => Promise<any>;
        set: (clientId: number, unitId: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => Promise<any>;
        update: (id: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    contractorUnitRates: {
        list: (contractorId: number) => Promise<any>;
        get: (contractorId: number, unitId: number, languagePairId?: number | null) => Promise<any>;
        set: (contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => Promise<any>;
    };
    defaultUnitRates: {
        list: () => Promise<any>;
        get: (unitId: number, argumentCandidates?: {
            key: string;
            value?: string | null;
        }[] | null, preferredCurrency?: string | null) => Promise<any>;
        set: (unitId: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => Promise<any>;
        update: (id: number, rate: number, currency: string, argumentsList?: {
            key: string;
            value?: string | null;
        }[] | {
            key: string;
            value?: string | null;
        } | null) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    settings: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: string | number) => Promise<any>;
        hasRateCurrencies: () => Promise<boolean>;
        setInvoiceLogo: (sourceFilePath: string | null) => Promise<any>;
        exportUnitsServicesPreset: (uiLocale: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
        restorePredefinedPreset: (uiLocale: string) => Promise<{ ok: boolean; error?: string }>;
        clearPredefinedPreset: (password: string) => Promise<{ ok: boolean; error?: string }>;
        verifyPassword: (password: string) => Promise<{ ok: boolean }>;
    };
    customColumns: {
        listByBook: (bookId: number) => Promise<any>;
        add: (row: {
            book_id: number;
            name: string;
            col_type?: string;
        }) => Promise<any>;
        update: (id: number, row: {
            name?: string;
            col_type?: string;
            sort_order?: number;
        }) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    customColumnValues: {
        getByOrder: (orderId: number) => Promise<any>;
        set: (orderId: number, columnId: number, value: string | null) => Promise<any>;
        bulkSet: (orderId: number, values: Record<number, string | null>) => Promise<any>;
    };
    bankAccounts: {
        list: () => Promise<any>;
        get: (id: number) => Promise<any>;
        add: (row: {
            bank_name?: string;
            account_number: string;
            swift?: string;
            currency?: string;
            is_default?: number;
        }) => Promise<any>;
        update: (id: number, row: {
            bank_name?: string;
            account_number?: string;
            swift?: string;
            currency?: string;
            is_default?: number;
        }) => Promise<any>;
        delete: (id: number) => Promise<any>;
        setDefault: (id: number) => Promise<any>;
    };
    dialog: {
        openFile: (opts?: {
            filters?: {
                name: string;
                extensions: string[];
            }[];
            title?: string;
        }) => Promise<any>;
    };
    analytics: {
        totals: (bookId?: number) => Promise<any>;
        paymentSummary: (bookId?: number) => Promise<any>;
    };
    gus: {
        fetchByNip: (nip: string) => Promise<any>;
    };
    wfirma: {
        testConnection: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => Promise<{
            ok: boolean;
            message: string;
        }>;
        listCompanyAccounts: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => Promise<Array<{
            id: number;
            account_number: string;
            bank_name?: string;
            name?: string;
            currency?: string;
        }>>;
    };
    export: {
        ordersXls: (bookId?: number, columns?: {
            key: string;
            label: string;
        }[]) => Promise<any>;
        ordersXlsx: (bookId?: number, columns?: {
            key: string;
            label: string;
        }[]) => Promise<any>;
        ordersPdf: (bookId?: number, columns?: {
            key: string;
            label: string;
        }[]) => Promise<any>;
        analyticsXlsx: (data: {
            name: string;
            amount: number;
            count: number;
        }[]) => Promise<any>;
        earningsReportXlsx: (payload: {
            tableData: {
                name: string;
                keyParts?: string[];
                count: number;
                net: number;
                vat: number;
                gross: number;
            }[];
            chartData: {
                name: string;
                net: number;
                vat: number;
                gross: number;
                value?: number;
            }[];
            rowGroupLabels?: string[];
            labels: {
                rowLabel: string;
                count: string;
                valueColumn: string;
                sheetTable: string;
                sheetChart: string;
                net: string;
                vat: string;
                gross: string;
            };
        }) => Promise<any>;
        orderConfirmationPdf: (orderId: number) => Promise<any>;
        orderConfirmationPdfSubcontract: (subcontractId: number) => Promise<any>;
        invoicePdf: (orderId: number, extra?: {
            notes?: string;
            bankAccountId?: number;
        }) => Promise<any>;
        invoicePdfMulti: (orderIds: number[], extra?: {
            notes?: string;
            bankAccountId?: number;
        }) => Promise<any>;
    };
};
export type ElectronApi = typeof api;
export {};
