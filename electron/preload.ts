import { contextBridge, ipcRenderer } from 'electron'

ipcRenderer.on('jobraven:session-cleared', () => {
  window.dispatchEvent(new CustomEvent('jobraven:session-cleared'))
})
ipcRenderer.on('jobraven:update-downloaded', () => {
  window.dispatchEvent(new CustomEvent('jobraven:update-downloaded'))
})
ipcRenderer.on('jobraven:update-status', (_: unknown, payload: { updateAvailable: boolean; updateAvailableVersion?: string }) => {
  window.dispatchEvent(new CustomEvent('jobraven:update-status', { detail: payload }))
})
ipcRenderer.on('jobraven:update-required', (_: unknown, payload: { version: string }) => {
  window.dispatchEvent(new CustomEvent('jobraven:update-required', { detail: payload }))
})

const api = {
  auth: {
    getSession: () => ipcRenderer.invoke('db:auth:getSession'),
    register: (email: string, password: string, displayName?: string | null, organizationId?: string, lang?: string) => ipcRenderer.invoke('db:auth:register', email, password, displayName, organizationId, lang),
    login: (email: string, password: string, organizationId?: string) => ipcRenderer.invoke('db:auth:login', email, password, organizationId),
    logout: () => ipcRenderer.invoke('db:auth:logout'),
    changePassword: (currentPassword: string, newPassword: string) => ipcRenderer.invoke('db:auth:changePassword', currentPassword, newPassword),
    changeDisplayName: (currentPassword: string, newDisplayName: string) => ipcRenderer.invoke('db:auth:changeDisplayName', currentPassword, newDisplayName),
    resendVerification: (email: string, lang?: string) => ipcRenderer.invoke('db:auth:resendVerification', email, lang),
    forgotPassword: (email: string, lang?: string) => ipcRenderer.invoke('db:auth:forgotPassword', email, lang)
  },
  app: {
    getDbSchemaVersion: () => ipcRenderer.invoke('app:getDbSchemaVersion') as Promise<number | null>,
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
    getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus') as Promise<{ version: string; updateAvailable: boolean; updateAvailableVersion?: string }>,
    getUpdateRequired: () => ipcRenderer.invoke('app:getUpdateRequired') as Promise<{ required: boolean; version: string | null }>,
    openUpdateDownloadUrl: () => ipcRenderer.invoke('app:openUpdateDownloadUrl') as Promise<void>,
    isPackaged: () => ipcRenderer.invoke('app:isPackaged') as Promise<boolean>,
    getUpdaterDebugInfo: () => ipcRenderer.invoke('app:getUpdaterDebugInfo') as Promise<{ ok: boolean; status?: number; error?: string; releasesCount?: number; latestVersion?: string; tagNames?: string[] }>,
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    refocusWindow: () => ipcRenderer.invoke('app:refocusWindow'),
    getNotices: () => ipcRenderer.invoke('app:getNotices'),
    recordNoticeRead: (noticeId: string) => ipcRenderer.invoke('app:recordNoticeRead', noticeId),
    getDataFolderPath: () => ipcRenderer.invoke('app:getDataFolderPath') as Promise<string>,
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder') as Promise<{ ok: boolean; error?: string }>,
    setDataFolderPath: (newPath: string) => ipcRenderer.invoke('app:setDataFolderPath', newPath) as Promise<{ ok: boolean; needRestart?: boolean; error?: string }>,
    chooseDataFolder: () => ipcRenderer.invoke('app:chooseDataFolder') as Promise<{ ok: boolean; path?: string; needRestart?: boolean; canceled?: boolean; error?: string }>,
    ensurePredefinedSettings: (uiLocale: string) => ipcRenderer.invoke('app:ensurePredefinedSettings', uiLocale || 'pl')
  },
  languages: {
    list: () => ipcRenderer.invoke('db:languages:list'),
    add: (row: object) => ipcRenderer.invoke('db:languages:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:languages:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:languages:delete', id)
  },
  languagePairs: {
    list: () => ipcRenderer.invoke('db:languagePairs:list'),
    add: (row: object) => ipcRenderer.invoke('db:languagePairs:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:languagePairs:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:languagePairs:delete', id)
  },
  unitCategories: {
    list: () => ipcRenderer.invoke('db:unitCategories:list'),
    add: (row: object) => ipcRenderer.invoke('db:unitCategories:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:unitCategories:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:unitCategories:delete', id)
  },
  units: {
    list: () => ipcRenderer.invoke('db:units:list'),
    add: (row: object) => ipcRenderer.invoke('db:units:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:units:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:units:delete', id),
    setBase: (id: number) => ipcRenderer.invoke('db:units:setBase', id)
  },
  contractors: {
    list: () => ipcRenderer.invoke('db:contractors:list'),
    get: (id: number) => ipcRenderer.invoke('db:contractors:get', id),
    add: (row: object) => ipcRenderer.invoke('db:contractors:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:contractors:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:contractors:delete', id)
  },
  specializations: {
    list: () => ipcRenderer.invoke('db:specializations:list'),
    add: (row: object) => ipcRenderer.invoke('db:specializations:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:specializations:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:specializations:delete', id)
  },
  services: {
    list: () => ipcRenderer.invoke('db:services:list'),
    add: (row: { name: string; vat_rate?: number }) => ipcRenderer.invoke('db:services:add', row),
    update: (id: number, row: { name?: string; vat_rate?: number }) => ipcRenderer.invoke('db:services:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:services:delete', id)
  },
  serviceVatRules: {
    listByService: (serviceId: number) => ipcRenderer.invoke('db:serviceVatRules:listByService', serviceId),
    upsert: (row: { service_id: number; client_segment: string; country_code?: string | null; value_type: 'rate' | 'code'; rate_value?: number | null; code_value?: string | null }) => ipcRenderer.invoke('db:serviceVatRules:upsert', row),
    delete: (id: number) => ipcRenderer.invoke('db:serviceVatRules:delete', id)
  },
  clients: {
    list: () => ipcRenderer.invoke('db:clients:list'),
    get: (id: number) => ipcRenderer.invoke('db:clients:get', id),
    add: (row: object) => ipcRenderer.invoke('db:clients:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:clients:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:clients:delete', id)
  },
  orderBooks: {
    list: () => ipcRenderer.invoke('db:orderBooks:list'),
    get: (id: number) => ipcRenderer.invoke('db:orderBooks:get', id),
    add: (row: { name: string; view_type?: string; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => ipcRenderer.invoke('db:orderBooks:add', row),
    update: (id: number, row: { name?: string; view_type?: string; archived?: number; order_number_format?: string | null; repertorium_oral_unit_id?: number | null; repertorium_page_unit_id?: number | null }) => ipcRenderer.invoke('db:orderBooks:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:orderBooks:delete', id)
  },
  orders: {
    list: (bookId?: number) => ipcRenderer.invoke('db:orders:list', bookId),
    get: (id: number) => ipcRenderer.invoke('db:orders:get', id),
    add: (row: object) => ipcRenderer.invoke('db:orders:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:orders:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:orders:delete', id),
    deleteAllButFirstInBook: (bookId: number) => ipcRenderer.invoke('db:orders:deleteAllButFirstInBook', bookId),
    issueInvoice: (id: number, invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null; invoice_provider_source?: string | null }) => ipcRenderer.invoke('db:orders:issueInvoice', id, invoice_number, invoice_date, opts),
    issueInvoices: (orderIds: number[], invoice_number: string, invoice_date: string, opts?: { invoice_sale_date?: string | null; payment_due_at?: string | null; invoice_notes?: string | null; invoice_bank_account_id?: number | null; wfirma_company_account_id?: number | null; invoice_provider_source?: string | null }) => ipcRenderer.invoke('db:orders:issueInvoices', orderIds, invoice_number, invoice_date, opts),
    clearInvoice: (id: number) => ipcRenderer.invoke('db:orders:clearInvoice', id),
    nextInvoiceNumber: (providerSource?: 'local' | 'wfirma') => ipcRenderer.invoke('db:orders:nextInvoiceNumber', providerSource)
  },
  subcontracts: {
    list: () => ipcRenderer.invoke('db:subcontracts:list'),
    listByOrderId: (orderId: number) => ipcRenderer.invoke('db:subcontracts:listByOrderId', orderId),
    get: (id: number) => ipcRenderer.invoke('db:subcontracts:get', id),
    add: (row: object) => ipcRenderer.invoke('db:subcontracts:add', row),
    update: (id: number, row: object) => ipcRenderer.invoke('db:subcontracts:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:subcontracts:delete', id),
    nextSubcontractNumber: () => ipcRenderer.invoke('db:subcontracts:nextSubcontractNumber')
  },
  clientUnitRates: {
    list: (clientId: number) => ipcRenderer.invoke('db:clientUnitRates:list', clientId),
    get: (clientId: number, unitId: number, preferredCurrency?: string | null) => ipcRenderer.invoke('db:clientUnitRates:get', clientId, unitId, preferredCurrency),
    set: (clientId: number, unitId: number, rate: number, currency?: string | null) => ipcRenderer.invoke('db:clientUnitRates:set', clientId, unitId, rate, currency)
  },
  clientDefaultUnitRates: {
    list: (clientId: number) => ipcRenderer.invoke('db:clientDefaultUnitRates:list', clientId),
    get: (clientId: number, unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => ipcRenderer.invoke('db:clientDefaultUnitRates:get', clientId, unitId, argumentCandidates, preferredCurrency),
    set: (clientId: number, unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => ipcRenderer.invoke('db:clientDefaultUnitRates:set', clientId, unitId, rate, currency, argumentsList),
    update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => ipcRenderer.invoke('db:clientDefaultUnitRates:update', id, rate, currency, argumentsList),
    delete: (id: number) => ipcRenderer.invoke('db:clientDefaultUnitRates:delete', id)
  },
  contractorUnitRates: {
    list: (contractorId: number) => ipcRenderer.invoke('db:contractorUnitRates:list', contractorId),
    get: (contractorId: number, unitId: number, languagePairId?: number | null) => ipcRenderer.invoke('db:contractorUnitRates:get', contractorId, unitId, languagePairId),
    set: (contractorId: number, unitId: number, rate: number, languagePairId?: number | null) => ipcRenderer.invoke('db:contractorUnitRates:set', contractorId, unitId, rate, languagePairId)
  },
  defaultUnitRates: {
    list: () => ipcRenderer.invoke('db:defaultUnitRates:list'),
    get: (unitId: number, argumentCandidates?: { key: string; value?: string | null }[] | null, preferredCurrency?: string | null) => ipcRenderer.invoke('db:defaultUnitRates:get', unitId, argumentCandidates, preferredCurrency),
    set: (unitId: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => ipcRenderer.invoke('db:defaultUnitRates:set', unitId, rate, currency, argumentsList),
    update: (id: number, rate: number, currency: string, argumentsList?: { key: string; value?: string | null }[] | { key: string; value?: string | null } | null) => ipcRenderer.invoke('db:defaultUnitRates:update', id, rate, currency, argumentsList),
    delete: (id: number) => ipcRenderer.invoke('db:defaultUnitRates:delete', id)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('db:settings:get', key),
    set: (key: string, value: string | number) => ipcRenderer.invoke('db:settings:set', key, value),
    hasRateCurrencies: () => ipcRenderer.invoke('db:settings:hasRateCurrencies') as Promise<boolean>,
    setInvoiceLogo: (sourceFilePath: string | null) => ipcRenderer.invoke('settings:setInvoiceLogo', sourceFilePath),
    exportUnitsServicesPreset: (uiLocale: string) => ipcRenderer.invoke('settings:exportUnitsServicesPreset', uiLocale) as Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>,
    restorePredefinedPreset: (uiLocale: string) => ipcRenderer.invoke('settings:restorePredefinedPreset', uiLocale) as Promise<{ ok: boolean; error?: string }>,
    clearPredefinedPreset: (password: string) => ipcRenderer.invoke('settings:clearPredefinedPreset', password) as Promise<{ ok: boolean; error?: string }>,
    verifyPassword: (password: string) => ipcRenderer.invoke('settings:verifyPassword', password) as Promise<{ ok: boolean }>
  },
  customColumns: {
    listByBook: (bookId: number) => ipcRenderer.invoke('db:customColumns:listByBook', bookId),
    add: (row: { book_id: number; name: string; col_type?: string }) => ipcRenderer.invoke('db:customColumns:add', row),
    update: (id: number, row: { name?: string; col_type?: string; sort_order?: number }) => ipcRenderer.invoke('db:customColumns:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:customColumns:delete', id)
  },
  customColumnValues: {
    getByOrder: (orderId: number) => ipcRenderer.invoke('db:customColumnValues:getByOrder', orderId),
    set: (orderId: number, columnId: number, value: string | null) => ipcRenderer.invoke('db:customColumnValues:set', orderId, columnId, value),
    bulkSet: (orderId: number, values: Record<number, string | null>) => ipcRenderer.invoke('db:customColumnValues:bulkSet', orderId, values)
  },
  bankAccounts: {
    list: () => ipcRenderer.invoke('db:bankAccounts:list'),
    get: (id: number) => ipcRenderer.invoke('db:bankAccounts:get', id),
    add: (row: { bank_name?: string; account_number: string; swift?: string; currency?: string; is_default?: number }) => ipcRenderer.invoke('db:bankAccounts:add', row),
    update: (id: number, row: { bank_name?: string; account_number?: string; swift?: string; currency?: string; is_default?: number }) => ipcRenderer.invoke('db:bankAccounts:update', id, row),
    delete: (id: number) => ipcRenderer.invoke('db:bankAccounts:delete', id),
    setDefault: (id: number) => ipcRenderer.invoke('db:bankAccounts:setDefault', id)
  },
  dialog: {
    openFile: (opts?: { filters?: { name: string; extensions: string[] }[]; title?: string }) => ipcRenderer.invoke('dialog:openFile', opts),
    chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory') as Promise<string | null>
  },
  analytics: {
    totals: (bookId?: number) => ipcRenderer.invoke('db:analytics:totals', bookId),
    paymentSummary: (bookId?: number) => ipcRenderer.invoke('db:analytics:paymentSummary', bookId)
  },
  gus: {
    fetchByNip: (nip: string) => ipcRenderer.invoke('gus:fetchByNip', nip)
  },
  wfirma: {
    testConnection: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) =>
      ipcRenderer.invoke('wfirma:testConnection', accessKey, secretKey, appKey, companyId) as Promise<{ ok: boolean; message: string }>
    ,
    listCompanyAccounts: (accessKey: string, secretKey: string, appKey?: string, companyId?: string | null) =>
      ipcRenderer.invoke('wfirma:listCompanyAccounts', accessKey, secretKey, appKey, companyId) as Promise<Array<{ id: number; account_number: string; bank_name?: string; name?: string; currency?: string }>>
  },
  export: {
    ordersXls: (bookId?: number, columns?: { key: string; label: string }[]) => ipcRenderer.invoke('export:ordersXls', bookId, columns),
    ordersXlsx: (bookId?: number, columns?: { key: string; label: string }[]) => ipcRenderer.invoke('export:ordersXlsx', bookId, columns),
    ordersPdf: (bookId?: number, columns?: { key: string; label: string }[]) => ipcRenderer.invoke('export:ordersPdf', bookId, columns),
    analyticsXlsx: (data: { name: string; amount: number; count: number }[]) => ipcRenderer.invoke('export:analyticsXlsx', data),
    earningsReportXlsx: (payload: { tableData: { name: string; keyParts?: string[]; count: number; net: number; vat: number; gross: number }[]; chartData: { name: string; net: number; vat: number; gross: number; value?: number }[]; rowGroupLabels?: string[]; labels: { rowLabel: string; count: string; valueColumn: string; sheetTable: string; sheetChart: string; net: string; vat: string; gross: string } }) => ipcRenderer.invoke('export:earningsReportXlsx', payload),
    orderConfirmationPdf: (orderId: number) => ipcRenderer.invoke('export:orderConfirmationPdf', orderId),
    orderConfirmationPdfSubcontract: (subcontractId: number) => ipcRenderer.invoke('export:orderConfirmationPdfSubcontract', subcontractId),
    invoicePdf: (orderId: number, extra?: { notes?: string; bankAccountId?: number }) => ipcRenderer.invoke('export:invoicePdf', orderId, extra),
    invoicePdfMulti: (orderIds: number[], extra?: { notes?: string; bankAccountId?: number }) => ipcRenderer.invoke('export:invoicePdfMulti', orderIds, extra),
    invoicePdfToPath: (orderIds: number[], filePath: string, extra?: { notes?: string; bankAccountId?: number }) => ipcRenderer.invoke('export:invoicePdfToPath', orderIds, filePath, extra)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
