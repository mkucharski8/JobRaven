export interface ElectronApi {
  auth: {
    getSession: () => Promise<{
      hasAnyUser: boolean
      user: { id: number; email: string; display_name?: string | null; role: string } | null
      organizations: { id: string; name: string }[]
      currentOrg: { id: string; name: string } | null
      licenseWarning?: boolean
      secondsUntilNextCheck?: number | null
      checkIntervalSeconds?: number
    }>
    register: (email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string) => Promise<{ ok: boolean; error?: string; message?: string; switched_org?: boolean; user?: { id: number; email: string; display_name?: string | null; role: string } }>
    resendVerification?: (email: string, lang?: string) => Promise<{ ok: boolean; error?: string }>
    forgotPassword?: (email: string, lang?: string) => Promise<{ ok: boolean; error?: string }>
    login: (email: string, password: string, organizationId?: string) => Promise<{ ok: boolean; error?: string; switched_org?: boolean; user?: { id: number; email: string; display_name?: string | null; role: string } }>
    logout: () => Promise<void>
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>
    changeDisplayName: (currentPassword: string, newDisplayName: string) => Promise<{ ok: boolean; error?: string }>
  }
  app: {
    getDbSchemaVersion?: () => Promise<number | null>
    relaunch: () => Promise<void>
    refocusWindow?: () => Promise<void>
    getDataFolderPath?: () => Promise<string>
    isPackaged?: () => Promise<boolean>
    getUpdaterDebugInfo?: () => Promise<{ ok: boolean; status?: number; error?: string; releasesCount?: number; latestVersion?: string; tagNames?: string[] }>
    getUpdateStatus?: () => Promise<{ version: string; updateAvailable: boolean; updateAvailableVersion?: string }>
    getUpdateRequired?: () => Promise<{ required: boolean; version: string | null }>
    openUpdateDownloadUrl?: () => Promise<void>
    openDataFolder?: () => Promise<{ ok: boolean; error?: string }>
    setDataFolderPath?: (newPath: string) => Promise<{ ok: boolean; needRestart?: boolean; error?: string }>
    chooseDataFolder?: () => Promise<{ ok: boolean; path?: string; needRestart?: boolean; canceled?: boolean; error?: string }>
    getNotices?: () => Promise<unknown>
    recordNoticeRead?: (noticeId: string) => Promise<unknown>
  }
  languages: { list: () => Promise<unknown[]>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  languagePairs: { list: () => Promise<unknown[]>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  unitCategories: { list: () => Promise<unknown[]>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  units: { list: () => Promise<unknown[]>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void>; setBase: (id: number) => Promise<void> }
  contractors: { list: () => Promise<unknown[]>; get: (id: number) => Promise<unknown>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  specializations: { list: () => Promise<unknown[]>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  services: { list: () => Promise<{ id: number; name: string; vat_rate?: number | null }[]>; add: (r: { name: string; vat_rate?: number }) => Promise<number>; update: (id: number, r: { name?: string; vat_rate?: number }) => Promise<void>; delete: (id: number) => Promise<void> }
  serviceVatRules: {
    listByService: (serviceId: number) => Promise<{ id: number; service_id: number; client_segment: string; country_code?: string | null; value_type: 'rate' | 'code'; rate_value?: number | null; code_value?: string | null }[]>
    upsert: (r: { service_id: number; client_segment: string; country_code?: string | null; value_type: 'rate' | 'code'; rate_value?: number | null; code_value?: string | null }) => Promise<number>
    delete: (id: number) => Promise<void>
  }
  clients: { list: () => Promise<unknown[]>; get: (id: number) => Promise<unknown>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void> }
  orderBooks: { list: () => Promise<{ id: number; name: string; view_type: string; sort_order: number; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }[]>; get: (id: number) => Promise<{ id: number; name: string; view_type: string; sort_order: number; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null } | undefined>; add: (r: { name: string; view_type?: string; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => Promise<number>; update: (id: number, r: { name?: string; view_type?: string; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => Promise<void>; delete: (id: number) => Promise<void> }
  orders: { list: (bookId?: number) => Promise<unknown[]>; get: (id: number) => Promise<unknown>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void>; deleteAllButFirstInBook: (bookId: number) => Promise<number>; issueInvoice: (id: number, invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null; invoice_provider_source?: string | null }) => Promise<void>; issueInvoices: (orderIds: number[], invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null; invoice_provider_source?: string | null }) => Promise<void>; clearInvoice: (id: number) => Promise<void>; nextInvoiceNumber: (providerSource?: 'local' | 'wfirma') => Promise<string> }
  subcontracts: { list: () => Promise<unknown[]>; listByOrderId: (orderId: number) => Promise<unknown[]>; get: (id: number) => Promise<unknown>; add: (r: object) => Promise<number>; update: (id: number, r: object) => Promise<void>; delete: (id: number) => Promise<void>; nextSubcontractNumber: () => Promise<string> }
  clientUnitRates: { list: (clientId: number) => Promise<{ unit_id: number; rate: number; currency: string }[]>; get: (clientId: number, unitId: number, preferredCurrency?: string | null) => Promise<{ rate: number; currency: string } | undefined>; set: (clientId: number, unitId: number, rate: number, currency?: string | null) => Promise<void> }
  clientDefaultUnitRates: { list: (clientId: number) => Promise<{ id: number; client_id: number; unit_id: number; unit_name: string; language_pair_id: number | null; language_pair_label: string | null; argument_key: string | null; argument_value: string | null; argument2_key: string | null; argument2_value: string | null; argument3_key: string | null; argument3_value: string | null; rate: number; currency: string }[]>; get: (clientId: number, unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => Promise<{ rate: number; currency: string } | undefined>; set: (clientId: number, unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => Promise<void>; update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => Promise<void>; delete: (id: number) => Promise<void> }
  contractorUnitRates: { list: (contractorId: number) => Promise<{ unit_id: number; language_pair_id: number | null; rate: number }[]>; get: (contractorId: number, unitId: number, languagePairId?: number | null) => Promise<{ rate: number } | undefined>; set: (contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => Promise<void> }
  defaultUnitRates: { list: () => Promise<{ id: number; unit_id: number; unit_name: string; language_pair_id: number | null; language_pair_label: string | null; argument_key: string | null; argument_value: string | null; argument2_key: string | null; argument2_value: string | null; argument3_key: string | null; argument3_value: string | null; rate: number; currency: string }[]>; get: (unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => Promise<{ rate: number; currency: string } | undefined>; set: (unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => Promise<void>; update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => Promise<void>; delete: (id: number) => Promise<void> }
  customColumns: { listByBook: (bookId: number) => Promise<{ id: number; book_id: number; name: string; col_type: string; sort_order: number }[]>; add: (r: { book_id: number; name: string; col_type?: string }) => Promise<number>; update: (id: number, r: { name?: string; col_type?: string; sort_order?: number }) => Promise<void>; delete: (id: number) => Promise<void> }
  customColumnValues: { getByOrder: (orderId: number) => Promise<Record<number, string | null>>; set: (orderId: number, columnId: number, value: string | null) => Promise<void>; bulkSet: (orderId: number, values: Record<number, string | null>) => Promise<void> }
  bankAccounts: { list: () => Promise<{ id: number; bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number; sort_order: number }[]>; get: (id: number) => Promise<{ id: number; bank_name: string; bank_address: string; account_number: string; swift: string; currency: string; is_default: number; sort_order: number } | undefined>; add: (r: { bank_name?: string; bank_address?: string; account_number: string; swift?: string; currency?: string; is_default?: number }) => Promise<number>; update: (id: number, r: { bank_name?: string; bank_address?: string; account_number?: string; swift?: string; currency?: string; is_default?: number }) => Promise<void>; delete: (id: number) => Promise<void>; setDefault: (id: number) => Promise<void> }
  settings: { get: (key: string) => Promise<string | null>; set: (key: string, value: string | number) => Promise<void>; setInvoiceLogo?: (sourceFilePath: string | null) => Promise<string | null>; hasRateCurrencies?: () => Promise<boolean>; exportUnitsServicesPreset?: (uiLocale: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>; restorePredefinedPreset?: (uiLocale: string) => Promise<{ ok: boolean; error?: string }>; clearPredefinedPreset?: (password: string) => Promise<{ ok: boolean; error?: string }>; verifyPassword?: (password: string) => Promise<{ ok: boolean }> }
  dialog: { openFile: (opts?: { filters?: { name: string; extensions: string[] }[]; title?: string }) => Promise<string | null>; chooseDirectory: () => Promise<string | null> }
  export: { ordersXls: (bookId?: number, columns?: { key: string; label: string }[]) => Promise<boolean>; ordersXlsx: (bookId?: number, columns?: { key: string; label: string }[]) => Promise<boolean>; ordersPdf: (bookId?: number, columns?: { key: string; label: string }[]) => Promise<boolean>; analyticsXlsx: (data: { name: string; amount: number; count: number }[]) => Promise<boolean>; earningsReportXlsx: (payload: { tableData: { name: string; keyParts?: string[]; count: number; net: number; vat: number; gross: number }[]; chartData: { name: string; net: number; vat: number; gross: number; value?: number }[]; rowGroupLabels?: string[]; labels: { rowLabel: string; count: string; valueColumn: string; sheetTable: string; sheetChart: string; net: string; vat: string; gross: string } }) => Promise<boolean>; orderConfirmationPdf: (orderId: number) => Promise<boolean>; orderConfirmationPdfSubcontract: (subcontractId: number) => Promise<boolean>; invoicePdf: (orderId: number, extra?: { notes?: string; bankAccountId?: number }) => Promise<boolean>; invoicePdfMulti: (orderIds: number[], extra?: { notes?: string; bankAccountId?: number }) => Promise<boolean>; invoicePdfToPath: (orderIds: number[], filePath: string, extra?: { notes?: string; bankAccountId?: number }) => Promise<boolean> }
  analytics: { totals: (bookId?: number) => Promise<unknown>; paymentSummary: (bookId?: number) => Promise<unknown> }
  gus: { fetchByNip: (nip: string) => Promise<{ name: string; short_name: string; nip: string; street: string; building: string; local: string; postal_code: string; city: string; country: string; regon?: string | null; statusVat?: string; contact_person?: string } | { error: string }> }
  wfirma: {
    testConnection: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => Promise<{ ok: boolean; message: string }>
    listCompanyAccounts: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) => Promise<Array<{ id: number; account_number: string; bank_name?: string; name?: string; currency?: string }>>
  }
}

declare global {
  interface Window {
    api: ElectronApi
  }
}
