/**
 * Skrypt do wysłania maila testowego (diagnostyka SMTP).
 * Uruchom z folderu server: node send-test-email.js [adres]
 * Np.: node send-test-email.js tlumacz@marcinkucharski.pl
 */
require('dotenv').config()
const { sendMail } = require('./mail')

const to = process.argv[2] && process.argv[2].trim() || 'tlumacz@marcinkucharski.pl'

async function main() {
  console.log('Wysyłanie maila testowego na:', to)
  try {
    await sendMail(to, 'Test JobRaven – SMTP', '<p>To jest test wysyłki z serwera JobRaven. Jeśli to widzisz, SMTP działa poprawnie.</p>')
    console.log('OK – mail wysłany.')
  } catch (err) {
    console.error('Błąd:', err.message || err)
    process.exit(1)
  }
}

main()
