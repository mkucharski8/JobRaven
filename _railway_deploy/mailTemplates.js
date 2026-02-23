/**
 * Szablony treści maili w zależności od języka (lang: 'pl' | 'en').
 * Używane przy rejestracji, ponownym wysłaniu linku weryfikacyjnego i resecie hasła.
 */
const templates = {
  pl: {
    verification: {
      subject: 'Potwierdzenie rejestracji – JobRaven',
      body: (link) => `<p>Potwierdź rejestrację w JobRaven, klikając w link:</p><p><a href="${link}">${link}</a></p><p>Link jest ważny 24 godziny.</p>`
    },
    resendVerification: {
      subject: 'Potwierdzenie rejestracji – JobRaven',
      body: (link) => `<p>Kliknij w link, aby potwierdzić adres e-mail:</p><p><a href="${link}">${link}</a></p><p>Link jest ważny 24 godziny.</p>`
    },
    resetPassword: {
      subject: 'Reset hasła – JobRaven',
      body: (link) => `<p>Otrzymujesz tę wiadomość, ponieważ złożono prośbę o reset hasła. Kliknij w link, aby ustawić nowe hasło:</p><p><a href="${link}">${link}</a></p><p>Link jest ważny 1 godzinę. Jeżeli to nie Ty, zignoruj tę wiadomość.</p>`
    },
    verifyEmailPage: {
      successTitle: 'E-mail potwierdzony',
      successText: 'Konto jest aktywne. Możesz się zalogować w aplikacji JobRaven.',
      errorTitle: 'Błąd',
      errorText: 'Link jest nieprawidłowy lub wygasł. Zarejestruj się ponownie lub poproś o nowy link.'
    },
    resetPasswordPage: {
      title: 'Nowe hasło',
      tokenMissing: 'Brak tokenu. Użyj linku z e-maila.',
      passwordLabel: 'Nowe hasło (min. 6 znaków)',
      confirmLabel: 'Potwierdź hasło',
      submit: 'Zapisz hasło',
      passwordsMismatch: 'Hasła się nie zgadzają.',
      success: 'Hasło zmienione. Możesz się zalogować w aplikacji.',
      tokenExpired: 'Link wygasł. Poproś o nowy.',
      error: 'Błąd',
      connectionError: 'Błąd połączenia.'
    }
  },
  en: {
    verification: {
      subject: 'Confirm your registration – JobRaven',
      body: (link) => `<p>Confirm your JobRaven registration by clicking the link:</p><p><a href="${link}">${link}</a></p><p>This link is valid for 24 hours.</p>`
    },
    resendVerification: {
      subject: 'Confirm your registration – JobRaven',
      body: (link) => `<p>Click the link to verify your email address:</p><p><a href="${link}">${link}</a></p><p>This link is valid for 24 hours.</p>`
    },
    resetPassword: {
      subject: 'Password reset – JobRaven',
      body: (link) => `<p>You are receiving this because a password reset was requested. Click the link to set a new password:</p><p><a href="${link}">${link}</a></p><p>This link is valid for 1 hour. If this wasn't you, ignore this message.</p>`
    },
    verifyEmailPage: {
      successTitle: 'Email verified',
      successText: 'Your account is active. You can sign in to the JobRaven app.',
      errorTitle: 'Error',
      errorText: 'The link is invalid or has expired. Please register again or request a new link.'
    },
    resetPasswordPage: {
      title: 'New password',
      tokenMissing: 'Missing token. Use the link from the email.',
      passwordLabel: 'New password (min. 6 characters)',
      confirmLabel: 'Confirm password',
      submit: 'Save password',
      passwordsMismatch: 'Passwords do not match.',
      success: 'Password changed. You can sign in to the app.',
      tokenExpired: 'Link expired. Request a new one.',
      error: 'Error',
      connectionError: 'Connection error.'
    }
  }
}

function lang(l) {
  return (l === 'en' || l === 'pl') ? l : 'pl'
}

function getVerificationEmail(language, link) {
  const t = templates[lang(language)].verification
  return { subject: t.subject, html: t.body(link) }
}

function getResendVerificationEmail(language, link) {
  const t = templates[lang(language)].resendVerification
  return { subject: t.subject, html: t.body(link) }
}

function getResetPasswordEmail(language, link) {
  const t = templates[lang(language)].resetPassword
  return { subject: t.subject, html: t.body(link) }
}

function getVerifyEmailPage(language, resultOk) {
  const t = templates[lang(language)].verifyEmailPage
  if (resultOk) return { title: t.successTitle, text: t.successText }
  return { title: t.errorTitle, text: t.errorText }
}

function getResetPasswordPageLabels(language) {
  return templates[lang(language)].resetPasswordPage
}

module.exports = {
  getVerificationEmail,
  getResendVerificationEmail,
  getResetPasswordEmail,
  getVerifyEmailPage,
  getResetPasswordPageLabels
}
