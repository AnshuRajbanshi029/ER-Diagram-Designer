const appEl = document.getElementById('app');
const canvas = document.getElementById('canvas');
const connectionsSvg = document.getElementById('connections');
const labelInput = document.getElementById('prop-label');
const typeReadout = document.getElementById('prop-type');
const propSummary = document.getElementById('prop-summary');
const propLinksField = document.getElementById('prop-links-field');
const propLinks = document.getElementById('prop-links');
const deleteBtn = document.getElementById('delete-selected');
const clearBtn = document.getElementById('clear-canvas');
const moveBtn = document.getElementById('mode-move');
const connectToggle = document.getElementById('connect-toggle');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const themeToggle = document.getElementById('theme-toggle');
const paletteEl = document.getElementById('palette');
const emptyState = document.getElementById('empty-state');
const contextMenu = document.getElementById('context-menu');
const menuEdit = document.getElementById('menu-edit');
const menuDuplicate = document.getElementById('menu-duplicate');
const menuDelete = document.getElementById('menu-delete');
const confirmDialogEl = document.getElementById('confirm-dialog');

const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  elements: new Map(),
  connections: [],
  selectedId: null,
  selectedConnectionId: null,
  connectMode: false,
  pendingConnectionFrom: null,
  dragging: null,
  isDraggingConnection: false,
  connectionDragPos: { x: 0, y: 0 },
  undoStack: [],
  redoStack: [],
};

let idCounter = 1;
let connectionCounter = 1;

const typeLabels = {
  'entity': 'Entity',
  'weak-entity': 'Weak Entity',
  'relationship': 'Relationship',
  'identifying-relationship': 'Identifying Relationship',
  'attribute': 'Attribute',
  'key-attribute': 'Key Attribute',
  'multivalued-attribute': 'Multivalued Attribute',
  'derived-attribute': 'Derived Attribute',
  'isa': 'ISA',
  'associative-entity': 'Associative Entity',
};

const paletteTypes = [
  ['entity', 'Entity'],
  ['weak-entity', 'Weak entity'],
  ['relationship', 'Relationship'],
  ['identifying-relationship', 'Identifying rel.'],
  ['attribute', 'Attribute'],
  ['key-attribute', 'Key attribute'],
  ['multivalued-attribute', 'Multivalued'],
  ['derived-attribute', 'Derived'],
  ['associative-entity', 'Associative'],
  ['isa', 'ISA'],
];

