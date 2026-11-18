# Mazzi Extractor

A MERN contact extraction workspace built with Vite, React, Bootstrap, Express, and MongoDB. The interface follows the visible workflow in the extractor reference video: source material, filters, extraction controls, and a results grid.

## Scope

Mazzi Extractor parses text and `.txt`, `.csv`, or `.log` files that you supply. It does not crawl websites, search third-party sites, rotate proxies, or send email. A source URL can be recorded as a reference, but it is never fetched. Country and language are run labels; keyword filtering checks the source line surrounding each address. Mailbox type is a rough local-part heuristic, and provider is derived from the email domain; neither is verified.

## Requirements

- Node.js 20 or newer
- MongoDB Community Server (optional for persistent run history)

## Setup

1. Open a terminal in this project folder.
2. Install root and app dependencies:

   ```powershell
   npm install
   npm install --prefix client
   npm install --prefix server
   ```

3. For saved history, copy `server/.env.example` to `server/.env` and set `MONGODB_URI` to your MongoDB connection string. Without it, the app runs in memory mode and history resets when the server stops.
4. Start both apps from the project root:

   ```powershell
   npm run dev
   ```

5. Open the Vite address printed in the terminal (normally `http://localhost:5173`). The Express API runs on `http://localhost:5000`.

## Using the app

1. Paste copied contact text or import a `.txt`, `.csv`, or `.log` file.
2. Optionally add a source label or URL reference.
3. Choose country and language labels, mailbox type, provider, a keyword filter, and a result cap.
4. Select **Start extraction**.
5. Search the result table, clear results if needed, and export the table as CSV.

Expected input works best with one contact per line, for example:

```text
Acme Studio | hello@example.com | +1 555 010 2200 | https://example.com
```

## Project structure

```text
client/   Vite + React + Bootstrap UI
server/   Express API, extraction logic, and optional MongoDB history
```
