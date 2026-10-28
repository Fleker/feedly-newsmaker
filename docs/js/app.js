/**
 * Gloucester Gazette — Feedly to Substack Pipeline
 * Client Application Logic
 * Supports both Local Server mode and static GitHub Pages mode
 */

(function () {
  'use strict';

  // Application State
  const state = {
    isStaticMode: false,
    config: null,
    stats: {},
    feedlyItems: [],
    articles: [],
    currentArticle: null,
    activeFilter: 'all',
    activeTab: 'tab-feedly',
  };

  // DOM Elements
  const el = {
    // Header & Metrics
    appModeBadge: document.getElementById('app-mode-badge'),
    valFeedlyCount: document.getElementById('val-feedly-count'),
    valPdfCount: document.getElementById('val-pdf-count'),
    valArticlesCount: document.getElementById('val-articles-count'),
    valPublishedCount: document.getElementById('val-published-count'),
    btnSyncFeedly: document.getElementById('btn-sync-feedly'),
    btnOpenSettings: document.getElementById('btn-open-settings'),

    // Notice Bar
    noticeBar: document.getElementById('notice-bar'),
    noticeMessage: document.getElementById('notice-message'),
    btnNoticeAction: document.getElementById('btn-notice-action'),

    // Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    tabBadgeArticles: document.getElementById('tab-badge-articles'),

    // Tab 1: Feedly
    feedlySearchInput: document.getElementById('feedly-search-input'),
    btnDownloadAllPdfs: document.getElementById('btn-download-all-pdfs'),
    btnTriggerUploadPdf: document.getElementById('btn-trigger-upload-pdf'),
    inputUploadPdf: document.getElementById('input-upload-pdf'),
    btnTriggerImportJson: document.getElementById('btn-trigger-import-json'),
    inputImportJson: document.getElementById('input-import-json'),
    pdfDropzone: document.getElementById('pdf-dropzone'),
    feedlyListContainer: document.getElementById('feedly-list-container'),
    feedlyEmptyState: document.getElementById('feedly-empty-state'),
    btnEmptySync: document.getElementById('btn-empty-sync'),

    // Tab 2: Articles Newsroom
    filterButtons: document.querySelectorAll('.filter-btn'),
    filterCountAll: document.getElementById('filter-count-all'),
    filterCountReady: document.getElementById('filter-count-ready'),
    filterCountGenerated: document.getElementById('filter-count-generated'),
    filterCountPublished: document.getElementById('filter-count-published'),
    articlesSearchInput: document.getElementById('articles-search-input'),
    btnBatchGenerate: document.getElementById('btn-batch-generate'),
    articlesGrid: document.getElementById('articles-grid'),

    // Tab 3: Substack Publisher
    editorStatusBadge: document.getElementById('editor-status-badge'),
    editorSourceLink: document.getElementById('editor-source-link'),
    editorWordCount: document.getElementById('editor-word-count'),
    btnCopyHeadline: document.getElementById('btn-copy-headline'),
    btnCopyMarkdown: document.getElementById('btn-copy-markdown'),
    btnDownloadMarkdown: document.getElementById('btn-download-markdown'),
    btnCopySubstackHtml: document.getElementById('btn-copy-substack-html'),
    btnOpenSubstack: document.getElementById('btn-open-substack'),
    btnMarkPublished: document.getElementById('btn-mark-published'),
    btnSaveDraft: document.getElementById('btn-save-draft'),
    editorInputTitle: document.getElementById('editor-input-title'),
    editorTextareaBody: document.getElementById('editor-textarea-body'),
    previewSubdomain: document.getElementById('preview-subdomain'),
    previewTitle: document.getElementById('preview-title'),
    previewDate: document.getElementById('preview-date'),
    previewBody: document.getElementById('preview-body'),

    // Settings Modal
    modalSettings: document.getElementById('modal-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnCancelSettings: document.getElementById('btn-cancel-settings'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnImportObsidian: document.getElementById('btn-import-obsidian'),
    cfgFeedlyToken: document.getElementById('cfg-feedly-token'),
    cfgFeedlyUser: document.getElementById('cfg-feedly-user'),
    btnTestFeedly: document.getElementById('btn-test-feedly'),
    statusTestFeedly: document.getElementById('status-test-feedly'),
    cfgGeminiKey: document.getElementById('cfg-gemini-key'),
    cfgGeminiModel: document.getElementById('cfg-gemini-model'),
    btnTestGemini: document.getElementById('btn-test-gemini'),
    statusTestGemini: document.getElementById('status-test-gemini'),
    cfgSubstackUrl: document.getElementById('cfg-substack-url'),
    cfgCorsProxy: document.getElementById('cfg-cors-proxy'),
    btnExportConfig: document.getElementById('btn-export-config'),
    btnImportConfig: document.getElementById('btn-import-config'),
    inputConfigFile: document.getElementById('input-config-file'),
    cfgPrompt: document.getElementById('cfg-prompt'),

    // Inspect PDF Modal
    modalInspectPdf: document.getElementById('modal-inspect-pdf'),
    btnCloseInspect: document.getElementById('btn-close-inspect'),
    btnCancelInspect: document.getElementById('btn-cancel-inspect'),
    modalInspectBody: document.getElementById('modal-inspect-body'),

    // Toast Container
    toastContainer: document.getElementById('toast-container'),
  };

  // ==========================================================================
  // Initialization & Boot
  // ==========================================================================
  async function init() {
    bindEvents();
    bindDropzone();
    await detectMode();
    await loadAppConfig();
    await refreshStatus();
    await loadArticles();
    await autoSyncFeedlyIfConfigured();
  }

  async function detectMode() {
    const isGithubHost = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (isGithubHost) {
      setMode(true);
      return;
    }

    try {
      const res = await fetch('/api/status', { method: 'GET' });
      if (res.ok) {
        setMode(false);
      } else {
        setMode(true);
      }
    } catch {
      setMode(true);
    }
  }

  function setMode(isStatic) {
    state.isStaticMode = isStatic;
    if (el.appModeBadge) {
      if (isStatic) {
        el.appModeBadge.textContent = '☁️ GitHub Pages (Static)';
        el.appModeBadge.className = 'mode-badge static-mode';
        el.appModeBadge.title = 'Running client-side in browser. All keys and data are stored locally in your browser.';
      } else {
        el.appModeBadge.textContent = '🖥️ Local Server';
        el.appModeBadge.className = 'mode-badge server-mode';
        el.appModeBadge.title = 'Connected to local Node.js server at http://localhost:3000';
      }
    }
  }

  function bindEvents() {
    // Tab switching
    el.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Header buttons
    el.btnSyncFeedly.addEventListener('click', syncFeedlyItems);
    el.btnEmptySync.addEventListener('click', syncFeedlyItems);
    el.btnOpenSettings.addEventListener('click', openSettingsModal);
    el.btnNoticeAction.addEventListener('click', openSettingsModal);

    // Feedly Tab actions
    el.feedlySearchInput.addEventListener('input', renderFeedlyList);
    el.btnDownloadAllPdfs.addEventListener('click', downloadAllNewPdfs);

    // Newsroom Tab actions
    el.filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        el.filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFilter = btn.dataset.filter;
        renderArticlesGrid();
      });
    });
    el.articlesSearchInput.addEventListener('input', renderArticlesGrid);
    el.btnBatchGenerate.addEventListener('click', batchGenerateReady);

    // Editor Tab actions
    el.btnCopyHeadline.addEventListener('click', copyHeadline);
    el.btnCopyMarkdown.addEventListener('click', copyMarkdown);
    if (el.btnDownloadMarkdown) {
      el.btnDownloadMarkdown.addEventListener('click', downloadMarkdownFile);
    }
    el.btnCopySubstackHtml.addEventListener('click', copySubstackHtml);
    el.btnOpenSubstack.addEventListener('click', openSubstackPost);
    el.btnMarkPublished.addEventListener('click', markCurrentPublished);
    el.btnSaveDraft.addEventListener('click', saveDraftChanges);
    el.editorInputTitle.addEventListener('input', updateLivePreview);
    el.editorTextareaBody.addEventListener('input', updateLivePreview);

    // Settings Modal
    el.btnCloseSettings.addEventListener('click', closeSettingsModal);
    el.btnCancelSettings.addEventListener('click', closeSettingsModal);
    el.btnSaveSettings.addEventListener('click', saveSettings);
    if (el.btnImportObsidian) {
      el.btnImportObsidian.addEventListener('click', importFromObsidianPlugin);
    }
    el.btnTestFeedly.addEventListener('click', testFeedlyConnection);
    el.btnTestGemini.addEventListener('click', testGeminiConnection);

    // Config export/import
    if (el.btnExportConfig) {
      el.btnExportConfig.addEventListener('click', exportConfigJson);
    }
    if (el.btnImportConfig) {
      el.btnImportConfig.addEventListener('click', () => {
        if (el.inputConfigFile) el.inputConfigFile.click();
      });
    }
    if (el.inputConfigFile) {
      el.inputConfigFile.addEventListener('change', importConfigFile);
    }

    // Inspect PDF Modal
    el.btnCloseInspect.addEventListener('click', closeInspectModal);
    el.btnCancelInspect.addEventListener('click', closeInspectModal);

    // Password visibility toggles
    document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = 'Hide';
        } else {
          input.type = 'password';
          btn.textContent = 'Show';
        }
      });
    });
  }

  function bindDropzone() {
    const dropzone = el.pdfDropzone;
    if (dropzone) {
      dropzone.addEventListener('click', () => {
        if (el.inputUploadPdf) el.inputUploadPdf.click();
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          handlePdfFiles(files);
        }
      });
    }

    if (el.inputUploadPdf) {
      el.inputUploadPdf.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handlePdfFiles(e.target.files);
          e.target.value = '';
        }
      });
    }

    if (el.btnTriggerUploadPdf) {
      el.btnTriggerUploadPdf.addEventListener('click', () => {
        if (el.inputUploadPdf) el.inputUploadPdf.click();
      });
    }

    if (el.btnTriggerImportJson) {
      el.btnTriggerImportJson.addEventListener('click', () => {
        if (el.inputImportJson) el.inputImportJson.click();
      });
    }

    if (el.inputImportJson) {
      el.inputImportJson.addEventListener('change', handleImportJsonFile);
    }
  }

  // ==========================================================================
  // Tab Management
  // ==========================================================================
  function switchTab(tabId) {
    state.activeTab = tabId;
    el.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    el.tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  // ==========================================================================
  // Config & Status
  // ==========================================================================
  async function loadAppConfig() {
    // 1. Load local storage fallback first
    try {
      const cached = localStorage.getItem('gloucester_gazette_settings');
      if (cached) {
        state.config = { ...(state.config || {}), ...JSON.parse(cached) };
      }
    } catch (e) {}

    // Default configuration values
    state.config = {
      feedlyAccessToken: '',
      feedlyUserId: '',
      geminiApiKey: '',
      geminiModel: 'gemini-3.8-flash',
      substackUrl: 'https://gloucestercounty.substack.com/',
      corsProxy: 'https://corsproxy.io/?url=',
      journalistPrompt: '',
      ...(state.config || {}),
    };

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const serverConfig = await res.json();
          state.config = { ...state.config, ...serverConfig };
        }
      } catch (err) {
        console.warn('Could not load server config, using local config:', err);
      }
    }

    state.config.feedlyConfigured = !!(state.config.feedlyAccessToken && state.config.feedlyUserId);
    state.config.geminiConfigured = !!state.config.geminiApiKey;

    updateNoticeBanner();
    populateSettingsForm();

    if (state.config.substackUrl) {
      try {
        const urlObj = new URL(state.config.substackUrl);
        el.previewSubdomain.textContent = urlObj.hostname;
      } catch {
        el.previewSubdomain.textContent = state.config.substackUrl;
      }
    }
  }

  function updateNoticeBanner() {
    if (!state.config) return;

    if (!state.config.feedlyConfigured) {
      el.noticeMessage.textContent = 'Feedly is not configured yet. Enter your Access Token and User ID in Settings to sync saved items.';
      el.noticeBar.classList.remove('hidden');
    } else if (!state.config.geminiConfigured) {
      el.noticeMessage.textContent = 'Gemini API Key is not set. Enter your key in Settings for full journalistic article generation.';
      el.noticeBar.classList.remove('hidden');
    } else {
      el.noticeBar.classList.add('hidden');
    }
  }

  async function refreshStatus() {
    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.ok && data.stats) {
          state.stats = data.stats;
          el.valPdfCount.textContent = data.stats.localPdfsCount || 0;
          el.valArticlesCount.textContent = data.stats.articleGenerated || 0;
          el.valPublishedCount.textContent = data.stats.published || 0;
          return;
        }
      } catch (err) {
        console.warn('Status refresh error from server:', err);
      }
    }

    updateMetricsDisplay();
  }

  function updateMetricsDisplay() {
    el.valFeedlyCount.textContent = state.feedlyItems.length;
    const downloadedCount = state.articles.filter(a => a.status === 'pdf_downloaded' || a.pdfFile).length;
    const generatedCount = state.articles.filter(a => a.status === 'article_generated' || a.markdown).length;
    const publishedCount = state.articles.filter(a => a.status === 'published').length;

    el.valPdfCount.textContent = downloadedCount;
    el.valArticlesCount.textContent = generatedCount;
    el.valPublishedCount.textContent = publishedCount;
  }

  async function autoSyncFeedlyIfConfigured() {
    if (state.config && state.config.feedlyConfigured) {
      await syncFeedlyItems();
    }
  }

  // ==========================================================================
  // Client-Side PDF Extraction & File Drop
  // ==========================================================================
  async function extractTextFromPdfArrayBuffer(arrayBuffer) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js library is not available in the browser.');
    }
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `\n--- Page ${i} ---\n` + pageText;
    }
    return fullText;
  }

  async function handlePdfFiles(fileList) {
    const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (files.length === 0) {
      showToast('Please select valid PDF files.', 'warning');
      return;
    }

    showToast(`Parsing ${files.length} PDF file(s) with PDF.js...`, 'info');

    let ingestedCount = 0;
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const text = await extractTextFromPdfArrayBuffer(buffer);
        const cleanTitle = file.name.replace(/\.pdf$/i, '');
        const id = 'pdf_' + btoa(encodeURIComponent(file.name)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

        const newItem = {
          id,
          title: cleanTitle,
          pdfFile: file.name,
          pdfUrl: '',
          sourceUrl: '',
          status: 'pdf_downloaded',
          date: new Date().toISOString(),
          pdfText: text,
        };

        const existingIdx = state.articles.findIndex(a => a.id === id || a.pdfFile === file.name);
        if (existingIdx >= 0) {
          state.articles[existingIdx] = { ...state.articles[existingIdx], ...newItem };
        } else {
          state.articles.unshift(newItem);
        }
        ingestedCount++;
      } catch (err) {
        console.error('PDF parse error:', err);
        showToast(`Failed to parse ${file.name}: ${err.message}`, 'error');
      }
    }

    saveArticlesLocally();
    updateFilterCounts();
    renderArticlesGrid();
    updateMetricsDisplay();
    showToast(`Ingested ${ingestedCount} PDF(s)! Ready in Newsroom.`, 'success');
    switchTab('tab-articles');
  }

  function handleImportJsonFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        const rawItems = Array.isArray(json) ? json : json.items || [];
        if (rawItems.length === 0) {
          showToast('No items found in JSON file', 'warning');
          return;
        }

        const parsed = rawItems.map(item => {
          let pdfUrl = item.pdfUrl || '';
          if (!pdfUrl) {
            const enc = (item.enclosure || []).find(e => e.type === 'application/pdf');
            if (enc) pdfUrl = enc.href;
          }
          const link = item.canonicalUrl || (item.alternate && item.alternate[0]?.href) || item.link || item.url || '';
          if (!pdfUrl && link.toLowerCase().endsWith('.pdf')) pdfUrl = link;

          return {
            id: item.id || 'imp_' + Math.random().toString(36).slice(2, 9),
            title: item.title || 'Imported Minutes',
            originTitle: item.originTitle || item.origin?.title || 'Imported Feed',
            published: item.published ? new Date(item.published).toISOString() : new Date().toISOString(),
            link,
            url: link,
            pdfUrl,
            summary: (item.summary?.content || item.summary || item.content?.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
          };
        });

        state.feedlyItems = parsed;
        saveFeedlyLocally();
        el.valFeedlyCount.textContent = state.feedlyItems.length;
        renderFeedlyList();
        showToast(`Imported ${parsed.length} items from JSON!`, 'success');
      } catch (err) {
        showToast(`Failed to parse JSON: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ==========================================================================
  // Feedly Sync & Rendering (Tab 1)
  // ==========================================================================
  async function syncFeedlyItems() {
    const origText = el.btnSyncFeedly.innerHTML;
    el.btnSyncFeedly.disabled = true;
    el.btnSyncFeedly.innerHTML = '<span class="btn-icon">⏳</span> Syncing...';

    try {
      if (!state.isStaticMode) {
        try {
          const res = await fetch('/api/feedly/saved?count=60');
          const data = await res.json();
          if (res.ok && data.success) {
            state.feedlyItems = data.items || [];
            saveFeedlyLocally();
            el.valFeedlyCount.textContent = state.feedlyItems.length;
            showToast(`Synced ${state.feedlyItems.length} saved items from Feedly!`, 'success');
            renderFeedlyList();
            return;
          }
        } catch (e) {
          console.warn('Server feedly sync failed, attempting client-side sync:', e);
        }
      }

      // Client-Side Feedly Sync (with CORS proxy support)
      await syncFeedlyClientSide();
    } catch (err) {
      showToast(`Sync error: ${err.message}`, 'error');
    } finally {
      el.btnSyncFeedly.disabled = false;
      el.btnSyncFeedly.innerHTML = origText;
    }
  }

  async function syncFeedlyClientSide() {
    const token = state.config.feedlyAccessToken;
    const userId = state.config.feedlyUserId;
    const proxy = state.config.corsProxy !== undefined ? state.config.corsProxy : 'https://corsproxy.io/?url=';

    if (!token || !userId) {
      showToast('Please set your Feedly Access Token and User ID in Settings', 'warning');
      openSettingsModal();
      return;
    }

    const streamId = `user/${userId}/tag/global.saved`;
    const feedlyUrl = `https://cloud.feedly.com/v3/streams/contents?streamId=${encodeURIComponent(streamId)}&count=60`;

    let res;
    try {
      const targetUrl = proxy ? `${proxy}${encodeURIComponent(feedlyUrl)}` : feedlyUrl;
      res = await fetch(targetUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      if (proxy) {
        // Fallback without proxy
        res = await fetch(feedlyUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        throw err;
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Feedly error (${res.status}): ${errText.slice(0, 150)}`);
    }

    const data = await res.json();
    const rawItems = data.items || [];

    state.feedlyItems = rawItems.map(item => {
      let pdfUrl = '';
      const enclosure = (item.enclosure || []).find(e => e.type === 'application/pdf');
      if (enclosure) pdfUrl = enclosure.href;

      const link = item.canonicalUrl || (item.alternate && item.alternate[0]?.href) || '';
      if (!pdfUrl && link.toLowerCase().endsWith('.pdf')) {
        pdfUrl = link;
      }

      return {
        id: item.id,
        title: item.title || 'Untitled Meeting Minutes',
        originTitle: item.origin?.title || 'Unknown Source',
        published: item.published ? new Date(item.published).toISOString() : new Date().toISOString(),
        link,
        url: link,
        pdfUrl,
        summary: (item.summary?.content || item.content?.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
      };
    });

    saveFeedlyLocally();
    el.valFeedlyCount.textContent = state.feedlyItems.length;
    showToast(`Synced ${state.feedlyItems.length} saved items from Feedly!`, 'success');
    renderFeedlyList();
  }

  function saveFeedlyLocally() {
    try {
      localStorage.setItem('gloucester_gazette_feedly', JSON.stringify(state.feedlyItems));
    } catch (e) {}
  }

  function renderFeedlyList() {
    const query = el.feedlySearchInput.value.toLowerCase().trim();
    let filtered = state.feedlyItems;

    if (query) {
      filtered = filtered.filter(item =>
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.originTitle && item.originTitle.toLowerCase().includes(query)) ||
        (item.summary && item.summary.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      el.feedlyListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${state.feedlyItems.length === 0 ? '📥' : '🔍'}</div>
          <h3>${state.feedlyItems.length === 0 ? 'No Feedly items synced yet' : 'No matching items'}</h3>
          <p>${state.feedlyItems.length === 0 ? 'Click "Sync Feedly" above or "Upload PDF" to ingest meeting minutes.' : 'Try adjusting your search terms.'}</p>
        </div>
      `;
      return;
    }

    el.feedlyListContainer.innerHTML = '';

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'feedly-card';

      const dateStr = item.published ? new Date(item.published).toLocaleDateString() : '';

      // Check if we have an article created for this item
      const matchingArticle = state.articles.find(a => a.id === item.id || a.title === item.title || (a.pdfUrl && a.pdfUrl === item.pdfUrl));

      let statusBadge = '';
      if (matchingArticle && matchingArticle.status === 'published') {
        statusBadge = '<span class="status-badge published">Published</span>';
      } else if (matchingArticle && matchingArticle.status === 'article_generated') {
        statusBadge = '<span class="status-badge article-ready">Article Ready</span>';
      } else if (matchingArticle || item.localPdfFile) {
        statusBadge = '<span class="status-badge pdf-ready">PDF Ready</span>';
      } else if (item.pdfUrl) {
        statusBadge = '<span class="status-badge pdf-ready">Direct PDF Found</span>';
      } else {
        statusBadge = '<span class="status-badge pending">Web Page</span>';
      }

      let actionsHtml = '';
      if (matchingArticle && matchingArticle.status === 'article_generated') {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-outline btn-open-art" data-id="${matchingArticle.id}">View Story</button>
        `;
      } else if (matchingArticle) {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-primary btn-generate-item" data-id="${matchingArticle.id}">Generate Column</button>
        `;
      } else if (item.pdfUrl) {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-secondary btn-dl-pdf" data-url="${encodeURIComponent(item.pdfUrl)}" data-name="${encodeURIComponent(item.title)}">Fetch & Parse PDF</button>
        `;
      } else {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-secondary btn-inspect-page" data-url="${encodeURIComponent(item.url || item.link)}">Inspect for PDFs</button>
        `;
      }

      card.innerHTML = `
        <div class="feedly-card-main">
          <div class="feedly-card-meta">
            <span class="feedly-origin">${escapeHtml(item.originTitle)}</span>
            <span>•</span>
            <span>${dateStr}</span>
            <span>•</span>
            ${statusBadge}
          </div>
          <a href="${item.url || item.link || '#'}" target="_blank" rel="noopener noreferrer" class="feedly-card-title">${escapeHtml(item.title)}</a>
          ${item.summary ? `<p class="feedly-card-summary">${escapeHtml(item.summary)}</p>` : ''}
        </div>
        <div class="feedly-card-actions">
          ${actionsHtml}
        </div>
      `;

      // Bind button events
      const btnDl = card.querySelector('.btn-dl-pdf');
      if (btnDl) {
        btnDl.addEventListener('click', () => {
          downloadSinglePdf(decodeURIComponent(btnDl.dataset.url), decodeURIComponent(btnDl.dataset.name), item.id);
        });
      }

      const btnInspect = card.querySelector('.btn-inspect-page');
      if (btnInspect) {
        btnInspect.addEventListener('click', () => {
          inspectWebPageForPdfs(decodeURIComponent(btnInspect.dataset.url), item.title, item.id);
        });
      }

      const btnGen = card.querySelector('.btn-generate-item');
      if (btnGen) {
        btnGen.addEventListener('click', () => {
          generateArticleForItem(btnGen.dataset.id);
        });
      }

      const btnOpen = card.querySelector('.btn-open-art');
      if (btnOpen) {
        btnOpen.addEventListener('click', () => {
          openArticleInEditor(btnOpen.dataset.id);
        });
      }

      el.feedlyListContainer.appendChild(card);
    });
  }

  async function downloadSinglePdf(url, preferredName, feedlyId) {
    showToast(`Fetching PDF for "${preferredName}"...`, 'info');

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/pdf/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            preferredName,
            itemId: feedlyId ? btoa(feedlyId).replace(/=/g, '') : undefined,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Downloaded ${data.fileName}!`, 'success');
          await refreshStatus();
          await loadArticles();
          await syncFeedlyItems();
          return;
        }
      } catch (err) {
        console.warn('Server download failed, attempting client-side download:', err);
      }
    }

    // Client-side download using CORS proxy + PDF.js
    try {
      const proxy = state.config.corsProxy !== undefined ? state.config.corsProxy : 'https://corsproxy.io/?url=';
      const targetUrl = proxy ? `${proxy}${encodeURIComponent(url)}` : url;
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}`);

      const buffer = await res.arrayBuffer();
      const text = await extractTextFromPdfArrayBuffer(buffer);

      const cleanName = (preferredName || 'Meeting Minutes').replace(/[/\\?%*:|"<>]/g, '-');
      const filename = cleanName.endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;
      const id = 'pdf_' + btoa(encodeURIComponent(filename)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

      const newItem = {
        id,
        title: cleanName.replace(/\.pdf$/i, ''),
        pdfFile: filename,
        pdfUrl: url,
        sourceUrl: url,
        status: 'pdf_downloaded',
        date: new Date().toISOString(),
        pdfText: text,
      };

      const existingIdx = state.articles.findIndex(a => a.id === id || a.pdfFile === filename);
      if (existingIdx >= 0) {
        state.articles[existingIdx] = { ...state.articles[existingIdx], ...newItem };
      } else {
        state.articles.unshift(newItem);
      }

      saveArticlesLocally();
      updateFilterCounts();
      renderArticlesGrid();
      updateMetricsDisplay();
      renderFeedlyList();
      showToast(`Downloaded and parsed ${filename}! Ready to generate.`, 'success');
    } catch (err) {
      showToast(`Download error: ${err.message}. You can upload the PDF directly!`, 'error');
    }
  }

  async function downloadAllNewPdfs() {
    const downloadable = state.feedlyItems.filter(i => i.pdfUrl && !state.articles.some(a => a.pdfUrl === i.pdfUrl || a.title === i.title));
    if (downloadable.length === 0) {
      showToast('All direct PDF links are already ingested!', 'info');
      return;
    }

    showToast(`Downloading ${downloadable.length} PDFs...`, 'info');
    let successCount = 0;

    for (const item of downloadable) {
      try {
        await downloadSinglePdf(item.pdfUrl, item.title, item.id);
        successCount++;
      } catch (e) {
        console.error('Batch download item error:', e);
      }
    }

    showToast(`Successfully processed ${successCount} PDFs!`, 'success');
    await refreshStatus();
    await loadArticles();
    renderFeedlyList();
  }

  async function inspectWebPageForPdfs(pageUrl, title, itemId) {
    el.modalInspectBody.innerHTML = '<div style="text-align: center; padding: 2rem;">Scanning page for PDF links...</div>';
    el.modalInspectPdf.classList.remove('hidden');

    try {
      let pdfLinks = [];

      if (!state.isStaticMode) {
        try {
          const res = await fetch('/api/feedly/inspect-page', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageUrl }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.pdfLinks) {
            pdfLinks = data.pdfLinks;
          }
        } catch (e) {
          console.warn('Server inspect failed, trying client-side proxy inspect:', e);
        }
      }

      if (pdfLinks.length === 0) {
        const proxy = state.config.corsProxy !== undefined ? state.config.corsProxy : 'https://corsproxy.io/?url=';
        const target = proxy ? `${proxy}${encodeURIComponent(pageUrl)}` : pageUrl;
        const pageRes = await fetch(target);
        const html = await pageRes.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const anchors = Array.from(doc.querySelectorAll('a[href]'));

        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (href && href.toLowerCase().includes('.pdf')) {
            try {
              const fullUrl = new URL(href, pageUrl).href;
              const linkText = a.textContent.trim() || 'Download PDF';
              if (!pdfLinks.some(l => l.url === fullUrl)) {
                pdfLinks.push({ text: linkText, url: fullUrl });
              }
            } catch (e) {}
          }
        });
      }

      if (pdfLinks.length === 0) {
        el.modalInspectBody.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>No direct PDF links found</h3>
            <p>You can visit <a href="${pageUrl}" target="_blank" rel="noopener noreferrer">the municipal webpage</a> directly and drop the downloaded PDF here.</p>
          </div>
        `;
        return;
      }

      let html = '<div class="inspect-list">';
      pdfLinks.forEach(link => {
        html += `
          <div class="inspect-item">
            <div class="inspect-info">
              <span class="inspect-title">${escapeHtml(link.text)}</span>
              <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="inspect-url">${escapeHtml(link.url)}</a>
            </div>
            <button type="button" class="btn btn-sm btn-primary btn-modal-dl-pdf" data-url="${encodeURIComponent(link.url)}" data-name="${encodeURIComponent(link.text)}">
              Fetch PDF
            </button>
          </div>
        `;
      });
      html += '</div>';

      el.modalInspectBody.innerHTML = html;

      el.modalInspectBody.querySelectorAll('.btn-modal-dl-pdf').forEach(btn => {
        btn.addEventListener('click', async () => {
          const url = decodeURIComponent(btn.dataset.url);
          const name = decodeURIComponent(btn.dataset.name) || title;
          closeInspectModal();
          await downloadSinglePdf(url, name, itemId);
        });
      });
    } catch (err) {
      el.modalInspectBody.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Scan Failed</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function closeInspectModal() {
    el.modalInspectPdf.classList.add('hidden');
  }

  // ==========================================================================
  // Articles Newsroom & Generator (Tab 2)
  // ==========================================================================
  async function loadArticles() {
    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/articles');
        const data = await res.json();
        if (data.success && data.items) {
          state.articles = data.items;
          saveArticlesLocally();
          updateFilterCounts();
          renderArticlesGrid();
          return;
        }
      } catch (err) {
        console.warn('Server articles fetch failed, falling back to local storage:', err);
      }
    }

    try {
      const localData = localStorage.getItem('gloucester_gazette_articles');
      if (localData) {
        state.articles = JSON.parse(localData);
      } else {
        state.articles = [];
      }
    } catch (e) {
      state.articles = [];
    }

    updateFilterCounts();
    renderArticlesGrid();
    updateMetricsDisplay();
  }

  function saveArticlesLocally() {
    try {
      localStorage.setItem('gloucester_gazette_articles', JSON.stringify(state.articles));
    } catch (e) {}
  }

  function updateFilterCounts() {
    const total = state.articles.length;
    const ready = state.articles.filter(a => a.status === 'pdf_downloaded' && !a.markdown).length;
    const generated = state.articles.filter(a => a.status === 'article_generated' || a.markdown).length;
    const published = state.articles.filter(a => a.status === 'published').length;

    el.filterCountAll.textContent = total;
    el.filterCountReady.textContent = ready;
    el.filterCountGenerated.textContent = generated;
    el.filterCountPublished.textContent = published;
    el.tabBadgeArticles.textContent = total;
  }

  function renderArticlesGrid() {
    const query = el.articlesSearchInput.value.toLowerCase().trim();
    let filtered = state.articles;

    // Apply status filter
    if (state.activeFilter === 'ready') {
      filtered = filtered.filter(a => a.status === 'pdf_downloaded' && !a.markdown);
    } else if (state.activeFilter === 'generated') {
      filtered = filtered.filter(a => a.status === 'article_generated' && !a.publishedAt);
    } else if (state.activeFilter === 'published') {
      filtered = filtered.filter(a => a.status === 'published');
    }

    // Apply text search
    if (query) {
      filtered = filtered.filter(a =>
        (a.title && a.title.toLowerCase().includes(query)) ||
        (a.headline && a.headline.toLowerCase().includes(query)) ||
        (a.pdfFile && a.pdfFile.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      el.articlesGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">${state.articles.length === 0 ? '📝' : '🔍'}</div>
          <h3>${state.articles.length === 0 ? 'No minutes or articles ready yet' : 'No articles match filter'}</h3>
          <p>${state.articles.length === 0 ? 'Ingest municipal minutes via Tab 1 (Feedly) or drop any meeting minutes PDF above.' : 'Try clearing your search query or filter.'}</p>
        </div>
      `;
      return;
    }

    el.articlesGrid.innerHTML = '';

    filtered.forEach(art => {
      const card = document.createElement('div');
      card.className = 'article-card';

      let statusBadge = '';
      if (art.status === 'published') {
        statusBadge = '<span class="status-badge published">Published</span>';
      } else if (art.status === 'article_generated' || art.markdown) {
        statusBadge = '<span class="status-badge article-ready">Generated</span>';
      } else {
        statusBadge = '<span class="status-badge pdf-ready">PDF Ingested</span>';
      }

      const displayTitle = art.headline || art.title || 'Untitled Meeting Report';
      const dateStr = art.date ? new Date(art.date).toLocaleDateString() : '';

      let actionsHtml = '';
      if (art.status === 'article_generated' || art.markdown) {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-primary btn-review-art" data-id="${art.id}">Review & Export</button>
          <button type="button" class="btn btn-sm btn-outline btn-regen-art" data-id="${art.id}" title="Re-synthesize with Gemini">Regenerate</button>
        `;
      } else {
        actionsHtml = `
          <button type="button" class="btn btn-sm btn-primary btn-gen-art" data-id="${art.id}">Generate Column</button>
        `;
      }

      card.innerHTML = `
        <div class="article-card-header">
          ${statusBadge}
          <span class="article-card-date">${dateStr}</span>
        </div>
        <h3 class="article-card-title">${escapeHtml(displayTitle)}</h3>
        <p class="article-card-file">📄 ${escapeHtml(art.pdfFile || art.title)}</p>
        <div class="article-card-footer">
          ${actionsHtml}
        </div>
      `;

      // Bind actions
      const btnGen = card.querySelector('.btn-gen-art');
      if (btnGen) {
        btnGen.addEventListener('click', () => generateArticleForItem(art.id));
      }

      const btnRegen = card.querySelector('.btn-regen-art');
      if (btnRegen) {
        btnRegen.addEventListener('click', () => generateArticleForItem(art.id));
      }

      const btnReview = card.querySelector('.btn-review-art');
      if (btnReview) {
        btnReview.addEventListener('click', () => openArticleInEditor(art.id));
      }

      el.articlesGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // Client-Side Gemini 3.8 Flash Generation
  // ==========================================================================
  async function generateArticleClientSide(pdfText, sourceUrl, customPrompt) {
    const apiKey = state.config.geminiApiKey;
    const model = state.config.geminiModel || 'gemini-3.8-flash';
    if (!apiKey) {
      throw new Error('Gemini API key is required. Please enter it in Settings.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    // The 3 original journalist prompts from main.ts
    const titlePrompt = "Provide a title for the following borough minutes document as though you were a local journalist writing a story in paragraph form. Be accurate.";
    const columnPrompt = customPrompt || "Summarize in paragraphs the following borough minutes document as though you were a local journalist writing a column in paragraph form. Be accurate.";
    const detailsPrompt = "Describe key points, potential controversial topics, and newsworthy points from the following document as though you were a local journalist writing a column in bullet points";

    async function callGemini(instruction) {
      const prompt = `${instruction}\n\nDocument Text:\n${pdfText}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // Execute in parallel
    const [headlineRaw, reportRaw, detailsRaw] = await Promise.all([
      callGemini(titlePrompt),
      callGemini(columnPrompt),
      callGemini(detailsPrompt),
    ]);

    const cleanHeadline = headlineRaw.replace(/^[#*\s"]+/, '').replace(/[#*\s"]+$/, '').trim();
    const cleanReport = reportRaw.trim();
    const cleanDetails = detailsRaw.trim();

    let finalMarkdown = `# ${cleanHeadline}\n\n${cleanReport}\n\n${cleanDetails}`;
    if (sourceUrl && !finalMarkdown.includes('[Source](')) {
      finalMarkdown += `\n\n[Source](${sourceUrl})`;
    }

    const rawHtml = window.marked ? window.marked.parse(finalMarkdown) : renderMarkdownToHtml(finalMarkdown);

    return {
      headline: cleanHeadline,
      markdown: finalMarkdown,
      html: rawHtml,
      sourceUrl,
    };
  }

  async function generateArticleForItem(itemId) {
    showToast('Synthesizing article with Gemini 3.8 Flash...', 'info');

    if (!state.isStaticMode) {
      try {
        const res = await fetch(`/api/articles/${itemId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Generated: "${data.headline}"!`, 'success');
          await refreshStatus();
          await loadArticles();
          await openArticleInEditor(itemId);
          return;
        }
      } catch (err) {
        console.warn('Server generation failed, attempting client-side generation:', err);
      }
    }

    // Client-side generation (Static / GitHub Pages mode)
    const item = state.articles.find(a => a.id === itemId);
    if (!item) {
      showToast('Article record not found', 'error');
      return;
    }

    try {
      let pdfText = item.pdfText;
      if (!pdfText && item.pdfUrl) {
        showToast('Fetching and parsing PDF...', 'info');
        const proxy = state.config.corsProxy !== undefined ? state.config.corsProxy : 'https://corsproxy.io/?url=';
        const targetUrl = proxy ? `${proxy}${encodeURIComponent(item.pdfUrl)}` : item.pdfUrl;
        const pdfRes = await fetch(targetUrl);
        const buf = await pdfRes.arrayBuffer();
        pdfText = await extractTextFromPdfArrayBuffer(buf);
        item.pdfText = pdfText;
      }

      if (!pdfText) {
        showToast('Document text not found. Please upload the PDF file directly.', 'error');
        return;
      }

      const generated = await generateArticleClientSide(pdfText, item.sourceUrl || item.pdfUrl, state.config.journalistPrompt);

      item.headline = generated.headline;
      item.markdown = generated.markdown;
      item.html = generated.html;
      item.status = 'article_generated';
      item.generatedAt = new Date().toISOString();

      saveArticlesLocally();
      updateFilterCounts();
      renderArticlesGrid();
      updateMetricsDisplay();

      showToast(`Generated: "${generated.headline}"!`, 'success');
      await openArticleInEditor(itemId);
    } catch (err) {
      console.error('Client generation error:', err);
      showToast(`Generation error: ${err.message}`, 'error');
    }
  }

  async function batchGenerateReady() {
    const readyItems = state.articles.filter(a => a.status === 'pdf_downloaded' && !a.markdown);
    if (readyItems.length === 0) {
      showToast('No downloaded PDFs waiting for article generation!', 'info');
      return;
    }

    showToast(`Batch generating ${readyItems.length} articles...`, 'info');
    el.btnBatchGenerate.disabled = true;

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/articles/batch-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: readyItems.map(i => i.id) }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Batch generation complete!', 'success');
          await refreshStatus();
          await loadArticles();
          return;
        }
      } catch (err) {
        console.warn('Server batch generation failed, doing client-side loop:', err);
      } finally {
        el.btnBatchGenerate.disabled = false;
      }
    }

    let count = 0;
    for (const item of readyItems) {
      try {
        await generateArticleForItem(item.id);
        count++;
      } catch (e) {
        console.error('Error generating item:', e);
      }
    }

    el.btnBatchGenerate.disabled = false;
    showToast(`Batch generated ${count} articles!`, 'success');
    await loadArticles();
  }

  // ==========================================================================
  // Substack Editor & Exporter (Tab 3)
  // ==========================================================================
  async function openArticleInEditor(articleId) {
    let item = state.articles.find(a => a.id === articleId);

    if (!state.isStaticMode) {
      try {
        const res = await fetch(`/api/articles/${articleId}`);
        const data = await res.json();
        if (data.success && data.item) {
          item = data.item;
          item.markdown = data.markdown || item.markdown || '';
          item.html = data.html || item.html || '';
        }
      } catch (err) {
        console.warn('Could not fetch article from server, using local copy:', err);
      }
    }

    if (!item) {
      showToast('Article not found', 'error');
      return;
    }

    state.currentArticle = item;
    el.editorInputTitle.value = item.headline || item.title || '';
    el.editorTextareaBody.value = item.markdown || '';

    el.editorStatusBadge.textContent = (item.status || 'draft').replace('_', ' ').toUpperCase();
    el.editorStatusBadge.className = `status-badge ${item.status === 'published' ? 'published' : 'article-ready'}`;

    if (item.sourceUrl || item.pdfUrl) {
      const src = item.sourceUrl || item.pdfUrl;
      el.editorSourceLink.innerHTML = `Source: <a href="${src}" target="_blank" rel="noopener noreferrer">${escapeHtml(src)}</a>`;
    } else if (item.pdfFile) {
      el.editorSourceLink.textContent = `PDF: ${item.pdfFile}`;
    } else {
      el.editorSourceLink.textContent = 'Source: Meeting Minutes';
    }

    updateLivePreview();
    switchTab('tab-editor');
  }

  function updateLivePreview() {
    const title = el.editorInputTitle.value.trim() || 'Article Headline';
    const bodyMarkdown = el.editorTextareaBody.value;

    el.previewTitle.textContent = title;
    el.previewDate.textContent = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const words = bodyMarkdown.trim().split(/\s+/).filter(Boolean).length;
    el.editorWordCount.textContent = `${words} words`;

    if (window.marked) {
      // Use marked library
      el.previewBody.innerHTML = window.marked.parse(bodyMarkdown);
    } else {
      el.previewBody.innerHTML = renderMarkdownToHtml(bodyMarkdown);
    }
  }

  function renderMarkdownToHtml(md) {
    if (!md) return '<p class="text-muted">No content</p>';

    let html = md
      .replace(/^#\s+(.+)$/gm, '') // Skip top h1
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n\n+/g, '</p><p>');

    html = html.replace(/<\/ul>\s*<ul>/g, '');
    return `<p>${html}</p>`;
  }

  async function saveDraftChanges() {
    if (!state.currentArticle) return;

    const title = el.editorInputTitle.value.trim();
    const markdown = el.editorTextareaBody.value;

    state.currentArticle.headline = title;
    state.currentArticle.markdown = markdown;

    if (!state.isStaticMode) {
      try {
        await fetch(`/api/articles/${state.currentArticle.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headline: title, markdown }),
        });
      } catch (err) {
        console.warn('Failed to save to server, saved locally:', err);
      }
    }

    saveArticlesLocally();
    showToast('Draft changes saved!', 'success');
  }

  function copyHeadline() {
    const title = el.editorInputTitle.value.trim();
    if (!title) {
      showToast('No headline to copy', 'warning');
      return;
    }
    navigator.clipboard.writeText(title).then(() => {
      showToast('Copied headline to clipboard!', 'success');
    });
  }

  function copyMarkdown() {
    const markdown = el.editorTextareaBody.value;
    if (!markdown) {
      showToast('No markdown to copy', 'warning');
      return;
    }
    navigator.clipboard.writeText(markdown).then(() => {
      showToast('Copied raw Markdown to clipboard!', 'success');
    });
  }

  function downloadMarkdownFile() {
    if (!state.currentArticle) {
      showToast('No active article to download', 'warning');
      return;
    }
    const title = el.editorInputTitle.value.trim() || state.currentArticle.title || 'article';
    const markdown = el.editorTextareaBody.value;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded Markdown file!', 'success');
  }

  async function copySubstackHtml() {
    if (!state.currentArticle) {
      showToast('Select an article first', 'warning');
      return;
    }

    await saveDraftChanges();

    const title = el.editorInputTitle.value.trim() || state.currentArticle.headline || state.currentArticle.title || '';
    let bodyMarkdown = el.editorTextareaBody.value.trim();

    const sourceUrl = state.currentArticle.sourceUrl || state.currentArticle.pdfUrl;
    if (sourceUrl && !bodyMarkdown.includes('[Source](')) {
      bodyMarkdown += `\n\n[Source](${sourceUrl})`;
      el.editorTextareaBody.value = bodyMarkdown;
    }

    const htmlContent = window.marked ? window.marked.parse(bodyMarkdown) : renderMarkdownToHtml(bodyMarkdown);
    const plainContent = `${title}\n\n${bodyMarkdown.replace(/[#*_`]/g, '').trim()}`;

    try {
      const blobHtml = new Blob([htmlContent], { type: 'text/html' });
      const blobText = new Blob([plainContent], { type: 'text/plain' });

      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText,
      });

      await navigator.clipboard.write([item]);
      showToast('📋 Rich HTML formatted for Substack copied! Paste directly into Substack editor.', 'success');
    } catch (err) {
      navigator.clipboard.writeText(bodyMarkdown).then(() => {
        showToast('Copied article markdown to clipboard!', 'success');
      });
    }
  }

  function openSubstackPost() {
    const pubUrl = (state.config && state.config.substackUrl) || 'https://gloucestercounty.substack.com/';
    let cleanUrl = pubUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const newPostUrl = `${cleanUrl}/publish/post`;
    window.open(newPostUrl, '_blank', 'noopener,noreferrer');
    showToast('Opened Substack editor in a new tab. Paste your copied column!', 'info');
  }

  async function markCurrentPublished() {
    if (!state.currentArticle) return;

    state.currentArticle.status = 'published';
    state.currentArticle.publishedAt = new Date().toISOString();

    if (!state.isStaticMode) {
      try {
        await fetch(`/api/articles/${state.currentArticle.id}/publish`, {
          method: 'POST',
        });
      } catch (err) {
        console.warn('Publish sync to server failed, updated locally:', err);
      }
    }

    saveArticlesLocally();
    updateFilterCounts();
    renderArticlesGrid();
    updateMetricsDisplay();

    el.editorStatusBadge.textContent = 'PUBLISHED';
    el.editorStatusBadge.className = 'status-badge published';
    showToast('Marked as published!', 'success');
  }

  // ==========================================================================
  // Settings Management Modal
  // ==========================================================================
  function openSettingsModal() {
    populateSettingsForm();
    el.modalSettings.classList.remove('hidden');
  }

  function populateSettingsForm() {
    if (!state.config) return;
    el.cfgFeedlyToken.value = state.config.feedlyAccessToken || '';
    el.cfgFeedlyUser.value = state.config.feedlyUserId || '';
    el.cfgGeminiKey.value = state.config.geminiApiKey || '';
    el.cfgGeminiModel.value = state.config.geminiModel || 'gemini-3.8-flash';
    el.cfgSubstackUrl.value = state.config.substackUrl || 'https://gloucestercounty.substack.com/';
    if (el.cfgCorsProxy) {
      el.cfgCorsProxy.value = state.config.corsProxy !== undefined ? state.config.corsProxy : 'https://corsproxy.io/?url=';
    }
    el.cfgPrompt.value = state.config.journalistPrompt || '';
  }

  function closeSettingsModal() {
    el.modalSettings.classList.add('hidden');
    el.statusTestFeedly.textContent = '';
    el.statusTestFeedly.className = 'test-status';
    el.statusTestGemini.textContent = '';
    el.statusTestGemini.className = 'test-status';
  }

  async function importFromObsidianPlugin() {
    showToast('Importing credentials from Obsidian plugin...', 'info');
    try {
      const res = await fetch('/api/config/import-obsidian', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to import from Obsidian', 'error');
        return;
      }

      if (data.feedlyAccessToken) el.cfgFeedlyToken.value = data.feedlyAccessToken;
      if (data.feedlyUserId) el.cfgFeedlyUser.value = data.feedlyUserId;
      showToast('Imported Feedly token and user ID from Obsidian plugin!', 'success');
    } catch (err) {
      showToast(`Import error: ${err.message}`, 'error');
    }
  }

  async function testFeedlyConnection() {
    const token = el.cfgFeedlyToken.value.trim() || (state.config && state.config.feedlyAccessToken);
    if (!token) {
      el.statusTestFeedly.textContent = '✕ Please enter an Access Token first';
      el.statusTestFeedly.className = 'test-status error';
      return;
    }

    el.statusTestFeedly.textContent = '⏳ Testing connection to Feedly...';
    el.statusTestFeedly.className = 'test-status';

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/config/test-feedly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedlyAccessToken: token }),
        });
        const data = await res.json();
        if (data.success) {
          el.statusTestFeedly.textContent = `✓ Connected as ${data.email || 'Feedly User'}!`;
          el.statusTestFeedly.className = 'test-status success';
          if (data.userId && !el.cfgFeedlyUser.value) {
            el.cfgFeedlyUser.value = data.userId;
          }
          return;
        } else {
          el.statusTestFeedly.textContent = `✕ ${data.error || 'Connection failed'}`;
          el.statusTestFeedly.className = 'test-status error';
          return;
        }
      } catch (e) {
        console.warn('Server test failed, falling back to proxy test:', e);
      }
    }

    try {
      const proxy = el.cfgCorsProxy ? el.cfgCorsProxy.value.trim() : 'https://corsproxy.io/?url=';
      const target = proxy ? `${proxy}${encodeURIComponent('https://cloud.feedly.com/v3/profile')}` : 'https://cloud.feedly.com/v3/profile';
      const res = await fetch(target, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const profile = await res.json();
        el.statusTestFeedly.textContent = `✓ Connected as ${profile.email || 'Feedly User'}!`;
        el.statusTestFeedly.className = 'test-status success';
        if (profile.id && !el.cfgFeedlyUser.value) {
          el.cfgFeedlyUser.value = profile.id;
        }
      } else {
        el.statusTestFeedly.textContent = `✕ Feedly HTTP ${res.status}`;
        el.statusTestFeedly.className = 'test-status error';
      }
    } catch (err) {
      el.statusTestFeedly.textContent = `✕ Feedly error: ${err.message}`;
      el.statusTestFeedly.className = 'test-status error';
    }
  }

  async function testGeminiConnection() {
    const key = el.cfgGeminiKey.value.trim() || (state.config && state.config.geminiApiKey);
    const model = el.cfgGeminiModel.value.trim() || (state.config && state.config.geminiModel) || 'gemini-3.8-flash';

    if (!key) {
      el.statusTestGemini.textContent = '✕ Please enter an API key first';
      el.statusTestGemini.className = 'test-status error';
      return;
    }

    el.statusTestGemini.textContent = '⏳ Testing connection to Gemini...';
    el.statusTestGemini.className = 'test-status';

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/config/test-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geminiApiKey: key, geminiModel: model }),
        });
        const data = await res.json();
        if (data.success) {
          el.statusTestGemini.textContent = '✓ Gemini connected successfully!';
          el.statusTestGemini.className = 'test-status success';
          return;
        } else {
          el.statusTestGemini.textContent = `✕ ${data.error || 'Connection failed'}`;
          el.statusTestGemini.className = 'test-status error';
          return;
        }
      } catch (e) {
        console.warn('Server test failed, falling back to direct browser test:', e);
      }
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello' }] }]
        })
      });
      if (res.ok) {
        el.statusTestGemini.textContent = `✓ Gemini connected successfully! (${model})`;
        el.statusTestGemini.className = 'test-status success';
      } else {
        const errText = await res.text();
        el.statusTestGemini.textContent = `✕ API error (${res.status}): ${errText.slice(0, 100)}`;
        el.statusTestGemini.className = 'test-status error';
      }
    } catch (err) {
      el.statusTestGemini.textContent = `✕ Network error: ${err.message}`;
      el.statusTestGemini.className = 'test-status error';
    }
  }

  async function saveSettings() {
    const payload = {
      feedlyAccessToken: el.cfgFeedlyToken.value.trim(),
      feedlyUserId: el.cfgFeedlyUser.value.trim(),
      geminiApiKey: el.cfgGeminiKey.value.trim(),
      geminiModel: el.cfgGeminiModel.value.trim() || 'gemini-3.8-flash',
      substackUrl: el.cfgSubstackUrl.value.trim(),
      corsProxy: el.cfgCorsProxy ? el.cfgCorsProxy.value.trim() : 'https://corsproxy.io/?url=',
      journalistPrompt: el.cfgPrompt.value,
    };

    state.config = { ...state.config, ...payload };
    state.config.feedlyConfigured = !!(payload.feedlyAccessToken && payload.feedlyUserId);
    state.config.geminiConfigured = !!payload.geminiApiKey;

    try {
      localStorage.setItem('gloucester_gazette_settings', JSON.stringify(payload));
    } catch (e) {}

    if (!state.isStaticMode) {
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Settings saved to server and browser storage!', 'success');
          closeSettingsModal();
          updateNoticeBanner();
          await autoSyncFeedlyIfConfigured();
          return;
        }
      } catch (err) {
        console.warn('Server save failed, saved locally:', err);
      }
    }

    showToast('Settings saved to browser local storage!', 'success');
    closeSettingsModal();
    updateNoticeBanner();
    await autoSyncFeedlyIfConfigured();
  }

  function exportConfigJson() {
    const exportData = {
      feedlyAccessToken: (state.config && state.config.feedlyAccessToken) || '',
      feedlyUserId: (state.config && state.config.feedlyUserId) || '',
      geminiApiKey: (state.config && state.config.geminiApiKey) || '',
      geminiModel: (state.config && state.config.geminiModel) || 'gemini-3.8-flash',
      substackUrl: (state.config && state.config.substackUrl) || 'https://gloucestercounty.substack.com/',
      corsProxy: (state.config && state.config.corsProxy !== undefined) ? state.config.corsProxy : 'https://corsproxy.io/?url=',
      journalistPrompt: (state.config && state.config.journalistPrompt) || '',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gloucester-gazette-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Settings exported to gloucester-gazette-settings.json', 'success');
  }

  function importConfigFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        state.config = { ...(state.config || {}), ...imported };
        state.config.feedlyConfigured = !!(state.config.feedlyAccessToken && state.config.feedlyUserId);
        state.config.geminiConfigured = !!state.config.geminiApiKey;
        localStorage.setItem('gloucester_gazette_settings', JSON.stringify(state.config));
        populateSettingsForm();
        updateNoticeBanner();
        showToast('Settings imported successfully into browser!', 'success');
      } catch (err) {
        showToast(`Invalid JSON file: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ==========================================================================
  // Toast Utilities
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
