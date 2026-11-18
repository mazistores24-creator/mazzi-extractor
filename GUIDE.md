# Mazzi Extractor — Step-by-step guide

This is a standalone project. Its Vite/React client and Express API run locally; MongoDB is optional for saved run history.

## 1. Requirements

- Node.js 20 or newer
- MongoDB Community Server only if you want run history to persist between server restarts

## 2. Install dependencies

Open PowerShell in the `mazzi-extractor` project folder and run:

```powershell
npm ci
npm ci --prefix client
npm ci --prefix server
```

## 3. Optional: configure MongoDB

To persist extraction history, copy `server/.env.example` to `server/.env`. Set `MONGODB_URI` to your MongoDB connection string. If you skip this, the app runs with temporary in-memory history.

## 4. Start the app

From the project root, run:

```powershell
npm run dev
```

Open **http://localhost:5173**. The API runs on **http://localhost:5000**.

## 5. Use the extractor

1. Paste text or import a `.txt`, `.csv`, or `.log` file.
2. Optionally enter a source label and URL reference. The URL is recorded only; the app does not visit it.
3. Choose country/language labels, mailbox type, provider, keyword filter, and result limit.
4. Select **Start extraction**.
5. Search or clear the result table, or export the results as CSV.

Mailbox type is inferred from common role-address prefixes (for example, `info@`); it may be wrong. Provider is inferred from the email domain. Country and language are labels and are not detected automatically.

## Scope

Mazzi Extractor processes only material you supply. It does not crawl websites, search social networks, rotate proxies, or send email.
