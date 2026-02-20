import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import orderBookIcon from './assets/nav/order-book.png'
import subcontractsIcon from './assets/nav/subcontracts.png'
import customersIcon from './assets/nav/customers.png'
import contractorsIcon from './assets/nav/contractors.png'
import invoicesIcon from './assets/nav/invoices.png'
import analyticsIcon from './assets/nav/analytics.png'
import settingsIcon from './assets/nav/settings.png'
import Orders from './pages/Orders'
import Subcontracts from './pages/Subcontracts'
import Clients from './pages/Clients'
import Contractors from './pages/Contractors'
import Invoices from './pages/Invoices'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import SettingsWarnings, { SettingsWarningsNavLink } from './components/SettingsWarnings'

const navIcons = {
  orderBook: orderBookIcon,
  subcontracts: subcontractsIcon,
  clients: customersIcon,
  contractors: contractorsIcon,
  invoices: invoicesIcon,
  analytics: analyticsIcon,
  settings: settingsIcon
} as const
const TOPBAR_ICON_BASE = 68
const TOPBAR_BTN_WIDTH_BASE = 122
const navBarButtonStyle = (isActive: boolean) => ({
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  width: TOPBAR_BTN_WIDTH_BASE,
  minWidth: TOPBAR_BTN_WIDTH_BASE,
    padding: '6px 4px',
  border: 'none',
  borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'var(--color-text)',
  fontWeight: 400,
  gap: 2
})

type SessionUser = { id: number; email: string; display_name?: string | null; role: string }

type ServerNotice = { id: string; date: string; title: string; body: string }

/** Ogranicza HTML do bezpiecznych tagów (treść z serwera). */
function sanitizeNoticeHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:\s*/gi, '')
  return s
}

