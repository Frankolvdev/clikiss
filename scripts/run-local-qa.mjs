// Isolate automated test mail from the real SMTP configuration in .env.local.
Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:'1025',SMTP_SECURE:'false',SMTP_USER:'',SMTP_PASSWORD:'',MAIL_FROM:'CliKiss <cuentas@localhost>'});
await import('./run-app.mjs');
