/**
 * Mock API when running in browser only (e.g. Cursor preview at localhost:5173).
 * In Electron, window.api is provided by preload; here we fake it so the UI renders.
 */
import type { ElectronApi } from './types/api'

const noop = () => Promise.resolve()
const noopNum = () => Promise.resolve(0)
const empty = () => Promise.resolve([])
const emptyObj = () => Promise.resolve(null)

export const mockApi: ElectronApi = {
  auth: {
    getSession: () => Promise.resolve({ hasAnyUser: true, user: null, organizations: [{ id: 'admin', name: 'admin' }, { id: 'admin2', name: 'admin2' }], currentOrg: null }),
    register: () => Promise.resolve({ ok: true, switched_org: false, user: { id: 1, email: 'owner@example.com', display_name: 'Owner', role: 'owner' } }),
    login: () => Promise.resolve({ ok: true, switched_org: false, user: { id: 1, email: 'owner@example.com', display_name: 'Owner', role: 'owner' } }),
    logout: noop,
    changePassword: () => Promise.resolve({ ok: true }),
    changeDisplayName: () => Promise.resolve({ ok: true })
  },
  app: { relaunch: noop },
  languages: { list: empty, add: noopNum, update: noop, delete: noop },
  languagePairs: { list: empty, add: noopNum, update: noop, delete: noop },
  unitCategories: { list: empty, add: noopNum, update: noop, delete: noop },
  units: { list: empty, add: noopNum, update: noop, delete: noop, setBase: noop },
  contractors: { list: empty, get: emptyObj, add: noopNum, update: noop, delete: noop },
  specializations: { list: empty, add: noopNum, update: noop, delete: noop },
  services: { list: empty, add: noopNum, update: noop, delete: noop },
  serviceVatRules: { listByService: () => Promise.resolve([]), upsert: noopNum, delete: noop },
  clients: { list: empty, get: emptyObj, add: noopNum, update: noop, delete: noop },
  orderBooks: { list: empty, get: () => Promise.resolve(undefined), add: noopNum, update: noop, delete: noop },
  orders: { list: () => empty(), get: emptyObj, add: noopNum, update: noop, delete: noop, deleteAllButFirstInBook: () => Promise.resolve(0), issueInvoice: noop, issueInvoices: noop, clearInvoice: noop, nextInvoiceNumber: () => Promise.resolve('FV/2025/1') },
  subcontracts: { list: empty, listByOrderId: () => Promise.resolve([]), get: emptyObj, add: noopNum, update: noop, delete: noop, nextSubcontractNumber: () => Promise.resolve('PZ/1') },
  clientUnitRates: { list: () => Promise.resolve([]), get: () => Promise.resolve(undefined), set: noop },
  clientDefaultUnitRates: { list: () => Promise.resolve([]), get: () => Promise.resolve(undefined), set: noop, update: noop, delete: noop },
  contractorUnitRates: { list: () => Promise.resolve([]), get: () => Promise.resolve(undefined), set: noop },
  defaultUnitRates: { list: () => Promise.resolve([]), get: () => Promise.resolve(undefined), set: noop, update: noop, delete: noop },
  customColumns: { listByBook: () => empty(), add: noopNum, update: noop, delete: noop },
  customColumnValues: { getByOrder: () => Promise.resolve({}), set: noop, bulkSet: noop },
  bankAccounts: { list: empty, get: () => Promise.resolve(undefined), add: noopNum, update: noop, delete: noop, setDefault: noop },
  settings: { get: () => Promise.resolve(null), set: noop },
  dialog: { openFile: () => Promise.resolve(null) },
  export: { ordersXls: (_?: number, __?: { key: string; label: string }[]) => Promise.resolve(false), ordersXlsx: (_?: number, __?: { key: string; label: string }[]) => Promise.resolve(false), ordersPdf: (_?: number, __?: { key: string; label: string }[]) => Promise.resolve(false), analyticsXlsx: () => Promise.resolve(false), earningsReportXlsx: () => Promise.resolve(false), orderConfirmationPdf: () => Promise.resolve(false), orderConfirmationPdfSubcontract: () => Promise.resolve(false), invoicePdf: () => Promise.resolve(false), invoicePdfMulti: () => Promise.resolve(false) },
  analytics: {
    totals: () => Promise.resolve({ byCategory: [] }),
    paymentSummary: () => Promise.resolve({ byStatus: [], overdue: { count: 0, total: 0 } })
  },
  gus: {
    fetchByNip: () => Promise.resolve({ error: 'Not available in browser. Use the desktop app.' })
  },
  wfirma: {
    testConnection: () => Promise.resolve({ ok: false, message: 'Not available in browser' }),
    listCompanyAccounts: () => Promise.resolve([])
  }
}