function Layout({
  user,
  onLogout,
  onOpenNoticeHistory,
  unreadNoticesCount,
  licenseWarning = false
}: {
  user: SessionUser
  onLogout: () => Promise<void>
  onOpenNoticeHistory: () => void
  unreadNoticesCount: number
  licenseWarning?: boolean
}) {
  const { t } = useTranslation()
  const [warningsMinimized, setWarningsMinimized] = useState(false)
  const [warningsCount, setWarningsCount] = useState(0)
  const [navIconScale, setNavIconScale] = useState(100)
  const [uiScale, setUiScale] = useState(100)
  const [updateReady, setUpdateReady] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('')
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    window.api?.settings?.get?.('ui_theme').then((v: unknown) => {
      const theme = v === 'high_contrast' ? 'high-contrast' : 'default'
      document.documentElement.dataset.theme = theme
    })
  }, [])
  useEffect(() => {
    window.api?.settings?.get?.('nav_icon_scale').then((v: unknown) => {
      const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : 100
      if (!Number.isNaN(n)) setNavIconScale(Math.min(130, Math.max(60, n)))
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<number>).detail
      if (typeof d === 'number') setNavIconScale(d)
    }
    window.addEventListener('jobraven:nav-icon-scale-changed', handler)
    return () => window.removeEventListener('jobraven:nav-icon-scale-changed', handler)
  }, [])
  useEffect(() => {
    window.api?.settings?.get?.('ui_scale').then((v: unknown) => {
      const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : 100
      if (!Number.isNaN(n)) setUiScale(Math.min(130, Math.max(80, n)))
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<number>).detail
      if (typeof d === 'number') setUiScale(d)
    }
    window.addEventListener('jobraven:ui-scale-changed', handler)
    return () => window.removeEventListener('jobraven:ui-scale-changed', handler)
  }, [])
  useEffect(() => {
    const handler = () => setUpdateReady(true)
    window.addEventListener('jobraven:update-downloaded', handler)
    return () => window.removeEventListener('jobraven:update-downloaded', handler)
  }, [])
  useEffect(() => {
    window.api?.app?.getUpdateStatus?.().then((s: { version?: string; updateAvailable?: boolean }) => {
      if (s?.version != null) setAppVersion(s.version)
      if (typeof s?.updateAvailable === 'boolean') setUpdateAvailable(s.updateAvailable)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ updateAvailable?: boolean }>).detail
      if (typeof d?.updateAvailable === 'boolean') setUpdateAvailable(d.updateAvailable)
    }
    window.addEventListener('jobraven:update-status', handler)
    return () => window.removeEventListener('jobraven:update-status', handler)
  }, [])

  const iconSize = Math.round(TOPBAR_ICON_BASE * (navIconScale / 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {licenseWarning && (
        <div
          role="alert"
          style={{
            flexShrink: 0,
            padding: '8px 12px',
            background: 'var(--color-warning-bg, #fef3c7)',
            color: 'var(--color-warning-text, #92400e)',
            borderBottom: '1px solid var(--color-warning-border, #f59e0b)',
            fontSize: '0.9rem',
            textAlign: 'center'
          }}
        >
          {t('auth.licenseWarningBanner')}
        </div>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          zoom: uiScale / 100
        }}
      >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-nav-border)',
          background: 'var(--color-bg-secondary)',
          flexShrink: 0
        }}
      >
        <div className="nav-tray" style={{ background: '#ECEDEC', borderRadius: 8, padding: '6px 8px' }}>
          <nav style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
            <NavLink to="/" end className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.orderBook')}>
              <img src={navIcons.orderBook} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.orderBook')}</span>
            </NavLink>
            <NavLink to="/subcontracts" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.subcontracts')}>
              <img src={navIcons.subcontracts} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.subcontracts')}</span>
            </NavLink>
            <NavLink to="/clients" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.clients')}>
              <img src={navIcons.clients} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.clients')}</span>
            </NavLink>
            <NavLink to="/contractors" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.contractors')}>
              <img src={navIcons.contractors} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.contractors')}</span>
            </NavLink>
            <NavLink to="/invoices" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.invoices')}>
              <img src={navIcons.invoices} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.invoices')}</span>
            </NavLink>
            <NavLink to="/analytics" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.analytics')}>
              <img src={navIcons.analytics} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.analytics')}</span>
            </NavLink>
            <NavLink to="/settings" className="nav-bar-btn" style={({ isActive }) => navBarButtonStyle(isActive)} title={t('nav.settings')}>
              <img src={navIcons.settings} alt="" width={iconSize} height={iconSize} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap' }}>{t('nav.settings')}</span>
            </NavLink>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div
            data-slot="ad-banner"
            data-banner-size="700x100"
            style={{ width: 700, height: 100, flexShrink: 0 }}
            aria-hidden
          />
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, padding: '1.5rem', overflow: 'auto' }}>
        <SettingsWarnings
          minimized={warningsMinimized}
          onMinimize={() => setWarningsMinimized(true)}
          onWarningsCountChange={setWarningsCount}
        />
        <Routes>
          <Route path="/" element={<Orders />} />
          <Route path="/subcontracts" element={<Subcontracts />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {updateReady && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'var(--color-success, #22c55e)', color: '#fff', fontSize: '0.8rem', textAlign: 'center' }}>
          {t('app.updateReady')}
        </div>
      )}
      <footer
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '8px 16px',
          borderTop: '1px solid var(--color-nav-border)',
          background: 'var(--color-bg-secondary)',
          fontSize: '0.8rem',
          color: 'var(--color-text-secondary)'
        }}
      >
        {warningsMinimized && warningsCount > 0 && (
          <SettingsWarningsNavLink count={warningsCount} onExpand={() => setWarningsMinimized(false)} inline />
        )}
        {appVersion && (
          <>
            <span
              title={updateAvailable ? t('app.updateAvailable') : t('app.versionUpToDate')}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                borderRadius: 4,
                fontWeight: 600,
                background: updateAvailable ? 'var(--color-update-available-bg, #fef2f2)' : 'var(--color-update-ok-bg, #f0fdf4)',
                color: updateAvailable ? 'var(--color-update-available-text, #b91c1c)' : 'var(--color-update-ok-text, #166534)'
              }}
            >
              v{appVersion}
            </span>
            {updateAvailable && (
              <button
                type="button"
                onClick={() => window.api?.app?.openUpdateDownloadUrl?.()}
                style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, borderRadius: 4, border: '1px solid var(--color-update-available-text, #b91c1c)', background: 'var(--color-update-available-bg, #fef2f2)', color: 'var(--color-update-available-text, #b91c1c)', cursor: 'pointer' }}
              >
                {t('app.downloadUpdate')}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onOpenNoticeHistory}
          style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid var(--color-nav-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          {t('notifications.historyButton')}{unreadNoticesCount > 0 ? ` (${unreadNoticesCount})` : ''}
        </button>
        <button
          type="button"
          onClick={onLogout}
          style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid var(--color-nav-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)' }}
        >
          {t('auth.logout')}
        </button>
        <span style={{ color: 'var(--color-text-muted)', wordBreak: 'break-all', maxWidth: 220 }} title={user.email}>
          {user.email}
        </span>
      </footer>
      </div>
    </div>
  )
}

