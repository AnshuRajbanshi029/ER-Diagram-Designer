(() => {
  const app = document.getElementById('app');
  const panel = document.getElementById('assistant');
  const aiToggle = document.getElementById('ai-toggle');
  const fab = document.getElementById('ai-fab');
  const closeBtn = document.getElementById('ai-close');
  const newBtn = document.getElementById('ai-new');
  const emptyAi = document.getElementById('empty-ai');
  const scrollEl = document.getElementById('ai-scroll');
  const listEl = document.getElementById('ai-messages');
  const form = document.getElementById('ai-form');
  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-send');
  const attachBtn = document.getElementById('ai-attach');
  const fileInput = document.getElementById('ai-file');
  const attachmentsEl = document.getElementById('ai-attachments');
  const modelSelect = document.getElementById('ai-model');
  const contextEl = document.getElementById('ai-context');
  const contextText = document.getElementById('ai-context-text');

  const MAX_IMAGES = 4;
  const MAX_EDGE = 1568;
  const ICON = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;

  const messages = []; // { role, text, images, status, el, bodyEl }
  let pending = []; // images attached to the draft
  let busy = false;
  let controller = null;
  let lastSent = null; // canvas snapshot at the time of the previous request
  let stick = true;

  /* ---------- Canvas context ---------- */

  const snap = () => window.ERDiagram.getSnapshot();
  const nameOf = (e) => (e.label ? `"${e.label}"` : `(unnamed ${e.typeLabel.toLowerCase()})`);

  function describeCanvas(s) {
    if (!s.elements.length) return 'The canvas is empty.';
    const byId = new Map(s.elements.map((e) => [e.id, e]));
    const lines = ['Elements (type, name, position):'];
    s.elements.forEach((e) => lines.push(`- ${e.typeLabel} ${nameOf(e)} at (${e.x}, ${e.y})`));
    lines.push('', 'Connections:');
    const links = s.connections
      .map((c) => [byId.get(c.from), byId.get(c.to), c])
      .filter(([a, b]) => a && b)
      .map(([a, b, c]) => `- ${nameOf(a)} (${a.typeLabel}) — ${nameOf(b)} (${b.typeLabel})${c.label ? ` [${c.label}]` : ''}`);
    lines.push(...(links.length ? links : ['(none)']));
    return lines.join('\n');
  }

  function describeSelection(s) {
    const e = s.elements.find((x) => x.id === s.selectedId);
    return e ? `${e.typeLabel} ${nameOf(e)}` : '';
  }

  function diffLines(prev, cur) {
    if (!prev) return [];
    const lines = [];
    const before = new Map(prev.elements.map((e) => [e.id, e]));
    const after = new Map(cur.elements.map((e) => [e.id, e]));
    const lookup = (id) => after.get(id) || before.get(id);
    const label = (e) => `${e.typeLabel} ${nameOf(e)}`;

    cur.elements.forEach((e) => {
      const old = before.get(e.id);
      if (!old) lines.push(`Added ${label(e)}`);
      else if (old.label !== e.label) lines.push(`Renamed ${old.typeLabel} ${nameOf(old)} to ${nameOf(e)}`);
    });
    prev.elements.forEach((e) => {
      if (!after.has(e.id)) lines.push(`Removed ${label(e)}`);
    });

    const moved = cur.elements.filter((e) => {
      const old = before.get(e.id);
      return old && Math.hypot(old.x - e.x, old.y - e.y) > 40;
    });
    if (moved.length) {
      const names = moved.slice(0, 5).map((e) => nameOf(e)).join(', ');
      lines.push(`Moved ${moved.length} element${moved.length > 1 ? 's' : ''}: ${names}${moved.length > 5 ? ', …' : ''}`);
    }

    const key = (c) => [c.from, c.to].sort().join('|');
    const prevLinks = new Map(prev.connections.map((c) => [key(c), c]));
    const curLinks = new Map(cur.connections.map((c) => [key(c), c]));
    const both = (c) => {
      const a = lookup(c.from);
      const b = lookup(c.to);
      return a && b ? `${nameOf(a)} and ${nameOf(b)}` : null;
    };
    curLinks.forEach((c, k) => {
      if (!prevLinks.has(k) && before.has(c.from) && before.has(c.to)) lines.push(`Connected ${both(c)}`);
    });
    prevLinks.forEach((c, k) => {
      if (!curLinks.has(k) && after.has(c.from) && after.has(c.to)) lines.push(`Disconnected ${both(c)}`);
    });
    return lines;
  }

  function buildContext() {
    const s = snap();
    return {
      canvas: describeCanvas(s),
      changes: diffLines(lastSent, s).join('\n'),
      selection: describeSelection(s),
      snapshot: s,
    };
  }

  let chipQueued = false;
  function updateChip() {
    if (chipQueued) return;
    chipQueued = true;
    requestAnimationFrame(() => {
      chipQueued = false;
      const s = snap();
      const changes = diffLines(lastSent, s).length;
      const base = `${s.elements.length} element${s.elements.length === 1 ? '' : 's'} · ${s.connections.length} link${s.connections.length === 1 ? '' : 's'}`;
      contextText.textContent = changes ? `${base} · ${changes} new change${changes === 1 ? '' : 's'}` : base;
      contextEl.classList.toggle('has-changes', changes > 0);
      const sel = describeSelection(s);
      contextEl.title = (sel ? `Selected: ${sel}. ` : '') +
        (changes ? 'The assistant will see these changes with your next message.' : 'The assistant sees your canvas live.');
    });
  }
  window.addEventListener('diagram:change', updateChip);
  window.addEventListener('diagram:selection', updateChip);

  /* ---------- Markdown (small, HTML-escaping renderer) ---------- */

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function inline(src) {
    const codes = [];
    let s = src.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?!\w)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  }

  const reFence = /^```/;
  const reList = /^\s*([-*+]|\d+[.)])\s+/;
  const reTableSep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  const splitRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  function renderMarkdown(src) {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const startsBlock = (l, next) =>
      reFence.test(l) || /^#{1,4}\s/.test(l) || reList.test(l) || /^>/.test(l) || (l.includes('|') && next !== undefined && reTableSep.test(next));

    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }

      if (reFence.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !reFence.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }

      let m = line.match(/^(#{1,4})\s+(.*)$/);
      if (m) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (line.includes('|') && i + 1 < lines.length && reTableSep.test(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
        out.push(
          '<div class="table-wrap"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>'
        );
        continue;
      }

      if (/^>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
        continue;
      }

      if (reList.test(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        while (i < lines.length && reList.test(lines[i])) items.push(lines[i++].replace(reList, ''));
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
        continue;
      }

      const buf = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && (buf.length === 0 || !startsBlock(lines[i], lines[i + 1]))) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  /* ---------- Diagram blocks ---------- */

  // The model builds diagrams by writing a ```er-diagram JSON block. We apply it to the canvas the
  // moment the block is complete (even while the rest of the reply is still streaming).
  const BLOCK_RE = /```er-diagram[^\n]*\n([\s\S]*?)(```|$)/g;
  let changeCounter = 0;
  window.addEventListener('diagram:change', () => {
    changeCounter++;
    messages.forEach((m) => { if (m.blocks?.some((b) => b.status === 'applied')) paint(m, true); });
  });

  function extractBlocks(text) {
    const blocks = [];
    let match;
    BLOCK_RE.lastIndex = 0;
    while ((match = BLOCK_RE.exec(text))) {
      blocks.push({ start: match.index, end: match.index + match[0].length, body: match[1], complete: match[2] === '```' });
      if (match[2] !== '```') break;
    }
    return blocks;
  }

  function parseSpec(body) {
    let src = body.trim();
    const first = src.indexOf('{');
    const last = src.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object found.');
    src = src.slice(first, last + 1)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(src);
  }

  function summarize(report) {
    const parts = [];
    if (report.replaced) parts.push('new diagram');
    if (report.added) parts.push(`${report.added} element${report.added === 1 ? '' : 's'} added`);
    if (report.connected) parts.push(`${report.connected} connection${report.connected === 1 ? '' : 's'}`);
    if (report.renamed) parts.push(`${report.renamed} renamed`);
    if (report.removed) parts.push(`${report.removed} removed`);
    return parts.join(' · ') || 'No changes';
  }

  // Apply every completed block exactly once.
  function processBlocks(m) {
    m.blocks = m.blocks || [];
    extractBlocks(m.text).forEach((block, i) => {
      if (!block.complete || m.blocks[i]) return;
      try {
        const report = window.ERDiagram.apply(parseSpec(block.body));
        m.blocks[i] = { status: 'applied', report, version: changeCounter };
        lastSent = snap();
        updateChip();
      } catch (err) {
        m.blocks[i] = { status: 'error', error: err.message };
      }
    });
  }

  function cardHtml(m, block, index) {
    const state = m.blocks?.[index];
    const icon = (name) => ICON(name);
    if (!block.complete) {
      const count = (block.body.match(/"label"/g) || []).length;
      return `<div class="er-card"><span class="er-card-icon"><span class="spinner"></span></span><div class="er-card-text"><strong>Designing on your canvas…</strong><span>${count ? `${count} elements so far` : 'Planning the layout'}</span></div></div>`;
    }
    if (!state) return '';
    if (state.status === 'error') {
      return `<div class="er-card error"><span class="er-card-icon">${icon('x')}</span><div class="er-card-text"><strong>Couldn't build that diagram</strong><span>${esc(state.error)}. Ask me to try again.</span></div></div>`;
    }
    if (state.status === 'undone') {
      return `<div class="er-card"><span class="er-card-icon">${icon('undo')}</span><div class="er-card-text"><strong>Diagram changes undone</strong></div></div>`;
    }
    const note = state.report.warnings.length ? `${summarize(state.report)} · ${state.report.warnings.length} skipped` : summarize(state.report);
    const undoable = state.version === changeCounter;
    return `<div class="er-card done"><span class="er-card-icon">${icon('wand')}</span><div class="er-card-text"><strong>Diagram updated</strong><span>${esc(note)}</span></div>` +
      '<div class="er-card-actions">' +
      `<button type="button" class="btn ghost" data-er-fit>Fit view</button>` +
      (undoable ? `<button type="button" class="btn ghost" data-er-undo="${index}">Undo</button>` : '') + '</div></div>';
  }

  // Swap ```er-diagram blocks for placeholders, render markdown, then drop the status cards in.
  function renderWithCards(m) {
    const blocks = extractBlocks(m.text);
    let text = '';
    let cursor = 0;
    blocks.forEach((block, i) => {
      text += m.text.slice(cursor, block.start) + `\n\n@@ER${i}@@\n\n`;
      cursor = block.end;
    });
    text += m.text.slice(cursor);
    let html = renderMarkdown(text);
    blocks.forEach((block, i) => {
      html = html.replace(`<p>@@ER${i}@@</p>`, cardHtml(m, block, i));
    });
    return html;
  }

  /* ---------- Message rendering ---------- */

  function nearBottom() {
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80;
  }
  scrollEl.addEventListener('scroll', () => { stick = nearBottom(); });

  function scrollToEnd(force) {
    if (force || stick) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function appendCaret(root) {
    let node = root;
    while (node.lastElementChild && node.lastElementChild.tagName !== 'PRE') node = node.lastElementChild;
    const caret = document.createElement('span');
    caret.className = 'caret';
    node.appendChild(caret);
  }

  function paint(m, quiet) {
    if (m.role !== 'assistant') return;
    processBlocks(m);
    const body = m.bodyEl;
    if (m.status === 'streaming' && !m.text) {
      body.innerHTML = '<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>';
    } else {
      body.innerHTML = renderWithCards(m);
      if (m.status === 'streaming') appendCaret(body);
    }
    if (!quiet) scrollToEnd();
  }

  function buildMessage(m) {
    const el = document.createElement('div');
    if (m.role === 'user') {
      el.className = 'msg user';
      if (m.images.length) {
        const wrap = document.createElement('div');
        wrap.className = 'bubble-images';
        m.images.forEach((img) => {
          const i = document.createElement('img');
          i.src = img.url;
          i.alt = 'Attached image';
          wrap.appendChild(i);
        });
        el.appendChild(wrap);
      }
      if (m.text) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = m.text;
        el.appendChild(bubble);
      }
    } else {
      el.className = 'msg ai';
      el.innerHTML = `<span class="msg-avatar">${ICON('sparkle')}</span><div class="msg-main"><div class="msg-body md"></div></div>`;
      m.bodyEl = el.querySelector('.msg-body');
      m.bodyEl.addEventListener('click', (e) => {
        const undoBtn = e.target.closest('[data-er-undo]');
        if (undoBtn) {
          const block = m.blocks?.[Number(undoBtn.dataset.erUndo)];
          if (block && block.version === changeCounter) {
            window.ERDiagram.undo();
            block.status = 'undone';
            lastSent = snap();
            paint(m, true);
          }
        } else if (e.target.closest('[data-er-fit]')) {
          window.ERDiagram.fit();
        }
      });
      m.mainEl = el.querySelector('.msg-main');
    }
    m.el = el;
    listEl.appendChild(el);
    paint(m);
    scrollToEnd(true);
  }

  function addActions(m) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'icon-btn';
    copy.title = 'Copy response';
    copy.setAttribute('aria-label', 'Copy response');
    copy.innerHTML = ICON('copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(m.text);
        copy.innerHTML = ICON('check');
        setTimeout(() => { copy.innerHTML = ICON('copy'); }, 1500);
      } catch { /* clipboard blocked */ }
    });
    actions.appendChild(copy);
    m.mainEl.appendChild(actions);
  }

  function showError(m, text) {
    m.status = 'error';
    m.el.classList.add('error');
    m.el.classList.remove('streaming');
    m.bodyEl.textContent = text;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn ghost';
    retry.innerHTML = `${ICON('refresh')}<span>Try again</span>`;
    retry.addEventListener('click', () => {
      if (busy) return;
      remove(m);
      run();
    });
    m.mainEl.appendChild(retry);
    scrollToEnd(true);
  }

  function remove(m) {
    m.el.remove();
    messages.splice(messages.indexOf(m), 1);
  }

  /* ---------- Welcome ---------- */

  function renderWelcome() {
    listEl.querySelector('.ai-welcome')?.remove();
    if (messages.length) return;
    const s = snap();
    const sel = s.elements.find((e) => e.id === s.selectedId);
    const ideas = s.elements.length
      ? [
          'Add the missing attributes and relationships to my diagram',
          'Review my diagram for modelling mistakes and fix them',
          sel && sel.label ? `Add three more attributes to "${sel.label}"` : null,
          'Convert this diagram into SQL tables',
        ].filter(Boolean).slice(0, 4)
      : [
          'Design a school management system',
          'Design a hospital management ER diagram',
          'Build an online food delivery ER diagram',
          'Design a library system with fines and reservations',
        ];

    const wrap = document.createElement('div');
    wrap.className = 'ai-welcome';
    wrap.innerHTML = '<h3>How can I help with your diagram?</h3><p>I can see your canvas as you edit it, so ask about anything on it. You can also attach a sketch or screenshot.</p><div class="suggestions"></div>';
    const box = wrap.querySelector('.suggestions');
    ideas.forEach((text) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggestion';
      b.textContent = text;
      b.addEventListener('click', () => send(text, []));
      box.appendChild(b);
    });
    listEl.appendChild(wrap);
  }

  /* ---------- Sending & streaming ---------- */

  function setBusy(v) {
    busy = v;
    sendBtn.classList.toggle('busy', v);
    sendBtn.setAttribute('aria-label', v ? 'Stop response' : 'Send message');
    listEl.setAttribute('aria-busy', String(v));
    syncSend();
  }

  function syncSend() {
    sendBtn.disabled = !busy && !input.value.trim() && pending.length === 0;
  }

  function payloadMessages() {
    const ready = messages.filter((m) => m.status !== 'error' && (m.text || m.images?.length));
    return ready.map((m, i) => {
      const content = [];
      const recent = i >= ready.length - 6;
      (m.images || []).forEach((img) => {
        if (recent) content.push({ type: 'image', mediaType: img.mediaType, data: img.data });
        else content.push({ type: 'text', text: '(an earlier image was attached here)' });
      });
      const text = m.role === 'assistant'
        ? m.text.replace(/```er-diagram[^\n]*\n[\s\S]*?```/g, '[Applied the diagram changes to the canvas.]')
        : m.text;
      if (text) content.push({ type: 'text', text });
      return { role: m.role, content };
    });
  }

  async function readStream(res, m) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let raf = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(m); });
    };

    const handle = (data) => {
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        m.text += data.delta.text;
        schedule();
      } else if (data.type === 'message_delta' && data.delta?.stop_reason === 'max_tokens') {
        m.text += '\n\n*(Response cut off. Ask me to continue.)*';
      } else if (data.type === 'error') {
        throw new Error(data.error?.message || 'The response was interrupted.');
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const evt = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = evt.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
          if (!dataLine) continue;
          try { handle(JSON.parse(dataLine)); } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }
    } finally {
      if (raf) cancelAnimationFrame(raf);
    }
  }

  async function run() {
    const m = { role: 'assistant', text: '', images: [], status: 'streaming' };
    messages.push(m);
    buildMessage(m);
    m.el.classList.add('streaming');
    setBusy(true);
    stick = true;
    controller = new AbortController();

    const ctx = buildContext();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: payloadMessages(),
          model: modelSelect.value,
          context: { canvas: ctx.canvas, changes: ctx.changes, selection: ctx.selection },
        }),
      });

      if (!res.ok) {
        let message = '';
        try { message = (await res.json()).error; } catch { /* not JSON */ }
        if (res.status === 404 || res.status === 405) {
          message = 'The AI backend was not found. Run the app with `node dev-server.mjs` locally, or deploy it to Netlify.';
        }
        throw new Error(message || `The assistant returned an error (${res.status}).`);
      }

      lastSent = ctx.snapshot;
      updateChip();
      await readStream(res, m);

      m.status = 'done';
      m.el.classList.remove('streaming');
      if (!m.text.trim()) m.text = '*(No response. Try rephrasing.)*';
      paint(m);
      addActions(m);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (m.text.trim()) {
          m.status = 'done';
          m.el.classList.remove('streaming');
          paint(m);
          addActions(m);
        } else {
          remove(m);
        }
      } else {
        const offline = err instanceof TypeError;
        showError(m, offline ? "Couldn't reach the assistant. Check your connection and try again." : err.message);
      }
    } finally {
      controller = null;
      setBusy(false);
      scrollToEnd();
    }
  }

  async function send(text, images) {
    text = text.trim();
    if (busy || (!text && images.length === 0)) return;

    listEl.querySelector('.ai-welcome')?.remove();
    const m = { role: 'user', text, images, status: 'done' };
    messages.push(m);
    buildMessage(m);
    await run();
  }

  /* ---------- Attachments ---------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  async function toAttachment(file) {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.86);
    return { mediaType: 'image/jpeg', data: url.split(',')[1], url };
  }

  async function addFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const file of images) {
      if (pending.length >= MAX_IMAGES) break;
      try { pending.push(await toAttachment(file)); } catch { /* skip unreadable file */ }
    }
    renderAttachments();
  }

  function renderAttachments() {
    attachmentsEl.hidden = pending.length === 0;
    attachmentsEl.innerHTML = '';
    pending.forEach((img, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.innerHTML = '<img alt="Attachment preview">';
      t.querySelector('img').src = img.url;
      const x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove image');
      x.innerHTML = ICON('x');
      x.addEventListener('click', () => { pending.splice(i, 1); renderAttachments(); });
      t.appendChild(x);
      attachmentsEl.appendChild(t);
    });
    attachBtn.disabled = pending.length >= MAX_IMAGES;
    syncSend();
  }

  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

  input.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });

  let dragDepth = 0;
  panel.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    dragDepth++;
    panel.classList.add('dragover');
  });
  panel.addEventListener('dragover', (e) => e.preventDefault());
  panel.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) panel.classList.remove('dragover');
  });
  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    panel.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  /* ---------- Composer ---------- */

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  input.addEventListener('input', () => { autosize(); syncSend(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!busy) form.requestSubmit();
    } else if (e.key === 'Escape' && busy) {
      controller?.abort();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { controller?.abort(); return; }
    const text = input.value;
    const images = pending;
    input.value = '';
    pending = [];
    autosize();
    renderAttachments();
    send(text, images);
  });

  /* ---------- Panel ---------- */

  function setOpen(open) {
    app.dataset.ai = open ? 'open' : 'closed';
    aiToggle.setAttribute('aria-expanded', String(open));
    aiToggle.classList.toggle('active', open);
    if (open) {
      renderWelcome();
      updateChip();
      scrollToEnd(true);
      requestAnimationFrame(() => input.focus());
    }
  }

  aiToggle.addEventListener('click', () => setOpen(app.dataset.ai !== 'open'));
  fab.addEventListener('click', () => setOpen(true));
  closeBtn.addEventListener('click', () => setOpen(false));
  emptyAi.addEventListener('click', () => {
    setOpen(true);
    if (!input.value) {
      input.value = 'Design an ER diagram for a ';
      autosize();
      syncSend();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  newBtn.addEventListener('click', () => {
    controller?.abort();
    messages.splice(0).forEach((m) => m.el.remove());
    listEl.innerHTML = '';
    lastSent = null;
    updateChip();
    renderWelcome();
  });

  try {
    const saved = localStorage.getItem('er-ai-model');
    if (saved && Array.from(modelSelect.options).some((o) => o.value === saved)) modelSelect.value = saved;
  } catch { /* storage unavailable */ }
  modelSelect.addEventListener('change', () => {
    try { localStorage.setItem('er-ai-model', modelSelect.value); } catch { /* ignore */ }
  });

  updateChip();
})();