// Template coordinates are top-left positions; loadTemplate() centers the whole layout.
const templates = {
  library: {
    elements: [
      { key: 'Author', type: 'entity', label: 'Author', x: 30, y: 200 },
      { key: 'Writes', type: 'relationship', label: 'Writes', x: 200, y: 182 },
      { key: 'Book', type: 'entity', label: 'Book', x: 430, y: 200 },
      { key: 'AuthorID', type: 'key-attribute', label: 'Author ID', x: 10, y: 70 },
      { key: 'AuthorName', type: 'attribute', label: 'Name', x: 150, y: 70 },
      { key: 'ISBN', type: 'key-attribute', label: 'ISBN', x: 380, y: 70 },
      { key: 'Title', type: 'attribute', label: 'Title', x: 520, y: 70 },
      { key: 'Loans', type: 'relationship', label: 'Loans', x: 416, y: 320 },
      { key: 'LoanDate', type: 'attribute', label: 'Loan Date', x: 240, y: 340 },
      { key: 'Borrower', type: 'entity', label: 'Borrower', x: 430, y: 470 },
      { key: 'MemberID', type: 'key-attribute', label: 'Member ID', x: 240, y: 470 },
    ],
    connections: [
      ['Author', 'Writes'], ['Book', 'Writes'],
      ['Author', 'AuthorID'], ['Author', 'AuthorName'],
      ['Book', 'ISBN'], ['Book', 'Title'],
      ['Book', 'Loans'], ['Borrower', 'Loans'], ['Loans', 'LoanDate'],
      ['Borrower', 'MemberID'],
    ],
  },
  ecommerce: {
    elements: [
      { key: 'Customer', type: 'entity', label: 'Customer', x: 30, y: 200 },
      { key: 'Places', type: 'relationship', label: 'Places', x: 200, y: 182 },
      { key: 'Order', type: 'entity', label: 'Order', x: 430, y: 200 },
      { key: 'CustomerID', type: 'key-attribute', label: 'Customer ID', x: 10, y: 70 },
      { key: 'Email', type: 'attribute', label: 'Email', x: 150, y: 70 },
      { key: 'OrderID', type: 'key-attribute', label: 'Order ID', x: 400, y: 70 },
      { key: 'OrderDate', type: 'attribute', label: 'Order Date', x: 540, y: 70 },
      { key: 'OrderLine', type: 'associative-entity', label: 'Order Line', x: 426, y: 330 },
      { key: 'Quantity', type: 'attribute', label: 'Quantity', x: 240, y: 300 },
      { key: 'Price', type: 'attribute', label: 'Price', x: 240, y: 390 },
      { key: 'Product', type: 'entity', label: 'Product', x: 430, y: 470 },
      { key: 'ProductID', type: 'key-attribute', label: 'Product ID', x: 240, y: 470 },
    ],
    connections: [
      ['Customer', 'Places'], ['Order', 'Places'],
      ['Customer', 'CustomerID'], ['Customer', 'Email'],
      ['Order', 'OrderID'], ['Order', 'OrderDate'],
      ['Order', 'OrderLine'], ['Product', 'OrderLine'],
      ['OrderLine', 'Quantity'], ['OrderLine', 'Price'],
      ['Product', 'ProductID'],
    ],
  },
  university: {
    elements: [
      { key: 'Student', type: 'entity', label: 'Student', x: 30, y: 200 },
      { key: 'Enrolls', type: 'relationship', label: 'Enrolls', x: 200, y: 182 },
      { key: 'Course', type: 'entity', label: 'Course', x: 430, y: 200 },
      { key: 'StudentID', type: 'key-attribute', label: 'Student ID', x: 10, y: 70 },
      { key: 'StudentName', type: 'attribute', label: 'Name', x: 150, y: 70 },
      { key: 'CourseCode', type: 'key-attribute', label: 'Course Code', x: 380, y: 70 },
      { key: 'CourseTitle', type: 'attribute', label: 'Title', x: 520, y: 70 },
      { key: 'Grade', type: 'derived-attribute', label: 'Grade', x: 218, y: 310 },
      { key: 'Teaches', type: 'relationship', label: 'Teaches', x: 416, y: 320 },
      { key: 'Instructor', type: 'entity', label: 'Instructor', x: 430, y: 470 },
      { key: 'EmployeeID', type: 'key-attribute', label: 'Employee ID', x: 240, y: 470 },
    ],
    connections: [
      ['Student', 'Enrolls'], ['Course', 'Enrolls'], ['Enrolls', 'Grade'],
      ['Student', 'StudentID'], ['Student', 'StudentName'],
      ['Course', 'CourseCode'], ['Course', 'CourseTitle'],
      ['Instructor', 'Teaches'], ['Course', 'Teaches'],
      ['Instructor', 'EmployeeID'],
    ],
  },
};

/* ---------- Shapes (SVG, themed through CSS variables) ---------- */

