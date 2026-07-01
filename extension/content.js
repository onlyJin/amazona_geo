/**
 * Amazon GEO Engine - Content Script
 * 注入到亚马逊商品页面，负责精准抓取 Listing 文本数据。
 *
 * 抓取目标：
 *   - 商品标题: #productTitle
 *   - 五点描述: #feature-bullets 或 #aboutThisItem 内的 <li> 元素
 *   - ASIN: 隐藏表单 #ASIN 或 URL 正则回退
 *
 * 返回格式：
 *   { success: true,  data: { asin: "...", title: "...", bullets: "..." } }
 *   { success: false, error: "...", hint: "..." }
 */

(function () {
  "use strict";

  /**
   * 检测页面语言，用于返回对应语言的错误消息。
   * 亚马逊 .com / .co.uk / .ca → en，.de → de，.co.jp → ja，以此类推。
   */
  function detectPageLang() {
    const htmlLang = document.documentElement.lang || "";
    if (htmlLang.startsWith("ja")) return "ja";
    if (htmlLang.startsWith("de")) return "de";
    if (htmlLang.startsWith("zh")) return "zh";
    if (htmlLang.startsWith("fr")) return "fr";
    if (htmlLang.startsWith("es")) return "es";
    if (htmlLang.startsWith("it")) return "it";
    return "en"; // 默认英文
  }

  const pageLang = detectPageLang();

  const MSG = {
    notProductPage: {
      en: "Not an Amazon product page",
      zh: "当前页面不是亚马逊商品详情页",
      ja: "Amazonの商品ページではありません",
      de: "Keine Amazon-Produktseite",
    },
    notProductPageHint: {
      en: "Please open this extension on a product detail page (URL contains /dp/ or /gp/product/). Current: ",
      zh: "请在商品详情页（URL 包含 /dp/ 或 /gp/product/）打开此插件。当前页面: ",
      ja: "商品詳細ページ（URLに/dp/または/gp/product/を含む）でこの拡張機能を開いてください。現在のページ: ",
      de: "Bitte öffnen Sie diese Erweiterung auf einer Produktdetailseite (URL enthält /dp/ oder /gp/product/). Aktuell: ",
    },
    noData: {
      en: "Could not extract any listing data",
      zh: "未能提取到任何 Listing 数据",
      ja: "商品データを抽出できませんでした",
      de: "Keine Listendaten extrahierbar",
    },
    noDataHint: {
      en: "Please make sure you are on an Amazon product detail page and the page has fully loaded. Try refreshing if the page uses async loading.",
      zh: "请确认您正在查看的是亚马逊商品详情页，且页面已完全加载。如果页面使用了特殊的异步加载方式，请尝试刷新页面后再试。",
      ja: "Amazonの商品詳細ページが完全に読み込まれていることを確認してください。非同期読み込みの場合はページを更新してください。",
      de: "Bitte stellen Sie sicher, dass die Amazon-Produktseite vollständig geladen ist. Versuchen Sie die Seite zu aktualisieren.",
    },
    titleNotFound: {
      en: "Could not find product title (#productTitle). Page structure may be unusual.",
      zh: "未能找到商品标题（#productTitle），可能页面结构异常。",
      ja: "商品タイトル（#productTitle）が見つかりません。ページ構造が特殊な可能性があります。",
      de: "Produkttitel (#productTitle) nicht gefunden. Seitenstruktur möglicherweise ungewöhnlich.",
    },
    bulletsNotFound: {
      en: "Could not find bullet points (#feature-bullets / #aboutThisItem). The product may have no bullet points or the page structure differs.",
      zh: "未能找到五点描述（#feature-bullets / #aboutThisItem），可能该商品没有五点描述或页面结构不同。",
      ja: "箇条書き（#feature-bullets / #aboutThisItem）が見つかりません。商品説明がないか、ページ構造が異なる可能性があります。",
      de: "Bullet Points (#feature-bullets / #aboutThisItem) nicht gefunden. Produkt hat möglicherweise keine Bullet Points oder abweichende Seitenstruktur.",
    },
  };

  function msg(key) {
    return MSG[key]?.[pageLang] || MSG[key]?.en || key;
  }

  /**
   * 从当前亚马逊页面提取商品标题
   * @returns {{ text: string, found: boolean }}
   */
  function extractTitle() {
    // 主选择器（覆盖绝大多数亚马逊站点）
    const selectors = [
      "#productTitle",
      "#title",
      '[data-feature-name="title"] h1',
      "#title_feature_div h1",
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim()) {
        return { text: el.innerText.trim(), found: true };
      }
    }
    return { text: "", found: false };
  }

  /**
   * 从当前亚马逊页面提取五点描述
   * @returns {{ text: string, found: boolean }}
   */
  function extractBullets() {
    // 主选择器：标准五点列表容器
    const containerSelectors = [
      "#feature-bullets",
      "#feature-bullets-new",
      "#aboutThisItem",
      "#featurebullets_feature_div",
      "#detailBullets_feature_div",
      "#detailBulletsWrapper_feature_div",
      "#importantInformation",
      "#productDescription",
      "#aplus_feature_div",
    ];

    let bulletContainer = null;
    for (const sel of containerSelectors) {
      bulletContainer = document.querySelector(sel);
      if (bulletContainer) break;
    }

    if (!bulletContainer) {
      return { text: "", found: false };
    }

    // 从容器中提取 <li> 文本
    const listItems = bulletContainer.querySelectorAll("li");
    if (listItems.length > 0) {
      const lines = [];
      listItems.forEach((li) => {
        const text = li.innerText.trim();
        if (text && text.length > 2) {
          // 过滤太短的片段（如纯空格符、分隔符）
          lines.push(text);
        }
      });
      if (lines.length > 0) {
        return { text: lines.join("\n"), found: true };
      }
    }

    // 如果容器中没有 <li>，回退到提取 <span> 带特定 class 的元素
    const spans = bulletContainer.querySelectorAll(
      "span.a-list-item, span.a-size-base"
    );
    if (spans.length > 0) {
      const lines = [];
      spans.forEach((span) => {
        const text = span.innerText.trim();
        if (text && text.length > 2) {
          lines.push(text);
        }
      });
      if (lines.length > 0) {
        return { text: lines.join("\n"), found: true };
      }
    }

    // 最终回退：直接取容器的 innerText（去重后）
    const raw = bulletContainer.innerText.trim();
    if (raw) {
      return { text: raw, found: true };
    }

    return { text: "", found: false };
  }

  /**
   * 从当前页面提取 ASIN
   * 策略：隐藏表单 → URL 正则回退
   * @returns {{ text: string, found: boolean }}
   */
  function extractAsin() {
    // 策略 1：隐藏 input 标签
    const asinElement = document.getElementById("ASIN");
    if (asinElement && asinElement.value && asinElement.value.trim()) {
      return { text: asinElement.value.trim(), found: true };
    }

    // 策略 2：从 URL 正则匹配（/dp/XXXXXXXXXX 或 /gp/product/XXXXXXXXXX）
    const match = window.location.pathname.match(
      /\/([a-zA-Z0-9]{10})(?:[/?]|$)/
    );
    if (match) {
      return { text: match[1], found: true };
    }

    return { text: "", found: false };
  }

  /**
   * 判断当前页面是否为亚马逊商品详情页
   * @returns {boolean}
   */
  function isProductPage() {
    const url = window.location.href;
    // 亚马逊商品详情页 URL 特征：包含 /dp/ 或 /gp/product/
    return /\/dp\//.test(url) || /\/gp\/product\//.test(url) || /\/ASIN\//.test(url);
  }

  /**
   * 主抓取函数：从页面提取所有 Listing 数据
   * @returns {{ success: boolean, data?: object, error?: string, hint?: string }}
   */
  function scrapeListing() {
    // ── 前置检查：是否在商品详情页 ──
    if (!isProductPage()) {
      return {
        success: false,
        error: msg("notProductPage"),
        hint: msg("notProductPageHint") + window.location.href,
      };
    }

    // ── 提取 ASIN、标题、五点、当前站点域名 ──
    const asinResult = extractAsin();
    const titleResult = extractTitle();
    const bulletsResult = extractBullets();
    const marketplace = window.location.hostname; // e.g. "www.amazon.com" → "amazon.com"

    // ── 错误处理：两者都找不到 ──
    if (!titleResult.found && !bulletsResult.found) {
      return {
        success: false,
        error: msg("noData"),
        hint: msg("noDataHint"),
      };
    }

    // ── 部分缺失情况（容忍模式） ──
    const warnings = [];
    if (!titleResult.found) {
      warnings.push(msg("titleNotFound"));
    }
    if (!bulletsResult.found) {
      warnings.push(msg("bulletsNotFound"));
    }

    return {
      success: true,
      data: {
        asin: asinResult.text || "(未找到 ASIN)",
        title: titleResult.text || "(未找到标题)",
        bullets: bulletsResult.text || "(未找到五点描述)",
        marketplace: marketplace || "www.amazon.com",
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ── 响应来自 popup.js 的消息请求 ──
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape") {
      const result = scrapeListing();
      sendResponse(result);
    }
    // 返回 true 表示异步响应（虽在此为同步，但保持兼容性）
    return true;
  });
})();