const UI_LANGUAGES = [{ code: 'pl', label: 'Polski' }, { code: 'en', label: 'English' }] as const

export default function App() {
  const { t, i18n } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null)
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([])
  const [noticesReady, setNoticesReady] = useState(false)
  const [showServerNotice, setShowServerNotice] = useState(false)
  const [showNoticeHistory, setShowNoticeHistory] = useState(false)
  const [expandedNoticeId, setExpandedNoticeId] = useState<string | null>(null)
  const [serverNotices, setServerNotices] = useState<ServerNotice[]>([])
  const [hasAnyUser, setHasAnyUser] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registerSuccessMessage, setRegisterSuccessMessage] = useState<string | null>(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null)
  const [resendVerifyMessage, setResendVerifyMessage] = useState<string | null>(null)
  const [lastAuthErrorCode, setLastAuthErrorCode] = useState<string | null>(null)
  const [licenseWarning, setLicenseWarning] = useState(false)
  const [updateRequiredVersion, setUpdateRequiredVersion] = useState<string | null>(null)

  const refreshSession = async () => {
    const session = await window.api.auth.getSession()
    setSessionUser(session.user)
    setHasAnyUser(session.hasAnyUser)
    setOrganizations(session.organizations ?? [])
    setLicenseWarning(session.licenseWarning === true)
    const preferredOrg = session.currentOrg?.name ?? session.currentOrg?.id ?? session.organizations?.[0]?.name ?? session.organizations?.[0]?.id ?? ''
    setSelectedOrgId(preferredOrg)
    setMode(session.hasAnyUser ? 'login' : 'register')
  }

  useEffect(() => {
    const run = async () => {
      const updateReq = await window.api?.app?.getUpdateRequired?.().catch(() => ({ required: false, version: null }))
      if (updateReq?.required && updateReq?.version) {
        setUpdateRequiredVersion(updateReq.version)
        setSessionUser(null)
        setLoading(false)
        return
      }
      await refreshSession()
      setLoading(false)
    }
    run()
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<{ version?: string }>).detail?.version
      if (typeof v === 'string') setUpdateRequiredVersion(v)
    }
    window.addEventListener('jobraven:update-required', handler)
    return () => window.removeEventListener('jobraven:update-required', handler)
  }, [])

  useEffect(() => {
    const handler = () => { refreshSession() }
    window.addEventListener('jobraven:session-cleared', handler)
    return () => window.removeEventListener('jobraven:session-cleared', handler)
  }, [])

  // Apply UI theme also on auth screen (before login).
  useEffect(() => {
    window.api?.settings?.get?.('ui_theme').then((v: unknown) => {
      const theme = v === 'high_contrast' ? 'high-contrast' : 'default'
      document.documentElement.dataset.theme = theme
    })
  }, [])

  // Workaround: na Windows w Electron po dialogu (np. confirm) fokus w polach się „zacieca”.
  // Przy kliknięciu w pole lub etykietę wymuszamy focus i ewentualnie blur obecnego elementu.
  useEffect(() => {
    const getFocusTarget = (el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null => {
      if (!el || !el.tagName) return null
      const tag = el.tagName.toLowerCase()
      if (tag === 'label') {
        const lab = el as HTMLLabelElement
        const control = lab.control ?? (lab.htmlFor ? document.getElementById(lab.htmlFor) : null)
        if (control && /^(input|textarea|select)$/i.test(control.tagName)) return control as HTMLInputElement
        let next: Element | null = lab.nextElementSibling
        while (next) {
          if (/^(input|textarea|select)$/i.test(next.tagName)) return next as HTMLInputElement
          next = next.nextElementSibling
        }
        const parent = lab.parentElement
        if (parent) {
          const first = parent.querySelector('input:not([type="hidden"]), textarea, select')
          if (first) return first as HTMLInputElement
        }
        return null
      }
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return el as HTMLInputElement
      if (el.isContentEditable && el.getAttribute('contenteditable') === 'true') return el as HTMLInputElement
      return null
    }
    const handler = (e: MouseEvent) => {
      const target = getFocusTarget(e.target as HTMLElement)
      if (!target || (target as HTMLInputElement).disabled || (target as HTMLInputElement).readOnly) return
      const forceFocus = () => {
        if (!document.body.contains(target)) return
        if (document.activeElement === target) return
        if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') (document.activeElement as HTMLElement).blur()
        target.focus()
      }
      requestAnimationFrame(() => {
        forceFocus()
        setTimeout(forceFocus, 80)
        setTimeout(forceFocus, 200)
      })
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [])

  useEffect(() => {
    if (!sessionUser) {
      setDismissedNoticeIds([])
      setNoticesReady(false)
      setShowServerNotice(false)
      setShowNoticeHistory(false)
      setExpandedNoticeId(null)
      setServerNotices([])
      return
    }
    const key = `notifications_dismissed_u_${sessionUser.id}`
    window.api.settings.get(key).then((raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : []
        setDismissedNoticeIds(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [])
      } catch {
        setDismissedNoticeIds([])
      }
    }).catch(() => setDismissedNoticeIds([]))

    let cancelled = false
    const loadNotices = async () => {
      try {
        const res = await window.api.app.getNotices()
        if (!cancelled) setServerNotices(Array.isArray(res?.notices) ? res.notices : [])
      } catch {
        if (!cancelled) setServerNotices([])
      } finally {
        if (!cancelled) setNoticesReady(true)
      }
    }
    // Natychmiast + polling, żeby nowe komunikaty wpadały bez ponownego logowania.
    loadNotices()
    const timer = window.setInterval(loadNotices, 5000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sessionUser])

  const unreadNotices = serverNotices.filter(n => !dismissedNoticeIds.includes(n.id))
  const currentNotice = unreadNotices[0] ?? null

  useEffect(() => {
    if (!sessionUser || !noticesReady || !currentNotice) {
      setShowServerNotice(false)
      return
    }
    setShowServerNotice(true)
  }, [sessionUser, noticesReady, currentNotice?.id])

  // Rejestracja odczytu komunikatu (popup lub rozwinięcie w historii)
  useEffect(() => {
    if (!currentNotice?.id || !sessionUser) return
    if (showServerNotice) {
      window.api.app.recordNoticeRead(currentNotice.id).catch(() => {})
    }
  }, [showServerNotice, currentNotice?.id, sessionUser])

  const dismissNotice = async (noticeId: string) => {
    if (!sessionUser) return
    const next = Array.from(new Set([...dismissedNoticeIds, noticeId]))
    setDismissedNoticeIds(next)
    await window.api.settings.set(`notifications_dismissed_u_${sessionUser.id}`, JSON.stringify(next))
    if (currentNotice?.id === noticeId) setShowServerNotice(false)
  }

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLastAuthErrorCode(null)
    setRegisterSuccessMessage(null)
    setResendVerifyMessage(null)
    if (!email.trim() || !password.trim()) {
      setError(t('auth.errorRequired'))
      return
    }
    let result
    try {
      result = mode === 'register'
        ? await window.api.auth.register(email.trim(), password, displayName.trim() || null, selectedOrgId, i18n.language)
        : await window.api.auth.login(email.trim(), password, selectedOrgId)
    } catch (err) {
      setError(t('auth.error_UNKNOWN'))
      return
    }
    if (!result.ok) {
      const code = result.error ?? 'UNKNOWN'
      setLastAuthErrorCode(code)
      setError(t(`auth.error_${code}`))
      return
    }
    setLastAuthErrorCode(null)
    if (mode === 'register' && (result as { message?: string }).message === 'EMAIL_VERIFICATION_SENT') {
      setRegisterSuccessMessage(t('auth.verificationEmailSent'))
      setPassword('')
      return
    }
    setPassword('')
    await refreshSession()
  }

  const handleResendVerification = async () => {
    setResendVerifyMessage(null)
    setError(null)
    const result = await window.api.auth.resendVerification(email.trim(), i18n.language)
    if (result.ok) {
      setResendVerifyMessage(t('auth.resendVerificationSent'))
    } else {
      setError(t(`auth.error_${result.error ?? 'UNKNOWN'}`))
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotPasswordMessage(null)
    setError(null)
    if (!forgotPasswordEmail.trim()) return
    const result = await window.api.auth.forgotPassword(forgotPasswordEmail.trim(), i18n.language)
    if (result.ok) {
      setForgotPasswordMessage(t('auth.forgotPasswordSent'))
    } else {
      setError(t(`auth.error_${result.error ?? 'UNKNOWN'}`))
    }
  }

  const logout = async () => {
    await window.api.auth.logout()
    setPassword('')
    await refreshSession()
  }

  if (loading) return <div style={{ padding: 24 }}>{t('common.loading')}</div>

  if (!sessionUser && updateRequiredVersion) {
    const releaseUrl = `https://github.com/mkucharski8/JobRaven/releases/tag/v${updateRequiredVersion}`
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <h1 style={{ marginBottom: 16, fontSize: '1.25rem' }}>{t('app.updateRequiredTitle')}</h1>
        <p style={{ marginBottom: 24, textAlign: 'center', maxWidth: 420 }}>{t('app.updateRequiredMessage', { version: updateRequiredVersion })}</p>
        <button
          type="button"
          className="primary"
          onClick={() => window.api?.app?.openUpdateDownloadUrl?.()}
          style={{ marginBottom: 12, padding: '10px 20px', fontSize: '1rem' }}
        >
          {t('app.downloadUpdate')}
        </button>
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { e.preventDefault(); window.api?.app?.openUpdateDownloadUrl?.() }}
          style={{ fontSize: '0.9rem', color: 'var(--color-link, #2563eb)', wordBreak: 'break-all' }}
        >
          {releaseUrl}
        </a>
      </div>
    )
  }

  if (sessionUser) {
    return (
      <>
        <Layout
          user={sessionUser}
          onLogout={logout}
          onOpenNoticeHistory={() => setShowNoticeHistory(true)}
          unreadNoticesCount={unreadNotices.length}
          licenseWarning={licenseWarning}
        />
        {showServerNotice && currentNotice && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 9999 }}>
              <div className="card" style={{ width: '100%', maxWidth: 560 }}>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>{t('notifications.title')}</h2>
              <p style={{ marginTop: 0, color: '#71717a' }}>{t('notifications.subtitle')}</p>
              <div style={{ border: '1px solid var(--color-nav-border)', borderRadius: 8, padding: 12, background: 'var(--color-bg-secondary)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: '1rem' }}>{currentNotice.title}</h3>
                <div style={{ marginTop: 0 }} dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(currentNotice.body) }} />
                <div style={{ fontSize: '0.8rem', color: '#71717a' }}>{currentNotice.date}</div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => setShowNoticeHistory(true)}>{t('notifications.openHistory')}</button>
                <button type="button" className="primary" onClick={() => dismissNotice(currentNotice.id)}>{t('notifications.dismiss')}</button>
              </div>
            </div>
          </div>
        )}
        {showNoticeHistory && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 9998 }}>
            <div className="card" style={{ width: '100%', maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }}>
              <h2 style={{ marginTop: 0 }}>{t('notifications.historyTitle')}</h2>
              <p style={{ marginTop: 0, color: '#71717a' }}>{t('notifications.historyHint')}</p>
              <div style={{ border: '1px solid var(--color-nav-border)', borderRadius: 8, maxHeight: 520, overflowY: 'auto' }}>
                {serverNotices.map(notice => {
                  const dismissed = dismissedNoticeIds.includes(notice.id)
                  const expanded = expandedNoticeId === notice.id
                  return (
                    <div key={notice.id} style={{ borderBottom: '1px solid var(--color-nav-border)', background: 'var(--color-bg-secondary)' }}>
                      <button
                        type="button"
                        onClick={() => {
                        const next = expandedNoticeId === notice.id ? null : notice.id
                        setExpandedNoticeId(next)
                        if (next === notice.id) window.api.app.recordNoticeRead(notice.id).catch(() => {})
                      }}
                        style={{ width: '100%', textAlign: 'left', padding: 12, border: 0, background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                      >
                        <span style={{ fontWeight: 600 }}>{notice.title}</span>
                        <span style={{ fontSize: '0.8rem', color: dismissed ? '#16a34a' : '#d97706' }}>
                          {dismissed ? t('notifications.statusDismissed') : t('notifications.statusUnread')} {expanded ? '▾' : '▸'}
                        </span>
                      </button>
                      {expanded && (
                        <div style={{ padding: '0 12px 12px 12px' }}>
                          <div style={{ marginTop: 0, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(notice.body) }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.8rem', color: '#71717a' }}>{notice.date}</span>
                            {!dismissed && (
                              <button type="button" onClick={() => dismissNotice(notice.id)}>{t('notifications.dismiss')}</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {serverNotices.length === 0 && (
                  <div style={{ padding: 12, color: '#71717a' }}>
                    {t('notifications.historyEmpty')}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="primary" onClick={() => {
                  setShowNoticeHistory(false)
                  setExpandedNoticeId(null)
                }}>{t('notifications.ok')}</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  const setUiLanguage = (code: string) => {
    if (code !== i18n.language) {
      i18n.changeLanguage(code)
      window.api?.settings?.set?.('ui_language', code)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{t('auth.languageLabel')}</span>
          {UI_LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => setUiLanguage(code)}
              style={{
                padding: '4px 10px',
                fontSize: '0.9rem',
                border: i18n.language === code ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 6,
                background: i18n.language === code ? 'var(--color-bg-secondary)' : 'transparent',
                color: 'var(--color-text)',
                cursor: 'pointer'
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: 10, fontSize: '1.3rem' }}>{mode === 'register' ? t('auth.registerTitle') : t('auth.loginTitle')}</h1>
        <p style={{ marginTop: 0, color: '#71717a' }}>{mode === 'register' ? t('auth.registerHint') : t('auth.loginHint')}</p>
        <form onSubmit={submitAuth} style={{ display: 'grid', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('auth.organization')}</label>
            <input
              type="text"
              value={selectedOrgId}
              onChange={e => setSelectedOrgId(e.target.value)}
              placeholder={t('auth.organizationPlaceholder')}
            />
          </div>
          {mode === 'register' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{t('auth.displayName')}</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('auth.displayNamePlaceholder')} />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('auth.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>{t('auth.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {registerSuccessMessage && <p className="msg-success" style={{ margin: 0, color: 'var(--color-success, #166534)' }}>{registerSuccessMessage}</p>}
          {error && <p className="msg-error" style={{ margin: 0 }}>{error}</p>}
          {error && lastAuthErrorCode === 'EMAIL_NOT_VERIFIED' && (
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>
              <button type="button" onClick={handleResendVerification} className="link-like">
                {t('auth.resendVerificationLink')}
              </button>
            </p>
          )}
          {resendVerifyMessage && <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--color-success, #166534)' }}>{resendVerifyMessage}</p>}
          <button type="submit" className="primary">{mode === 'register' ? t('auth.register') : t('auth.login')}</button>
        </form>
        {!showForgotPassword && mode === 'login' && (
          <button type="button" onClick={() => { setShowForgotPassword(true); setError(null); setForgotPasswordMessage(null) }} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {t('auth.forgotPassword')}
          </button>
        )}
        {showForgotPassword && (
          <form onSubmit={handleForgotPassword} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <label style={{ display: 'block', marginBottom: 4 }}>{t('auth.email')}</label>
            <input type="email" value={forgotPasswordEmail} onChange={e => setForgotPasswordEmail(e.target.value)} placeholder="name@example.com" style={{ width: '100%', marginBottom: 8 }} />
            <button type="submit" className="primary" style={{ marginRight: 8 }}>{t('auth.sendResetLink')}</button>
            <button type="button" onClick={() => { setShowForgotPassword(false); setForgotPasswordMessage(null); setForgotPasswordEmail('') }}>{t('common.cancel')}</button>
            {forgotPasswordMessage && <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--color-success, #166534)' }}>{forgotPasswordMessage}</p>}
          </form>
        )}
        {hasAnyUser && (
          <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); setRegisterSuccessMessage(null); setShowForgotPassword(false) }} style={{ marginTop: 10 }}>
            {mode === 'register' ? t('auth.goToLogin') : t('auth.goToRegister')}
          </button>
        )}
      </div>
    </div>
  )
}