function shapeMarkup(type, w, h) {
  const n = (v) => Math.round(v * 10) / 10;
  const m = 1;
  const inset = h < 40 ? 4 : 6;
  const rect = (cls, x, y, rw, rh, rx) =>
    `<rect class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(rw)}" height="${n(rh)}" rx="${rx}"/>`;
  const poly = (cls, pts) =>
    `<polygon class="${cls}" points="${pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ')}"/>`;
  const ellipse = (cls, rx, ry) =>
    `<ellipse class="${cls}" cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(rx)}" ry="${n(ry)}"/>`;
  const diamond = (cls, scale = 1) => {
    const a = (w / 2 - m) * scale;
    const b = (h / 2 - m) * scale;
    return poly(cls, [[w / 2, h / 2 - b], [w / 2 + a, h / 2], [w / 2, h / 2 + b], [w / 2 - a, h / 2]]);
  };

  switch (type) {
    case 'weak-entity':
      return rect('body', m, m, w - 2, h - 2, 8) + rect('inner', inset + m, inset + m, w - 2 * (inset + m), h - 2 * (inset + m), 4);
    case 'relationship':
      return diamond('body');
    case 'identifying-relationship': {
      const s = Math.max(0.5, (h / 2 - m - inset - 2) / (h / 2 - m));
      return diamond('body') + diamond('inner', s);
    }
    case 'attribute':
    case 'key-attribute':
      return ellipse('body', w / 2 - m, h / 2 - m);
    case 'derived-attribute':
      return ellipse('body dashed', w / 2 - m, h / 2 - m);
    case 'multivalued-attribute':
      return ellipse('body', w / 2 - m, h / 2 - m) + ellipse('inner', w / 2 - m - inset - 1, h / 2 - m - inset - 1);
    case 'isa':
      return poly('body', [[w / 2, m], [w - m, h - m], [m, h - m]]);
    case 'associative-entity':
      return rect('body', m, m, w - 2, h - 2, 6) + diamond('inner');
    default:
      return rect('body', m, m, w - 2, h - 2, 8);
  }
}

function renderPalette() {
  paletteTypes.forEach(([type, label]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'palette-item';
    item.dataset.type = type;
    item.innerHTML =
      `<svg class="shape-icon shape" viewBox="0 0 52 32" aria-hidden="true">${shapeMarkup(type, 52, 32)}</svg><span>${label}</span>`;
    paletteEl.appendChild(item);
  });
}

/* ---------- Helpers ---------- */

function displayName(item) {
  return item.label || `Unnamed ${(typeLabels[item.type] || 'element').toLowerCase()}`;
}

function isTypingTarget(target) {
  return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function confirmDialog({ title, message, confirmText = 'Continue', danger = false }) {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-ok');
    ok.textContent = confirmText;
    ok.classList.toggle('danger-mode', danger);
    confirmDialogEl.returnValue = '';
    confirmDialogEl.addEventListener('close', () => resolve(confirmDialogEl.returnValue === 'ok'), { once: true });
    confirmDialogEl.showModal();
  });
}

function emit(name) {
  window.dispatchEvent(new CustomEvent(name));
}

/* ---------- Selection & inspector ---------- */

function setSelected(id) {
  if (state.selectedId && state.elements.has(state.selectedId)) {
    state.elements.get(state.selectedId).el.classList.remove('selected');
  }
  state.selectedId = id && state.elements.has(id) ? id : null;
  state.selectedConnectionId = null;
  if (state.selectedId) state.elements.get(state.selectedId).el.classList.add('selected');
  refreshInspector();
  renderConnections();
  emit('diagram:selection');
}

function setSelectedConnection(id) {
  if (state.selectedId && state.elements.has(state.selectedId)) {
    state.elements.get(state.selectedId).el.classList.remove('selected');
  }
  state.selectedId = null;
  state.selectedConnectionId = id;
  refreshInspector();
  renderConnections();
  emit('diagram:selection');
}

