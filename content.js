// Claude LaTeX Formatter - Content Script
// Detects and renders LaTeX formulas in Claude's web chat using KaTeX

(function() {
  'use strict';

  // Track if we've already processed elements
  const PROCESSED_ATTR = 'data-latex-processed';

  // Settings
  let autoRenderEnabled = false;
  let isRendering = false;

  // Load settings from storage
  chrome.storage.sync.get(['autoRender'], (result) => {
    autoRenderEnabled = result.autoRender || false;
    if (autoRenderEnabled) {
      renderAllLatex();
      setupObserver();
    }
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'renderLatex') {
      renderAllLatex();
      sendResponse({ success: true });
    } else if (message.action === 'setAutoRender') {
      autoRenderEnabled = message.enabled;
      if (autoRenderEnabled) {
        renderAllLatex();
        setupObserver();
      }
      sendResponse({ success: true });
    }
    return true;
  });

  // LaTeX patterns - order matters (display math first, then inline)
  const LATEX_PATTERNS = [
    { regex: /\$\$([^$]+)\$\$/g, displayMode: true },           // $$...$$
    { regex: /\\\[([^\]]+)\\\]/g, displayMode: true },          // \[...\]
    { regex: /\$([^$\n]+)\$/g, displayMode: false },            // $...$
    { regex: /\\\(([^)]+)\\\)/g, displayMode: false }           // \(...\)
  ];

  // Check if element is inside a code block
  function isInsideCodeBlock(element) {
    let parent = element.parentElement;
    while (parent) {
      const tagName = parent.tagName.toLowerCase();
      if (tagName === 'code' || tagName === 'pre') {
        return true;
      }
      if (parent.classList.contains('code-block') ||
          parent.classList.contains('hljs') ||
          parent.getAttribute('data-language')) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }

  // Render a single LaTeX expression
  function renderLatexExpression(latex, displayMode) {
    try {
      const html = katex.renderToString(latex, {
        displayMode: displayMode,
        throwOnError: false,
        errorColor: '#cc0000',
        strict: false,
        trust: true
      });
      return html;
    } catch (e) {
      console.warn('KaTeX render error:', e);
      return null;
    }
  }

  // Process text and replace LaTeX with rendered HTML
  function processTextNode(textNode) {
    if (isInsideCodeBlock(textNode)) {
      return;
    }

    let text = textNode.textContent;
    let hasLatex = false;

    // Check if text contains any LaTeX
    for (const pattern of LATEX_PATTERNS) {
      if (pattern.regex.test(text)) {
        hasLatex = true;
        pattern.regex.lastIndex = 0; // Reset regex state
        break;
      }
    }

    if (!hasLatex) {
      return;
    }

    // Create a document fragment to hold the result
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let matches = [];

    // Collect all matches with their positions
    for (const pattern of LATEX_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          latex: match[1],
          displayMode: pattern.displayMode,
          original: match[0]
        });
      }
    }

    // Sort matches by position and remove overlaps
    matches.sort((a, b) => a.start - b.start);
    const filteredMatches = [];
    let lastEnd = 0;
    for (const match of matches) {
      if (match.start >= lastEnd) {
        filteredMatches.push(match);
        lastEnd = match.end;
      }
    }

    if (filteredMatches.length === 0) {
      return;
    }

    // Build the fragment
    for (const match of filteredMatches) {
      // Add text before this match
      if (match.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
      }

      // Render the LaTeX
      const rendered = renderLatexExpression(match.latex, match.displayMode);
      if (rendered) {
        const span = document.createElement('span');
        span.className = match.displayMode ? 'claude-latex-display' : 'claude-latex-inline';
        span.innerHTML = rendered;
        span.setAttribute('title', match.original); // Show original on hover
        fragment.appendChild(span);
      } else {
        // Rendering failed, keep original text
        fragment.appendChild(document.createTextNode(match.original));
      }

      lastIndex = match.end;
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // Replace the text node with the fragment
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  // Walk through all text nodes in an element
  function walkTextNodes(element, callback) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip empty nodes and nodes inside already-processed elements
          if (!node.textContent.trim()) {
            return NodeFilter.FILTER_SKIP;
          }
          if (node.parentElement.closest('[' + PROCESSED_ATTR + ']')) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    // Process in reverse to avoid issues with DOM modifications
    for (let i = nodes.length - 1; i >= 0; i--) {
      callback(nodes[i]);
    }
  }

  // Find Claude message containers
  function getMessageContainers() {
    // Try various selectors that might match Claude's message containers
    const selectors = [
      '[data-message-author-role="assistant"]',
      '.assistant-message',
      '.claude-message',
      '[class*="message"][class*="assistant"]',
      '[class*="prose"]',
      'article',
      '.markdown'
    ];

    let containers = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        containers = Array.from(elements);
        break;
      }
    }

    // Fallback: look for any element containing LaTeX-like content
    if (containers.length === 0) {
      const allElements = document.querySelectorAll('div, p, span');
      for (const el of allElements) {
        const text = el.textContent;
        if (/\$[^$]+\$|\\\(|\\\[/.test(text) && !el.closest('code, pre')) {
          if (!containers.some(c => c.contains(el) || el.contains(c))) {
            containers.push(el);
          }
        }
      }
    }

    return containers;
  }

  // Main render function
  function renderAllLatex() {
    if (isRendering) return;
    isRendering = true;

    console.log('Claude LaTeX Formatter: Rendering LaTeX...');

    try {
      const containers = getMessageContainers();

      for (const container of containers) {
        if (container.getAttribute(PROCESSED_ATTR)) {
          continue;
        }

        walkTextNodes(container, processTextNode);
        container.setAttribute(PROCESSED_ATTR, 'true');
      }

      console.log('Claude LaTeX Formatter: Rendering complete');
    } catch (e) {
      console.error('Claude LaTeX Formatter: Error during rendering', e);
    } finally {
      isRendering = false;
    }
  }

  // MutationObserver for auto-render mode
  let observer = null;

  function setupObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (!autoRenderEnabled) return;

      let shouldRender = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldRender = true;
          break;
        }
      }

      if (shouldRender) {
        // Debounce rendering
        clearTimeout(window._latexRenderTimeout);
        window._latexRenderTimeout = setTimeout(() => {
          renderAllLatex();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('Claude LaTeX Formatter: Observer started');
  }

  // Expose for debugging
  window._claudeLatexFormatter = {
    render: renderAllLatex,
    setAutoRender: (enabled) => {
      autoRenderEnabled = enabled;
      if (enabled) setupObserver();
    }
  };

})();
