# Security Policy

## Supported Versions

Only the latest `main` branch (deployed at https://swot.iamnishant.in) receives security fixes.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for security problems.

Include what you found, how to reproduce it, and the impact you expect. You'll get an acknowledgement as soon as the report is read, and a fix or a decision once it has been investigated.

## Secrets

- Never commit `.env*` files. They are gitignored.
- Frontend environment variables are embedded in the public JavaScript bundle. Only public values belong there: `REACT_APP_API_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is protected by Supabase row-level security). `src/security/noClientSecrets.test.js` enforces this.
- Every other credential lives only in the backend host's environment: the Supabase service-role key, the Brevo API key, the job secret and the Groq/OpenRouter keys.
- If a secret is ever committed or exposed, rotate it at the provider first. Removing it from git history doesn't make it safe again, because clones and forks keep the old commits.