function refreshInspector() {
  const setDeleteLabel = (text) => {
    deleteBtn.querySelector('span').textContent = text;
  };

  const node = state.selectedId && state.elements.get(state.selectedId);
  const link = state.selectedConnectionId && state.connections.find((c) => c.id === state.selectedConnectionId);

  if (node) {
    propSummary.textContent = typeLabels[node.type] || node.type;
    if (document.activeElement !== labelInput) labelInput.value = node.label;
    labelInput.disabled = false;
    labelInput.placeholder = typeLabels[node.type];
    typeReadout.textContent = typeLabels[node.type] || node.type;
    typeReadout.classList.add('set');

    const neighbours = state.connections
      .filter((c) => c.from === node.id || c.to === node.id)
      .map((c) => state.elements.get(c.from === node.id ? c.to : c.from))
      .filter(Boolean);
    propLinks.innerHTML = '';
    neighbours.forEach((other) => {
      const li = document.createElement('li');
      li.textContent = displayName(other);
      propLinks.appendChild(li);
    });
    propLinksField.hidden = neighbours.length === 0;
    deleteBtn.disabled = false;
    setDeleteLabel('Delete element');
  } else if (link) {
    const a = state.elements.get(link.from);
    const b = state.elements.get(link.to);
    propSummary.textContent = 'Connection';
    labelInput.value = a && b ? `${displayName(a)} — ${displayName(b)}` : '';
    labelInput.disabled = true;
    labelInput.placeholder = '';
    typeReadout.textContent = 'Connection';
    typeReadout.classList.add('set');
    propLinksField.hidden = true;
    deleteBtn.disabled = false;
    setDeleteLabel('Delete connection');
  } else {
    propSummary.textContent = 'Nothing selected';
    labelInput.value = '';
    labelInput.disabled = true;
    labelInput.placeholder = 'Select an element';
    typeReadout.textContent = 'None';
    typeReadout.classList.remove('set');
    propLinksField.hidden = true;
    deleteBtn.disabled = true;
    setDeleteLabel('Delete element');
  }
}

/* ---------- History ---------- */

function snapshot() {
  return {
    elements: Array.from(state.elements).map(([id, data]) => ({
      id,
      type: data.type,
      x: Math.round(data.x),
      y: Math.round(data.y),
      label: data.label,
    })),
    connections: state.connections.map((c) => ({ ...c })),
  };
}

function updateHistoryButtons() {
  undoBtn.disabled = state.undoStack.length <= 1;
  redoBtn.disabled = state.redoStack.length === 0;
}

// Record the current diagram in the undo stack and tell listeners (the AI panel) it changed.
function saveState() {
  const current = snapshot();
  const last = state.undoStack[state.undoStack.length - 1];
  if (!last || JSON.stringify(last) !== JSON.stringify(current)) {
    state.undoStack.push(current);
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
  }
  updateHistoryButtons();
  emit('diagram:change');
}

function undo() {
  if (state.undoStack.length <= 1) return;
  state.redoStack.push(state.undoStack.pop());
  applySnapshot(state.undoStack[state.undoStack.length - 1]);
}

function redo() {
  if (state.redoStack.length === 0) return;
  const next = state.redoStack.pop();
  state.undoStack.push(next);
  applySnapshot(next);
}

function applySnapshot(snap) {
  state.elements.forEach(removeNodeDom);
  state.elements.clear();
  snap.elements.forEach((item) => createElement({ ...item, silent: true }));
  state.connections = snap.connections.map((c) => ({ ...c }));
  state.selectedId = null;
  state.selectedConnectionId = null;
  refreshInspector();
  renderConnections();
  updateEmptyState();
  updateHistoryButtons();
  emit('diagram:change');
  emit('diagram:selection');
}

/* ---------- Elements ---------- */

function removeNodeDom(item) {
  item.observer?.disconnect();
  item.el.remove();
}

