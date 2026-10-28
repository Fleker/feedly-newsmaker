# 📰 Gloucester Gazette

An editorial newsroom web app that automates turning municipal borough council minutes, agendas, and public records into journalistic columns and publishing them directly to Substack.

Built for the **Gloucester Gazette** newsletter ([gloucestercounty.substack.com](https://gloucestercounty.substack.com/)).

---

## ⚡ Highlights & Architecture

The app is architected with a **dual-runtime design**:

1. **☁️ GitHub Pages / Static Client-Side Mode**:
   - Runs **100% in the browser** on GitHub Pages or any static file host.
   - **Zero backend required**: Uses client-side PDF.js for text extraction and direct Gemini REST API calls from the browser.
   - **Bypasses Corporate DLP / Restrictions**: When corporate security policies block pasting external content into personal platforms like Substack, open your GitHub Pages deployment on a personal machine, phone, or browser to generate and copy rich content with 1 click.
   - **Privacy-first**: All API keys and drafts are stored strictly in your browser's local `localStorage`.

2. **🖥️ Local Node.js Server Mode**:
   - Run locally on your development machine via `npm start` (`http://localhost:3000`).
   - Automatically downloads and organizes PDFs into `dl/`, indexes generated articles into `reports/`, and persists state in `data/items.json`.

---

## 🚀 Key Features

* **📥 Feedly Ingestion**: Syncs saved/bookmarked municipal minutes directly from Feedly (`global.saved`). Supports direct fetch, configurable CORS proxy, or offline JSON import.
* **📄 Drag & Drop PDF Dropzone**: Drop any municipal meeting minutes PDF file directly onto the web app to parse text instantly with PDF.js.
* **🤖 3-Prompt Journalist Engine (`gemini-3.8-flash`)**:
  - **Headline**: Catchy, accurate municipal news headline.
  - **Narrative Story**: Paragraph-form reporting summarizing major borough council discussions, resolutions, and community milestones.
  - **Takeaways & Controversies**: Bulleted rundown of votes, ordinances, citizen comments, budget items, and talking points.
  - **Source Link**: Automatically appends `[Source]({url})` in Markdown and `<p><a href="...">Source</a></p>` in HTML.
* **📋 1-Click Substack Exporter**:
  - Copies rich formatted HTML (`text/html`) with source hyperlinks and headings, plus plain text fallback to the clipboard via the modern Clipboard API.
  - One-click button to open your Substack publication editor (`https://gloucestercounty.substack.com/publish/post`) in a new tab.
  - Download `.md` markdown file button for local archiving or Obsidian.
* **⚙️ Seamless Settings & Transfer**:
  - Configure Feedly User ID, Token, Gemini API Key, Gemini Model (`gemini-3.8-flash`), Substack URL, and CORS proxy.
  - **Export / Import Settings JSON**: Transfer your configured keys between machines in one click.

---

## 🌐 Deploying to GitHub Pages

Deploying takes under 1 minute:

### Step 1: Create a GitHub Repository & Push

```bash
# In this directory:
git init -b main
git remote add origin git@github.com:<your-username>/gloucester-gazette.git
git add .
git commit -m "Initial commit of Gloucester Gazette newsroom app"
git push -u origin main
```

### Step 2: Enable GitHub Pages

In your GitHub repository:
1. Go to **Settings** &rarr; **Pages**.
2. Under **Build and deployment** &rarr; **Source**, choose either:
   - **Deploy from a branch**: Select branch `main` and folder `/docs`. Click **Save**!
   - **GitHub Actions**: Uses the pre-configured workflow in `.github/workflows/deploy-pages.yml`.
3. Your web app will be live at:
   `https://<your-username>.github.io/gloucester-gazette/`

### Step 3: Enter Keys Once on Your Personal Device

1. Open `https://<your-username>.github.io/gloucester-gazette/` on your personal device.
2. Click **⚙ Settings** and enter:
   - **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/app/apikey).
   - **Gemini Model**: `gemini-3.8-flash`.
   - **Feedly Token & User ID**: From [feedly.com/v3/auth/dev](https://feedly.com/v3/auth/dev).
   - *(Optional)* Click **Import Settings JSON** if you exported your settings from your local dev environment!
3. Click **Save Settings**. You are ready to generate articles and paste directly into Substack!

---

## 💻 Local Development

To run the full Node.js / Express backend locally:

```bash
# Install dependencies
npm install

# Build TypeScript and sync docs/
npm run build

# Start local server at http://localhost:3000
npm start
```

### Environment Variables (`.env`)

For local server mode, keys can be placed in `.env`:
```env
PORT=3000
FEEDLY_ACCESS_TOKEN=your_token_here
FEEDLY_USER_ID=your_user_id_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
SUBSTACK_URL=https://gloucestercounty.substack.com/
```

*(Note: `.env` is ignored by `.gitignore` and is never committed to git).*

---

## 📁 Project Structure

```
├── docs/                   # Static build for GitHub Pages (/docs deployment)
│   ├── index.html
│   ├── .nojekyll
│   ├── css/app.css
│   └── js/app.js
├── public/                 # Static assets served by local Express server
│   ├── index.html
│   ├── css/app.css
│   └── js/app.js
├── src/                    # Node.js TypeScript source code
│   ├── config.ts           # Environment & credential management
│   ├── feedly.ts           # Feedly API integration & URL normalizers
│   ├── pdf-downloader.ts   # Multi-fallback PDF downloader
│   ├── article-generator.ts# Gemini 3.8 Flash 3-prompt journalist engine
│   ├── substack-helper.ts  # Substack rich HTML & Markdown exporter
│   ├── storage.ts          # Local file indexing & state persistence
│   └── server.ts           # Express server & API endpoints
├── .github/workflows/      # GitHub Actions deployment workflow
│   └── deploy-pages.yml
├── package.json
└── tsconfig.json
```

---

## ⚖ License

ISC License.
