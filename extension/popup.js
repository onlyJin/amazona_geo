/**
 * Amazon GEO Engine - Popup Script
 * 插件弹窗交互逻辑：抓取页面 → 调用后端 → 渲染结果
 *   + 多语言 / 数据持久化 / 请求锁 / 错误重试 / 动态跳转
 */

(function () {
  "use strict";

  // ═══════════════════════════════════════
  // 国际化
  // ═══════════════════════════════════════

  const LOCALES = {
    "zh-CN": {
      headerSubtitle: "COSMO 算法 · Rufus AI 优化",
      privacy: "仅抓取商品页公开文本。不收集账户信息、不存储数据、不上传浏览记录。",
      analyzeBtn: "一键 GEO 诊断",
      reloadBtn: "重新诊断",
      loading: "AI 正在分析 Listing",
      loadingScrape: "正在抓取商品数据...",
      loadingAnalyze: "AI 正在诊断...",
      loadingRewrite: "正在生成优化建议...",
      scoreTitle: "GEO 语义评分",
      scoreSubtitle: "COSMO 算法适配度",
      checklistLabel: "✅ 执行清单 (Actionable Checklist)",
      reasonLabel: "💡 优化理由 (Why it works)",
      tagsLabel: "🏷️ 核心属性标签",
      rewriteLabel: "✍️ 优化重写文案",
      copyBtn: "一键复制",
      copied: "已复制",
      sellerCentralBtn: "去卖家后台编辑 (Edit in Seller Central)",
      noResult: "暂无数据。",
      cachePrefix: "上次分析 · ",
      retryBtn: "重试",
      backendError: "分析引擎出错，请稍后重试。",
      historyRestoreHint: "历史记录仅保留摘要。已选中 ASIN: {asin}，请点击"{btn}"重新分析。",
    },
    en: {
      headerSubtitle: "COSMO Algo · Rufus AI Optimizer",
      privacy: "Only scrapes public listing text. No account data collected, stored, or uploaded.",
      analyzeBtn: "Analyze Listing",
      reloadBtn: "Re-analyze",
      loading: "AI is analyzing your listing",
      loadingScrape: "Scraping listing data...",
      loadingAnalyze: "AI is diagnosing...",
      loadingRewrite: "Generating recommendations...",
      scoreTitle: "GEO Score",
      scoreSubtitle: "COSMO Readiness",
      checklistLabel: "✅ Actionable Checklist",
      reasonLabel: "💡 Why It Works",
      tagsLabel: "🏷️ Core Attributes",
      rewriteLabel: "✍️ Optimized Bullet Points",
      copyBtn: "Copy",
      copied: "Copied!",
      sellerCentralBtn: "Edit in Seller Central",
      noResult: "No data available.",
      cachePrefix: "Last analysis · ",
      retryBtn: "Retry",
      backendError: "Analysis engine error. Please try again later.",
      historyRestoreHint: "Summary only. ASIN {asin} selected. Click \"{btn}\" to re-analyze.",
    },
  };

  let currentLocale = "zh-CN";

  function t(key) {
    return LOCALES[currentLocale]?.[key] ?? LOCALES["en"][key] ?? key;
  }

  // ═══════════════════════════════════════
  // 卖家后台域名映射
  // ═══════════════════════════════════════

  const SELLER_CENTRAL_MAP = {};
  (function buildSellerCentralMap() {
    const markets = [
      "com", "co.uk", "de", "fr", "it", "es", "ca",
      "co.jp", "in", "com.au", "com.mx", "com.br",
      "nl", "se", "sg", "ae", "sa",
    ];
    for (const m of markets) {
      // 各站点 customer 域名 → sellercentral 域名
      const custHost = m === "co.uk"
        ? "www.amazon.co.uk"
        : m.endsWith("co.jp") || m.endsWith("com.au") || m.endsWith("com.mx") || m.endsWith("com.br")
          ? `www.amazon.${m}`
          : `www.amazon.${m}`;
      const scHost = (m === "co.uk")
        ? "sellercentral.amazon.co.uk"
        : (m === "co.jp")
          ? "sellercentral.amazon.co.jp"
          : (m === "com.au")
            ? "sellercentral.amazon.com.au"
            : (m === "com.mx")
              ? "sellercentral.amazon.com.mx"
              : (m === "com.br")
                ? "sellercentral.amazon.com.br"
                : `sellercentral.amazon.${m}`;
      SELLER_CENTRAL_MAP[custHost] = scHost;
    }
    // Also map www-less variants
    for (const m of markets) {
      const cust = (m === "co.uk") ? "amazon.co.uk" : `amazon.${m}`;
      const sc = (m === "co.uk") ? "sellercentral.amazon.co.uk"
        : (m === "co.jp") ? "sellercentral.amazon.co.jp"
        : (m === "com.au") ? "sellercentral.amazon.com.au"
        : (m === "com.mx") ? "sellercentral.amazon.com.mx"
        : (m === "com.br") ? "sellercentral.amazon.com.br"
        : `sellercentral.amazon.${m}`;
      if (!SELLER_CENTRAL_MAP[cust]) SELLER_CENTRAL_MAP[cust] = sc;
    }
    // Fallback: strip "www." prefix from hostname before lookup
  })();

  function getSellerCentralUrl(marketplace) {
    const host = marketplace || "www.amazon.com";
    const base = SELLER_CENTRAL_MAP[host]
      || SELLER_CENTRAL_MAP[host.replace(/^www\./, "")]
      || "sellercentral.amazon.com";
    return `https://${base}/inventory`;
  }

  // ═══════════════════════════════════════
  // DOM 引用
  // ═══════════════════════════════════════

  const $ = (id) => document.getElementById(id);

  const analyzeBtn = $("analyzeBtn");
  const analyzeBtnText = $("analyzeBtnText");
  const langSwitch = $("langSwitch");
  const headerSubtitle = $("headerSubtitle");
  const privacyText = $("privacyText");
  const loadingEl = $("loading");
  const loadingText = $("loadingText");
  const errorEl = $("errorMsg");
  const errorText = $("errorText");
  const retryBtn = $("retryBtn");
  const resultsEl = $("results");
  const cacheBar = $("cacheBar");
  const cacheText = $("cacheText");
  const clearCacheBtn = $("clearCacheBtn");

  const scoreCard = $("scoreCard");
  const scoreValue = $("scoreValue");
  const scoreCircle = $("scoreCircle");
  const scoreTitle = $("scoreTitle");
  const scoreSubtitle = $("scoreSubtitle");

  const checklistContainer = $("checklistContainer");
  const checklistLabel = $("checklistLabel");
  const reasonText = $("reasonText");
  const reasonLabel = $("reasonLabel");
  const tagsContainer = $("tagsContainer");
  const tagsLabel = $("tagsLabel");
  const rewriteBullets = $("rewriteBullets");
  const rewriteLabel = $("rewriteLabel");
  const copyBtn = $("copyBtn");
  const copyBtnText = $("copyBtnText");
  const sellerCentralBtn = $("sellerCentralBtn");
  const sellerCentralBtnText = $("sellerCentralBtnText");

  // Dimensions, Highlights & FAQ
  const dimBars = $("dimBars");
  const highlightsText = $("highlightsText");
  const copyHighlightsBtn = $("copyHighlightsBtn");
  const copyHighlightsBtnText = $("copyHighlightsBtnText");
  const faqContainer = $("faqContainer");

  // History
  const historyPanel = $("historyPanel");
  const historyList = $("historyList");
  const historyLabel = $("historyLabel");
  const clearHistoryBtn = $("clearHistoryBtn");
  const exportCsvBtn = $("exportCsvBtn");

  // ═══════════════════════════════════════
  // 状态
  // ═══════════════════════════════════════

  let currentAsin = "";
  let currentMarketplace = "www.amazon.com";
  let isAnalyzing = false;                // 请求锁
  let lastFetchArgs = null;               // 用于重试 { asin, title, bullets, marketplace }

  const STORAGE_KEY = "geo_last_result";
  const HISTORY_KEY = "geo_history";
  const COLLECTION_KEY = "geo_collection";
  const USAGE_KEY = "geo_usage";
  const LOCALE_KEY = "geo_locale";
  const FREE_LIMIT = 5;
  const MAX_HISTORY = 20;
  const BACKEND_URL = "http://localhost:8765/api/v1/analyze";
  const CIRCUMFERENCE = 2 * Math.PI * 28;

  // ═══════════════════════════════════════
  // 持久化
  // ═══════════════════════════════════════

  // ── 最近一条（用于自动恢复）──
  async function saveResult(data) {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { ...data, savedAt: Date.now() },
      });
    } catch { /* 静默失败 */ }
  }

  async function loadResult() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      return stored[STORAGE_KEY] || null;
    } catch {
      return null;
    }
  }

  // ── 历史记录（多条，含完整结果）──
  async function saveToHistory(data) {
    try {
      console.log("[GEO] saveToHistory called, data:", JSON.stringify(data));
      const stored = await chrome.storage.local.get(HISTORY_KEY);
      let history = stored[HISTORY_KEY] || [];
      console.log("[GEO] existing history length:", history.length);
      // 去重同 ASIN，只留最新
      history = history.filter((h) => h.asin !== data.asin);
      // 塞到最前面 — 存完整结果以便恢复
      history.unshift({
        asin: data.asin || "",
        title: data.title || "",
        score: data.score,
        savedAt: Date.now(),
        // 存完整分析结果，用于恢复（不存 savedAt 两次）
        fullResult: {
          score: data.score,
          dimension_scores: data.dimension_scores,
          actionable_checklist: data.actionable_checklist,
          structured_attributes: data.structured_attributes,
          optimization_reason: data.optimization_reason,
          rewritten_bullets: data.rewritten_bullets,
          rewritten_faq: data.rewritten_faq,
          item_highlights: data.item_highlights,
        },
      });
      // 限长
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
      await chrome.storage.local.set({ [HISTORY_KEY]: history });
      console.log("[GEO] history saved, new length:", history.length);
    } catch (e) {
      console.error("[GEO] saveToHistory FAILED:", e);
    }
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(HISTORY_KEY);
      const history = stored[HISTORY_KEY] || [];
      console.log("[GEO] loadHistory, count:", history.length);
      return history;
    } catch (e) {
      console.error("[GEO] loadHistory FAILED:", e);
      return [];
    }
  }

  // ── 数据采集：用于批量测试 CSV ──
  async function saveToCollection(asin, title, bullets) {
    try {
      const stored = await chrome.storage.local.get(COLLECTION_KEY);
      let collection = stored[COLLECTION_KEY] || [];
      // 去重同 ASIN
      collection = collection.filter((c) => c.asin !== asin);
      collection.push({ asin, title, bullets, collectedAt: Date.now() });
      if (collection.length > 100) collection = collection.slice(-100);
      await chrome.storage.local.set({ [COLLECTION_KEY]: collection });
      console.log(`[GEO] Collected ASIN: ${asin} (total: ${collection.length})`);
      // 更新导出按钮数字
      if (exportCsvBtn) {
        exportCsvBtn.textContent = `📥 导出 CSV (${collection.length})`;
      }
    } catch (e) {
      console.error("[GEO] saveToCollection FAILED:", e);
    }
  }

  async function loadCollection() {
    try {
      const stored = await chrome.storage.local.get(COLLECTION_KEY);
      return stored[COLLECTION_KEY] || [];
    } catch { return []; }
  }

  async function exportCollectionCSV() {
    const collection = await loadCollection();
    if (collection.length === 0) {
      console.log("[GEO] No data to export.");
      return;
    }
    // 生成 CSV（处理换行和逗号）
    const escapeCSV = (s) => `"${(s || "").replace(/"/g, '""').replace(/\n/g, "\\n")}"`;
    const header = "asin,title,bullets";
    const rows = collection.map((c) =>
      `${escapeCSV(c.asin)},${escapeCSV(c.title)},${escapeCSV(c.bullets)}`
    );
    const csv = header + "\n" + rows.join("\n");

    // 触发下载
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geo_collection_${collection.length}_asins.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[GEO] Exported ${collection.length} ASINs to CSV`);
  }

  // ── 导出按钮 ──
  exportCsvBtn.addEventListener("click", exportCollectionCSV);

  async function clearHistory() {
    try {
      await chrome.storage.local.remove(HISTORY_KEY);
      hide(historyPanel);
      console.log("[GEO] history cleared");
    } catch (e) {
      console.error("[GEO] clearHistory FAILED:", e);
    }
  }

  function renderHistory(history) {
    console.log("[GEO] renderHistory called, entries:", history?.length || 0);
    console.log("[GEO] historyPanel el:", historyPanel);
    console.log("[GEO] historyList el:", historyList);
    historyList.innerHTML = "";
    if (!history || history.length === 0) {
      historyList.innerHTML = `<div class="history-empty">${t("noResult")}</div>`;
      hide(historyPanel);
      console.log("[GEO] history is empty, panel hidden");
      return;
    }

    history.forEach((h) => {
      const score = h.score || 0;
      const scoreClass = score >= 80 ? "hi" : score >= 60 ? "mid" : "low";
      const ago = Math.round((Date.now() - h.savedAt) / 60000);
      const timeStr = ago < 1 ? "just now"
        : ago < 60 ? `${ago}m`
        : ago < 1440 ? `${Math.round(ago / 60)}h`
        : `${Math.round(ago / 1440)}d`;

      const hasFull = !!(h.fullResult && h.fullResult.score !== undefined);
      const div = document.createElement("div");
      div.className = "history-item";
      div.title = hasFull ? "Click to view full analysis" : "Summary only — click to re-analyze";
      div.innerHTML = `
        <span class="history-item-score ${scoreClass}">${score}</span>
        <div class="history-item-info">
          <div class="history-item-title">${escapeHtml(h.title || h.asin || "—")}${hasFull ? "" : " ⚡"}</div>
          <div class="history-item-asin">${h.asin || ""}</div>
        </div>
        <span class="history-item-time">${timeStr}</span>
      `;
      div.addEventListener("click", () => restoreFromHistory(h));
      historyList.appendChild(div);
    });

    show(historyPanel);
    console.log("[GEO] history panel shown, visible class:", historyPanel.classList.contains("visible"));
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 从历史记录恢复——优先用存储的完整结果，否则提示重新分析。
   */
  async function restoreFromHistory(h) {
    // 如果历史条目里有完整结果，直接渲染
    if (h.fullResult && h.fullResult.score !== undefined) {
      renderCached(h.fullResult);
      currentAsin = h.asin || "";
      analyzeBtnText.textContent = t("reloadBtn");
      scoreCard.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // 尝试从独立缓存恢复（兼容旧数据）
    const cached = await loadResult();
    if (cached && cached.asin === h.asin && cached.score !== undefined) {
      renderCached(cached);
      currentAsin = h.asin || "";
      scoreCard.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // 实在没有，提示重新分析
    analyzeBtnText.textContent = t("reloadBtn");
    currentAsin = h.asin || "";
    const msg = t("historyRestoreHint")
      .replace("{asin}", h.asin || "")
      .replace("{btn}", t("reloadBtn"));
    showError(msg, false);
  }

  async function saveLocale(locale) {
    try {
      await chrome.storage.local.set({ [LOCALE_KEY]: locale });
    } catch { /* 静默失败 */ }
  }

  async function loadLocale() {
    try {
      const stored = await chrome.storage.local.get(LOCALE_KEY);
      return stored[LOCALE_KEY] || null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════
  // UI 状态管理
  // ═══════════════════════════════════════

  function show(el) { if (el) el.classList.add("visible"); }
  function hide(el) { if (el) el.classList.remove("visible"); }

  function resetUI() {
    hide(loadingEl);
    hide(errorEl);
    hide(retryBtn);
    hide(resultsEl);
    analyzeBtn.disabled = false;
  }

  function showLoading(phase) {
    hide(errorEl);
    hide(retryBtn);
    hide(resultsEl);
    show(loadingEl);
    const key = phase || "loading";
    loadingText.childNodes[0].textContent = t(key);
    analyzeBtn.disabled = true;
    analyzeBtnText.textContent = "...";
  }

  function showError(message, showRetry) {
    hide(loadingEl);
    hide(resultsEl);
    errorText.textContent = message;
    show(errorEl);
    if (showRetry) {
      show(retryBtn);
    } else {
      hide(retryBtn);
    }
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtnText.textContent = t("analyzeBtn");
  }

  function showResults() {
    hide(loadingEl);
    hide(errorEl);
    hide(retryBtn);
    show(resultsEl);
    isAnalyzing = false;
    analyzeBtn.disabled = false;
    analyzeBtnText.textContent = t("reloadBtn");
  }

  // ═══════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════

  function renderScore(score) {
    scoreValue.textContent = score;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    scoreCircle.setAttribute("stroke-dashoffset", offset);
    scoreCard.classList.remove("score-high", "score-mid", "score-low");
    if (score >= 80) scoreCard.classList.add("score-high");
    else if (score >= 60) scoreCard.classList.add("score-mid");
    else scoreCard.classList.add("score-low");
  }

  function renderChecklist(items) {
    checklistContainer.innerHTML = "";
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = t("noResult");
      li.style.opacity = "0.5";
      checklistContainer.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      checklistContainer.appendChild(li);
    });
  }

  function renderTags(attributes) {
    tagsContainer.innerHTML = "";
    if (!attributes || attributes.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tag";
      empty.textContent = t("noResult");
      empty.style.opacity = "0.5";
      tagsContainer.appendChild(empty);
      return;
    }
    attributes.forEach((attr) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = attr;
      tagsContainer.appendChild(tag);
    });
  }

  function renderRewrittenBullets(bullets) {
    rewriteBullets.innerHTML = "";
    if (!bullets || bullets.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = t("noResult");
      empty.style.opacity = "0.5";
      rewriteBullets.appendChild(empty);
      return;
    }
    bullets.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      rewriteBullets.appendChild(li);
    });
    rewriteBullets.dataset.copyText = bullets.join("\n");
  }

  /**
   * 渲染五维评分条形图
   */
  function renderDimensionScores(dim) {
    if (!dim || !dimBars) return;
    dimBars.innerHTML = "";
    const dims = [
      { key: "scenario_coverage", label: currentLocale === "zh-CN" ? "场景" : "Scenario" },
      { key: "audience_precision", label: currentLocale === "zh-CN" ? "人群" : "Audience" },
      { key: "material_authority", label: currentLocale === "zh-CN" ? "材质" : "Material" },
      { key: "evidence_density", label: currentLocale === "zh-CN" ? "证据" : "Evidence" },
      { key: "emotional_benefit", label: currentLocale === "zh-CN" ? "情感" : "Emotion" },
    ];
    dims.forEach((d) => {
      const val = dim[d.key] || 0;
      const pct = (val / 25) * 100;
      const cls = val >= 20 ? "hi" : val >= 12 ? "mid" : "low";

      const row = document.createElement("div");
      row.className = "dim-row";
      row.innerHTML = `
        <span class="dim-label">${d.label}</span>
        <div class="dim-track"><div class="dim-fill ${cls}" style="width:${pct}%;"></div></div>
        <span class="dim-score" style="color:${val >= 20 ? '#16a34a' : val >= 12 ? '#d97706' : '#dc2626'}">${val}</span>
      `;
      dimBars.appendChild(row);
    });
  }

  /**
   * 渲染 FAQ
   */
  function renderFAQ(faqList) {
    if (!faqContainer) return;
    faqContainer.innerHTML = "";
    if (!faqList || faqList.length === 0) { return; }
    faqList.forEach((f) => {
      const div = document.createElement("div");
      div.className = "faq-item";
      div.innerHTML = `<div class="faq-q">Q: ${escapeHtml(f.question || "")}</div><div class="faq-a">${escapeHtml(f.answer || "")}</div>`;
      faqContainer.appendChild(div);
    });
  }

  async function renderResults(data) {
    renderScore(data.score);
    renderDimensionScores(data.dimension_scores);
    renderChecklist(data.actionable_checklist);
    reasonText.textContent = data.optimization_reason || t("noResult");
    renderTags(data.structured_attributes);
    renderRewrittenBullets(data.rewritten_bullets);
    if (highlightsText) highlightsText.textContent = data.item_highlights || "";
    renderFAQ(data.rewritten_faq);
    showResults();

    // 持久化 —— 完整结果 + 历史摘要
    const enriched = { ...data, asin: currentAsin, title: lastFetchArgs?.title || "", savedAt: Date.now() };
    await saveResult(enriched);
    await saveToHistory({ asin: currentAsin, title: lastFetchArgs?.title || "", score: data.score });
    // 采集原始数据用于批量测试 CSV
    const bulletsRaw = lastFetchArgs?.bullets || "";
    await saveToCollection(currentAsin, lastFetchArgs?.title || "", bulletsRaw);
    await incrementUsage();
    const usage = await getUsage();
    renderUsageBadge(usage.count);
    const history = await loadHistory();
    renderHistory(history);
  }

  function renderCached(data) {
    renderScore(data.score);
    renderDimensionScores(data.dimension_scores);
    renderChecklist(data.actionable_checklist);
    reasonText.textContent = data.optimization_reason || t("noResult");
    renderTags(data.structured_attributes);
    renderRewrittenBullets(data.rewritten_bullets);
    if (highlightsText) highlightsText.textContent = data.item_highlights || "";
    renderFAQ(data.rewritten_faq);
    analyzeBtnText.textContent = t("reloadBtn");
    show(resultsEl);
  }

  function showCacheIndicator(savedAt) {
    const ago = Math.round((Date.now() - savedAt) / 60000);
    const timeStr = ago < 1 ? "just now" : ago < 60 ? `${ago}min ago` : `${Math.round(ago / 60)}h ago`;
    cacheText.textContent = `${t("cachePrefix")}${timeStr}`;
    show(cacheBar);
  }

  // ═══════════════════════════════════════
  // 语言切换
  // ═══════════════════════════════════════

  function applyLocale() {
    headerSubtitle.textContent = t("headerSubtitle");
    privacyText.textContent = t("privacy");
    analyzeBtnText.textContent = isAnalyzing ? "..." : (resultsEl.classList.contains("visible") ? t("reloadBtn") : t("analyzeBtn"));
    loadingText.childNodes[0].textContent = t("loading");
    scoreTitle.textContent = t("scoreTitle");
    scoreSubtitle.textContent = t("scoreSubtitle");
    checklistLabel.textContent = t("checklistLabel");
    reasonLabel.textContent = t("reasonLabel");
    tagsLabel.textContent = t("tagsLabel");
    rewriteLabel.textContent = t("rewriteLabel");
    copyBtnText.textContent = t("copyBtn");
    sellerCentralBtnText.textContent = t("sellerCentralBtn");
    retryBtn.textContent = t("retryBtn");
    historyLabel.textContent = "📜 " + (currentLocale === "zh-CN" ? "历史记录" : "History");
    clearHistoryBtn.textContent = currentLocale === "zh-CN" ? "清空" : "Clear";
  }

  langSwitch.addEventListener("click", async () => {
    currentLocale = currentLocale === "zh-CN" ? "en" : "zh-CN";
    if (currentLocale === "en") {
      langSwitch.textContent = "中";
      langSwitch.title = "切换为中文";
    } else {
      langSwitch.textContent = "EN";
      langSwitch.title = "Switch to English";
    }
    await saveLocale(currentLocale);
    applyLocale();
  });

  // ═══════════════════════════════════════
  // 一键复制
  // ═══════════════════════════════════════

  copyBtn.addEventListener("click", async () => {
    const text = rewriteBullets.dataset.copyText || "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch { /* give up */ }
    }

    copyBtn.classList.add("copied");
    copyBtnText.textContent = t("copied");
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtnText.textContent = t("copyBtn");
    }, 1800);
  });

  // ── 复制 Item Highlights ──
  copyHighlightsBtn.addEventListener("click", async () => {
    const text = highlightsText?.textContent || "";
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    copyHighlightsBtn.classList.add("copied");
    copyHighlightsBtnText.textContent = "Copied!";
    setTimeout(() => {
      copyHighlightsBtn.classList.remove("copied");
      copyHighlightsBtnText.textContent = "复制 Highlights";
    }, 1800);
  });

  // ═══════════════════════════════════════
  // Seller Central 跳转
  // ═══════════════════════════════════════

  sellerCentralBtn.addEventListener("click", () => {
    const url = getSellerCentralUrl(currentMarketplace);
    window.open(url, "_blank");
  });

  // ═══════════════════════════════════════
  // 清除缓存
  // ═══════════════════════════════════════

  clearCacheBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
    hide(cacheBar);
    resetUI();
    analyzeBtnText.textContent = t("analyzeBtn");
  });

  // ═══════════════════════════════════════
  // 清空历史
  // ═══════════════════════════════════════

  clearHistoryBtn.addEventListener("click", async () => {
    await clearHistory();
    historyList.innerHTML = `<div class="history-empty">${t("noResult")}</div>`;
  });

  // ═══════════════════════════════════════
  // 重试
  // ═══════════════════════════════════════

  retryBtn.addEventListener("click", () => {
    if (lastFetchArgs) {
      hide(errorEl);
      hide(retryBtn);
      doAnalyze(lastFetchArgs);
    }
  });

  // ═══════════════════════════════════════
  // 免费额度管理
  // ═══════════════════════════════════════

  async function getUsage() {
    try {
      const stored = await chrome.storage.local.get(USAGE_KEY);
      const u = stored[USAGE_KEY] || { count: 0, month: new Date().getMonth() };
      // 新月份重置
      if (u.month !== new Date().getMonth()) {
        return { count: 0, month: new Date().getMonth() };
      }
      return u;
    } catch { return { count: 0, month: new Date().getMonth() }; }
  }

  async function incrementUsage() {
    const u = await getUsage();
    u.count += 1;
    u.month = new Date().getMonth();
    await chrome.storage.local.set({ [USAGE_KEY]: u });
  }

  function renderUsageBadge(used) {
    const remaining = Math.max(0, FREE_LIMIT - used);
    const el = $("usageBadge");
    if (!el) return;
    if (remaining <= 1) {
      el.textContent = `Free: ${remaining}/5 left`;
      el.style.color = "#dc2626";
    } else {
      el.textContent = `Free: ${remaining}/5 this month`;
      el.style.color = "#8e8e93";
    }
  }

  // ═══════════════════════════════════════
  // 核心流程
  // ═══════════════════════════════════════

  async function doAnalyze({ asin, title, bullets, marketplace }) {
    // 请求锁
    if (isAnalyzing) return;

    // 免费额度检查
    const usage = await getUsage();
    if (usage.count >= FREE_LIMIT) {
      const upgradeMsg = currentLocale === "zh-CN"
        ? "本月免费次数已用完（5次/月）。Pro 版即将上线，无限次分析。"
        : "Free limit reached (5/month). Pro with unlimited analyses coming soon.";
      showError(upgradeMsg, false);
      errorText.style.color = "#1a1a1a";
      errorEl.classList.add("upgrade-prompt");
      return;
    }

    isAnalyzing = true;

    showLoading("loadingScrape");

    let apiResult;
    try {
      showLoading("loadingAnalyze");
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin, title, bullets }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody || "unknown"}`);
      }

      showLoading("loadingRewrite");
      apiResult = await response.json();
    } catch (err) {
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        showError(
          "Cannot connect to local backend.\n\nPlease ensure:\n1. Backend started: cd backend && python main.py\n2. URL: http://localhost:8765\n3. No firewall blocking localhost",
          true
        );
      } else {
        showError(`Backend error: ${err.message}`, true);
      }
      return;
    }

    // 检查是否后端返回了错误（error: true 表示 API 调用失败，score 为 0 是假的）
    if (!apiResult || apiResult.error) {
      showError(
        (apiResult && apiResult.optimization_reason)
          ? apiResult.optimization_reason
          : t("backendError"),
        true
      );
      return;
    }

    if (apiResult.score === undefined) {
      showError("Backend returned unexpected data. Please try again.", true);
      return;
    }

    // 成功后清除错误
    hide(errorEl);
    hide(retryBtn);

    await renderResults(apiResult);
  }

  // ═══════════════════════════════════════
  // 主入口：分析按钮
  // ═══════════════════════════════════════

  analyzeBtn.addEventListener("click", async () => {
    if (isAnalyzing) return;

    resetUI();
    hide(cacheBar);

    // ── 获取标签页 ──
    let tab;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) { showError("Cannot get active tab.", false); return; }
      tab = activeTab;
      if (!tab.url || !tab.url.includes("amazon.")) {
        showError(
          "Not an Amazon page.\nPlease use this extension on an Amazon product page.\nCurrent URL: " + (tab.url || "unknown"),
          false
        );
        return;
      }
    } catch (err) {
      showError("Failed to get tab: " + err.message, false);
      return;
    }

    // ── 抓取 ──
    let scrapeResult;
    try {
      scrapeResult = await chrome.tabs.sendMessage(tab.id, { action: "scrape" });
    } catch {
      showError(
        "Cannot communicate with the page. Please refresh the Amazon product page and try again.\n\n(content script may not be injected)",
        false
      );
      return;
    }

    if (!scrapeResult) { showError("No data from page. Please refresh and retry.", false); return; }
    if (!scrapeResult.success) {
      showError(scrapeResult.error + "\n\n" + (scrapeResult.hint || ""), false);
      return;
    }

    const { asin, title, bullets, marketplace } = scrapeResult.data;
    currentAsin = asin || "";
    currentMarketplace = marketplace || "www.amazon.com";
    if (scrapeResult.warnings?.length) console.warn("Content script warnings:", scrapeResult.warnings);

    // ── 存储抓取参数用于重试 ──
    lastFetchArgs = { asin, title, bullets, marketplace };

    // ── 调用后端 ──
    await doAnalyze(lastFetchArgs);
  });

  // ═══════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════

  (async function init() {
    // 恢复语言偏好
    const savedLocale = await loadLocale();
    if (savedLocale && LOCALES[savedLocale]) {
      currentLocale = savedLocale;
    } else {
      // Default to English
      currentLocale = "en";
    }

    // Language switch button — default is English, shows 中 to switch to Chinese
    if (currentLocale === "en") {
      langSwitch.textContent = "中";
      langSwitch.title = "切换到中文";
    } else {
      langSwitch.textContent = "EN";
      langSwitch.title = "Switch to English";
    }

    applyLocale();
    resetUI();

    // 恢复上次分析结果
    const cached = await loadResult();
    if (cached && cached.score !== undefined) {
      renderCached(cached);
      showCacheIndicator(cached.savedAt || Date.now());
      analyzeBtnText.textContent = t("reloadBtn");
    }

    // 渲染历史列表
    console.log("[GEO] init - DOM check: historyPanel=", historyPanel, " historyList=", historyList);
    const history = await loadHistory();
    renderHistory(history);

    // 显示已采集的数据条数 + 免费额度
    const usage = await getUsage();
    renderUsageBadge(usage.count);
    const collection = await loadCollection();
    if (collection.length > 0 && exportCsvBtn) {
      exportCsvBtn.textContent = `📥 导出 CSV (${collection.length})`;
    }

    console.log("[GEO] Amazon GEO Engine popup initialized. Locale:", currentLocale);
  })();
})();