function createElement({ type, x, y, label, id: forcedId = null, silent = false }) {
  let id = forcedId;
  if (id) {
    const n = Number(String(id).replace(/\D/g, ''));
    if (n >= idCounter) idCounter = n + 1;
  } else {
    id = `node-${idCounter++}`;
  }

  const el = document.createElement('div');
  el.className = `er-node shape-${type}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.id = id;

  const shapeEl = document.createElementNS(SVG_NS, 'svg');
  shapeEl.setAttribute('class', 'shape');
  shapeEl.setAttribute('aria-hidden', 'true');
  el.appendChild(shapeEl);

  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.dataset.placeholder = typeLabels[type] || 'Element';
  labelEl.textContent = label || '';
  el.appendChild(labelEl);

  ['top', 'bottom', 'left', 'right'].forEach((pos) => {
    const anchor = document.createElement('div');
    anchor.className = `anchor ${pos}`;
    anchor.dataset.pos = pos;
    el.appendChild(anchor);

    anchor.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.pendingConnectionFrom = id;
      state.isDraggingConnection = true;
      state.connectionDragPos = { x: e.clientX, y: e.clientY };
      document.addEventListener('pointermove', handleConnectionMove);
      document.addEventListener('pointerup', handleConnectionUp, { once: true });
    });
  });

  canvas.appendChild(el);

  const elementData = { id, type, x, y, label: label || '', el, labelEl, observer: null, beginEdit: null };
  state.elements.set(id, elementData);

  // Keep the SVG outline in sync with the node's rendered size.
  let lastSize = '';
  const drawShape = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const key = `${w}x${h}`;
    if (key === lastSize || !w || !h) return;
    lastSize = key;
    shapeEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
    shapeEl.innerHTML = shapeMarkup(type, w, h);
    renderConnections();
  };
  drawShape();
  elementData.observer = new ResizeObserver(drawShape);
  elementData.observer.observe(el);

  // Inline editing
  const beginEdit = () => {
    if (el.classList.contains('editing')) return;
    el.classList.add('editing');
    labelEl.contentEditable = 'true';
    labelEl.focus();
    const range = document.createRange();
    range.selectNodeContents(labelEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishEdit = (commit = true) => {
      el.classList.remove('editing');
      labelEl.contentEditable = 'false';
      labelEl.removeEventListener('blur', onBlur);
      labelEl.removeEventListener('keydown', onKey);
      window.getSelection().removeAllRanges();
      const finalValue = commit ? labelEl.textContent.trim() : elementData.label;
      labelEl.textContent = finalValue;
      if (finalValue !== elementData.label) {
        elementData.label = finalValue;
        saveState();
      }
      refreshInspector();
    };
    const onBlur = () => finishEdit(true);
    const onKey = (ke) => {
      if (ke.key === 'Enter') {
        ke.preventDefault();
        labelEl.blur();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        finishEdit(false);
      }
    };
    labelEl.addEventListener('blur', onBlur);
    labelEl.addEventListener('keydown', onKey);
  };
  elementData.beginEdit = beginEdit;

  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    beginEdit();
  });

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.classList.contains('anchor') || el.classList.contains('editing')) return;

    if (state.connectMode) {
      handleConnectClick(id);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    state.dragging = {
      id,
      offsetX: event.clientX - rect.left - elementData.x,
      offsetY: event.clientY - rect.top - elementData.y,
      moved: false,
    };
    el.classList.add('dragging');
    el.setPointerCapture(event.pointerId);
    if (state.selectedId !== id) setSelected(id);
  });

  el.addEventListener('pointermove', (event) => {
    if (el.classList.contains('editing')) return;

    // Show only the connection dot nearest the pointer.
    if (!state.dragging) {
      const rect = el.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      let closest = null;
      let minDistance = Infinity;

      el.querySelectorAll('.anchor').forEach((anchor) => {
        const dist = Math.hypot(mouseX - (anchor.offsetLeft + anchor.offsetWidth / 2), mouseY - (anchor.offsetTop + anchor.offsetHeight / 2));
        anchor.classList.remove('visible');
        if (dist < minDistance) {
          minDistance = dist;
          closest = anchor;
        }
      });
      if (closest && minDistance < 60) closest.classList.add('visible');
    }

    if (!state.dragging || state.dragging.id !== id) return;
    const rect = canvas.getBoundingClientRect();
    state.dragging.moved = true;
    moveElement(id, event.clientX - rect.left - state.dragging.offsetX, event.clientY - rect.top - state.dragging.offsetY);
  });

  el.addEventListener('pointerleave', () => {
    el.querySelectorAll('.anchor').forEach((a) => a.classList.remove('visible'));
  });

  el.addEventListener('pointerup', () => {
    if (state.dragging && state.dragging.id === id) {
      const moved = state.dragging.moved;
      state.dragging = null;
      el.classList.remove('dragging');
      if (moved) saveState();
    }
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);

    contextMenu.style.display = 'block';
    const menuW = contextMenu.offsetWidth;
    const menuH = contextMenu.offsetHeight;
    contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - menuW - 8)}px`;
    contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - menuH - 8)}px`;

    menuEdit.onclick = () => {
      hideContextMenu();
      beginEdit();
    };
    menuDuplicate.onclick = () => {
      hideContextMenu();
      const copyId = createElement({ type: elementData.type, x: elementData.x + 40, y: elementData.y + 40, label: elementData.label });
      setSelected(copyId);
    };
    menuDelete.onclick = () => {
      hideContextMenu();
      deleteSelected();
    };
  });

  updateEmptyState();
  if (!silent) saveState();
  return id;
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
}

window.addEventListener('click', hideContextMenu);
window.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.er-node')) hideContextMenu();
});

function updateEmptyState() {
  emptyState.classList.toggle('is-hidden', state.elements.size > 0);
}

function moveElement(id, x, y) {
  const item = state.elements.get(id);
  if (!item) return;

  const maxX = canvas.clientWidth - item.el.offsetWidth;
  const maxY = canvas.clientHeight - item.el.offsetHeight;
  item.x = Math.max(8, Math.min(x, maxX - 8));
  item.y = Math.max(8, Math.min(y, maxY - 8));
  item.el.style.left = `${item.x}px`;
  item.el.style.top = `${item.y}px`;
  renderConnections();
}

/* ---------- Connections ---------- */

function getElementCenter(el) {
  const rect = el.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: rect.left - canvasRect.left + rect.width / 2,
    y: rect.top - canvasRect.top + rect.height / 2,
  };
}

function svgLine(cls, from, to) {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', cls);
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  return line;
}

let renderQueued = false;
function renderConnections() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawConnections();
  });
}

function drawConnections() {
  connectionsSvg.innerHTML = '';
  const canvasRect = canvas.getBoundingClientRect();

  state.connections.forEach((connection) => {
    const from = state.elements.get(connection.from);
    const to = state.elements.get(connection.to);
    if (!from || !to) return;
    const a = getElementCenter(from.el);
    const b = getElementCenter(to.el);

    const line = svgLine('connection-line', a, b);
    if (connection.id === state.selectedConnectionId) {
      line.style.stroke = 'var(--sel)';
      line.style.strokeWidth = '3.5';
    }
    connectionsSvg.appendChild(line);

    // Wide invisible stroke so thin lines are easy to click.
    const hit = svgLine('connection-hit', a, b);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '14');
    hit.style.pointerEvents = 'stroke';
    hit.style.cursor = 'pointer';
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      setSelectedConnection(connection.id);
    });
    connectionsSvg.appendChild(hit);
  });

  if (state.isDraggingConnection && state.pendingConnectionFrom) {
    const from = state.elements.get(state.pendingConnectionFrom);
    if (from) {
      connectionsSvg.appendChild(
        svgLine('connection-line preview', getElementCenter(from.el), {
          x: state.connectionDragPos.x - canvasRect.left,
          y: state.connectionDragPos.y - canvasRect.top,
        })
      );
    }
  }
}

function addConnection(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return false;
  const exists = state.connections.some(
    (c) => (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
  );
  if (exists) return false;
  state.connections.push({ id: `connection-${connectionCounter++}`, from: fromId, to: toId });
  return true;
}

function handleConnectionMove(e) {
  state.connectionDragPos = { x: e.clientX, y: e.clientY };
  renderConnections();
}

function handleConnectionUp(e) {
  const node = document.elementFromPoint(e.clientX, e.clientY)?.closest('.er-node');
  if (node && addConnection(state.pendingConnectionFrom, node.dataset.id)) saveState();

  state.pendingConnectionFrom = null;
  state.isDraggingConnection = false;
  document.removeEventListener('pointermove', handleConnectionMove);
  renderConnections();
}

function setConnectSource(id) {
  state.elements.forEach((item) => item.el.classList.toggle('connect-source', item.id === id));
  state.pendingConnectionFrom = id;
}

function handleConnectClick(id) {
  if (!state.pendingConnectionFrom) {
    setConnectSource(id);
    return;
  }
  if (state.pendingConnectionFrom === id) {
    setConnectSource(null);
    return;
  }
  const added = addConnection(state.pendingConnectionFrom, id);
  setConnectSource(null);
  renderConnections();
  if (added) saveState();
}

/* ---------- Actions ---------- */

function deleteSelected() {
  if (state.selectedConnectionId) {
    state.connections = state.connections.filter((c) => c.id !== state.selectedConnectionId);
    state.selectedConnectionId = null;
    refreshInspector();
    renderConnections();
    saveState();
    emit('diagram:selection');
    return;
  }

  const item = state.selectedId && state.elements.get(state.selectedId);
  if (!item) return;
  const id = item.id;
  removeNodeDom(item);
  state.elements.delete(id);
  state.connections = state.connections.filter((c) => c.from !== id && c.to !== id);
  state.selectedId = null;
  refreshInspector();
  renderConnections();
  updateEmptyState();
  saveState();
  emit('diagram:selection');
}

function clearCanvas() {
  state.elements.forEach(removeNodeDom);
  state.elements.clear();
  state.connections = [];
  state.pendingConnectionFrom = null;
  state.selectedId = null;
  state.selectedConnectionId = null;
  refreshInspector();
  renderConnections();
  updateEmptyState();
}

async function loadTemplate(key) {
  const template = templates[key];
  if (!template) return;

  if (state.elements.size > 0) {
    const ok = await confirmDialog({
      title: 'Replace your diagram?',
      message: 'Loading a template clears the canvas first. You can undo this afterwards.',
      confirmText: 'Load template',
    });
    if (!ok) return;
  }

  clearCanvas();

  // Center the layout in the current canvas.
  const xs = template.elements.map((e) => e.x);
  const ys = template.elements.map((e) => e.y);
  const spanX = Math.max(...xs) - Math.min(...xs) + 150;
  const spanY = Math.max(...ys) - Math.min(...ys) + 90;
  const offsetX = Math.max(12, (canvas.clientWidth - spanX) / 2) - Math.min(...xs);
  const offsetY = Math.max(12, (canvas.clientHeight - spanY) / 2 - 24) - Math.min(...ys);

  const idMap = new Map();
  template.elements.forEach((item) => {
    idMap.set(item.key, createElement({ type: item.type, x: item.x + offsetX, y: item.y + offsetY, label: item.label, silent: true }));
  });
  template.connections.forEach(([fromKey, toKey]) => addConnection(idMap.get(fromKey), idMap.get(toKey)));

  renderConnections();
  saveState();
}

async function requestClear() {
  if (state.elements.size === 0) return;
  const ok = await confirmDialog({
    title: 'Clear the canvas?',
    message: 'This removes every element and connection. You can undo it afterwards.',
    confirmText: 'Clear canvas',
    danger: true,
  });
  if (!ok) return;
  clearCanvas();
  saveState();
}

function setMode(mode) {
  const connect = mode === 'connect';
  state.connectMode = connect;
  appEl.dataset.mode = connect ? 'connect' : 'move';
  moveBtn.classList.toggle('active', !connect);
  moveBtn.setAttribute('aria-checked', String(!connect));
  connectToggle.classList.toggle('active', connect);
  connectToggle.setAttribute('aria-checked', String(connect));
  setConnectSource(null);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('er-theme', theme); } catch (e) { /* storage unavailable */ }
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

/* ---------- Palette drag & click ---------- */

// Near the middle of the canvas, nudged so repeated clicks don't stack exactly.
function centerSpot() {
  const n = state.elements.size % 6;
  return { x: canvas.clientWidth / 2 - 64 + n * 24 - 60, y: canvas.clientHeight / 2 - 28 + n * 24 - 60 };
}

function addFromPalette(type, x, y) {
  const id = createElement({ type, x, y, label: '' });
  renderConnections();
  setSelected(id);
  state.elements.get(id).beginEdit();
}

paletteEl.addEventListener('pointerdown', (event) => {
  const item = event.target.closest('.palette-item');
  if (!item || event.button !== 0) return;
  event.preventDefault();

  const type = item.dataset.type;
  const startX = event.clientX;
  const startY = event.clientY;
  let ghost = null;

  const moveGhost = (e) => {
    if (!ghost && Math.hypot(e.clientX - startX, e.clientY - startY) > 5) {
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = typeLabels[type] || 'Element';
      document.body.appendChild(ghost);
    }
    if (ghost) {
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY + 12}px`;
    }
  };

  const drop = (e) => {
    document.removeEventListener('pointermove', moveGhost);
    ghost?.remove();
    const rect = canvas.getBoundingClientRect();

    if (!ghost) {
      // A plain click adds the element near the middle of the canvas, offset so repeats don't stack.
      const spot = centerSpot();
      addFromPalette(type, spot.x, spot.y);
    } else if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      addFromPalette(type, e.clientX - rect.left - 60, e.clientY - rect.top - 30);
    }
  };

  document.addEventListener('pointermove', moveGhost);
  document.addEventListener('pointerup', drop, { once: true });
});

