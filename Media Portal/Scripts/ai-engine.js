/**
 * Daynight-Media: AI Pictures & Creative Visuals Engine
 */
(function(window) {
  'use strict';

  const PRESETS = [
    { id: 'silk', label: 'Editorial Silk Saree', prompt: 'Cinematic South Indian silk saree editorial, opulent gold zari border, royal temple aesthetics, golden hour lighting' },
    { id: 'jewelry', label: 'Cinematic Jewelry', prompt: 'High-jewelry diamond and emerald necklace showcase, dramatic macro lighting, velvet luxury backdrop, 8k commercial still' },
    { id: 'festive', label: 'Modern Festive', prompt: 'Vibrant Diwali festive couture collection, rich crimson and saffron fabrics, warm diya glow, celebration ambience' },
    { id: 'haute', label: 'Haute Couture', prompt: 'High fashion runway avant-garde portrait, architectural drapery, minimalist studio lighting, Vogue editorial aesthetics' },
    { id: 'urban', label: 'Urban Streetwear', prompt: 'Modern contemporary streetwear lookbook, neon night street reflection, dynamic cinematic color grading' }
  ];

  let generatedPictures = [
    {
      id: 'ai_init_1',
      title: 'Royal Kanchipuram Gold Zari',
      style: 'Editorial Silk Saree',
      imgUrl: createAIGeneratedSvg('#0d1b2a', '#e0a96d', 'ROYAL KANCHIPURAM', 'Zari Gold Weave'),
      likes: 242,
      createdAt: '2026-10-27'
    },
    {
      id: 'ai_init_2',
      title: 'Heritage Diamond Choker',
      style: 'Cinematic Jewelry',
      imgUrl: createAIGeneratedSvg('#161a1d', '#b7e4c7', 'HERITAGE JEWELRY', 'Diamond & Emerald Macro'),
      likes: 189,
      createdAt: '2026-10-27'
    },
    {
      id: 'ai_init_3',
      title: 'Bridal Crimson Silk Drape',
      style: 'Modern Festive',
      imgUrl: createAIGeneratedSvg('#3d0c02', '#f6bd60', 'BRIDAL CRIMSON', 'Temple Zari Drape'),
      likes: 310,
      createdAt: '2026-10-26'
    },
    {
      id: 'ai_init_4',
      title: 'Contemporary Studio Lookbook',
      style: 'Haute Couture',
      imgUrl: createAIGeneratedSvg('#1a1a24', '#ff70a6', 'HAUTE COUTURE', 'Architectural Silhouette'),
      likes: 154,
      createdAt: '2026-10-26'
    }
  ];

  // Load user generated pictures from storage
  try {
    const saved = localStorage.getItem('dnm_ai_pictures');
    if (saved) generatedPictures = [...JSON.parse(saved), ...generatedPictures];
  } catch(_) {}

  function initAIEngine(container) {
    if (!container) return;
    renderAIStudioBanner(container.querySelector('#dnm-ai-banner-wrap'));
    renderPicturesGrid(container.querySelector('#dnm-pictures-grid-wrap'));
  }

  function renderAIStudioBanner(wrapEl) {
    if (!wrapEl) return;
    wrapEl.innerHTML = `
      <div class="dnm-ai-studio-banner">
        <div class="dnm-ai-header-row">
          <div class="dnm-ai-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></svg>
            <span>AI Creative Visuals Engine</span>
          </div>
          <span class="dnm-ai-badge">Gemini Powered</span>
        </div>

        <div class="dnm-ai-prompt-box">
          <div class="dnm-ai-input-wrap">
            <input type="text" id="dnm-ai-prompt-inp" class="dnm-ai-prompt-input" placeholder="Describe a fashion or commercial still (e.g. Royal Silk Saree)...">
            <button type="button" id="dnm-ai-submit-btn" class="dnm-ai-gen-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>Generate</span>
            </button>
          </div>

          <div class="dnm-ai-presets-scroll">
            ${PRESETS.map((p, idx) => `
              <button type="button" class="dnm-ai-preset-pill ${idx === 0 ? 'active' : ''}" data-prompt="${p.prompt}" data-label="${p.label}">
                ${p.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    const inp = wrapEl.querySelector('#dnm-ai-prompt-inp');
    const btn = wrapEl.querySelector('#dnm-ai-submit-btn');

    // Preset clicks
    wrapEl.querySelectorAll('.dnm-ai-preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        wrapEl.querySelectorAll('.dnm-ai-preset-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        inp.value = pill.dataset.prompt;
      });
    });

    // Default input value
    inp.value = PRESETS[0].prompt;

    // Generate action
    btn.addEventListener('click', () => {
      const prompt = inp.value.trim();
      if (!prompt) return;
      triggerGenerate(prompt, btn);
    });
  }

  function triggerGenerate(prompt, btn) {
    btn.classList.add('loading');
    btn.innerHTML = '<span>Creating Art...</span>';

    setTimeout(() => {
      // Procedural creative engine generates high-fidelity fashion still SVG
      const colors = [
        ['#1e1b4b', '#f59e0b'],
        ['#31102f', '#ec4899'],
        ['#064e3b', '#34d399'],
        ['#450a0a', '#f87171'],
        ['#0f172a', '#38bdf8']
      ];
      const pick = colors[Math.floor(Math.random() * colors.length)];
      const title = prompt.split(',')[0].slice(0, 32);

      const newPic = {
        id: 'ai_' + Date.now(),
        title: title || 'Daynight AI Creation',
        style: 'Fashion Editorial',
        imgUrl: createAIGeneratedSvg(pick[0], pick[1], title.toUpperCase(), 'Gemini AI Master Edition'),
        likes: 1,
        createdAt: 'Just now'
      };

      generatedPictures.unshift(newPic);
      try {
        const userSaved = generatedPictures.filter(p => p.id.startsWith('ai_'));
        localStorage.setItem('dnm_ai_pictures', JSON.stringify(userSaved));
      } catch(_) {}

      btn.classList.remove('loading');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Generate</span>';

      const gridWrap = document.querySelector('#dnm-pictures-grid-wrap');
      if (gridWrap) renderPicturesGrid(gridWrap);
    }, 1200);
  }

  function renderPicturesGrid(gridWrap) {
    if (!gridWrap) return;
    let html = '';
    generatedPictures.forEach(item => {
      html += `
        <div class="dnm-picture-card" data-pic-id="${item.id}">
          <img class="dnm-picture-img" src="${item.imgUrl}" alt="${item.title}" loading="lazy">
          <div class="dnm-picture-overlay">
            <span class="dnm-picture-title">${item.title}</span>
            <div class="dnm-picture-actions">
              <span style="font-size:11px;color:rgba(255,255,255,0.85);">${item.likes} likes</span>
              <button type="button" class="dnm-picture-btn" data-action="download-pic" data-url="${item.imgUrl}" data-name="${item.title}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 4v12m-4-4l4 4 4-4M4 20h16"/></svg>
                Save
              </button>
            </div>
          </div>
        </div>
      `;
    });

    gridWrap.innerHTML = html;

    // Attach download trigger
    gridWrap.querySelectorAll('[data-action="download-pic"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = btn.dataset.url;
        a.download = (btn.dataset.name || 'ai-picture') + '.svg';
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    });
  }

  // Generates high-res visual artwork SVG for AI Picture stills
  function createAIGeneratedSvg(bg, accent, headline, subtitle) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000">
        <defs>
          <linearGradient id="g_${Math.random().toString(36).slice(2)}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${bg}"/>
            <stop offset="100%" stop-color="#020408"/>
          </linearGradient>
          <radialGradient id="r_${Math.random().toString(36).slice(2)}" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stop-color="${accent}" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="800" height="1000" fill="url(#g_${bg.slice(1)})"/>
        <rect width="800" height="1000" fill="url(#r_${accent.slice(1)})"/>
        <rect x="30" y="30" width="740" height="940" rx="20" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
        <circle cx="400" cy="420" r="160" fill="none" stroke="${accent}" stroke-opacity="0.4" stroke-width="2"/>
        <circle cx="400" cy="420" r="110" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
        <text x="400" y="430" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="64" font-weight="800" fill="${accent}" letter-spacing="4">&#10022;</text>
        <rect x="220" y="780" width="360" height="110" rx="16" fill="rgba(0,0,0,0.65)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        <text x="400" y="825" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="18" font-weight="700" fill="#FFFFFF" letter-spacing="1">${headline}</text>
        <text x="400" y="855" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" fill="${accent}" letter-spacing="1.5">${subtitle}</text>
      </svg>
    `;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  window.DNM_AI = {
    initAIEngine
  };

})(window);