paletteEl.addEventListener('keydown', (event) => {
  const item = event.target.closest('.palette-item');
  if (!item || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  const spot = centerSpot();
  addFromPalette(item.dataset.type, spot.x, spot.y);
});

/* ---------- Wiring ---------- */

canvas.addEventListener('pointerdown', (event) => {
  if (event.target === canvas || event.target === connectionsSvg) {
    setConnectSource(null);
    setSelected(null);
  }
});

let labelSaveTimer = null;
labelInput.addEventListener('input', (event) => {
  const item = state.selectedId && state.elements.get(state.selectedId);
  if (!item) return;
  item.label = event.target.value;
  item.labelEl.textContent = item.label;
  clearTimeout(labelSaveTimer);
  labelSaveTimer = setTimeout(saveState, 500);
});

labelInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === 'Escape') labelInput.blur();
});

moveBtn.addEventListener('click', () => setMode('move'));
connectToggle.addEventListener('click', () => setMode(state.connectMode ? 'move' : 'connect'));
deleteBtn.addEventListener('click', deleteSelected);
clearBtn.addEventListener('click', requestClear);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => loadTemplate(button.dataset.template));
});

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (isTypingTarget(e.target)) return;

  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    redo();
  } else if (!mod && !e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) {
    if (state.selectedId || state.selectedConnectionId) {
      e.preventDefault();
      deleteSelected();
    }
  } else if (!mod && !e.altKey && e.key.toLowerCase() === 'v') {
    setMode('move');
  } else if (!mod && !e.altKey && e.key.toLowerCase() === 'c') {
    setMode('connect');
  }
});

window.addEventListener('resize', renderConnections);

/* ---------- Public API for the AI assistant ---------- */

window.ERDiagram = {
  typeLabels,
  getSnapshot() {
    return {
      elements: Array.from(state.elements.values()).map((item) => ({
        id: item.id,
        type: item.type,
        typeLabel: typeLabels[item.type] || item.type,
        label: item.label,
        x: Math.round(item.x),
        y: Math.round(item.y),
      })),
      connections: state.connections.map((c) => ({ id: c.id, from: c.from, to: c.to })),
      selectedId: state.selectedId,
      selectedConnectionId: state.selectedConnectionId,
    };
  },
};

/* ---------- Init ---------- */

renderPalette();
setTheme(document.documentElement.dataset.theme || 'light');
setMode('move');
refreshInspector();
updateEmptyState();
saveState();
