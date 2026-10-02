// Automatic layout for Chen-notation ER diagrams. Pure functions, no DOM.
//
// 1. Entities are placed by a force simulation. Each reserves a box for itself plus the fan of
//    attributes around it, and entities that share a relationship are pulled together with a gap
//    wide enough for the relationship diamond. Several starting arrangements are tried and the
//    one with the fewest crossing lines wins.
// 2. Relationships (and ISA triangles) sit at the centroid of the entities they connect.
// 3. Attributes fan out around their owner in its emptiest direction (second ring if crowded).
// 4. A final pass removes any remaining overlaps.
//
// Nodes passed with { pinned: true, x, y } (top-left) never move, so AI edits don't shuffle the
// user's existing work.
(function (root) {
  const CORE = new Set(['entity', 'weak-entity', 'relationship', 'identifying-relationship', 'associative-entity', 'isa']);
  const CONNECTOR = new Set(['relationship', 'identifying-relationship', 'isa']);
  const TAU = Math.PI * 2;

  function sizeOf(type, label) {
    const tw = Math.max(String(label || '').length, 4) * 8.6;
    switch (type) {
      case 'relationship':
      case 'identifying-relationship':
        return { w: Math.max(156, tw + 76), h: 96 };
      case 'associative-entity':
        return { w: Math.max(140, tw + 48), h: 66 };
      case 'weak-entity':
        return { w: Math.max(136, tw + 40), h: 62 };
      case 'isa':
        return { w: 96, h: 84 };
      case 'attribute':
      case 'key-attribute':
      case 'multivalued-attribute':
      case 'derived-attribute':
        return { w: Math.max(120, tw + 50), h: 54 };
      default:
        return { w: Math.max(128, tw + 34), h: 56 };
    }
  }

  function segmentsCross(p1, p2, p3, p4) {
    const d = (a, b, c) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
    const d1 = d(p3, p4, p1);
    const d2 = d(p3, p4, p2);
    const d3 = d(p1, p2, p3);
    const d4 = d(p1, p2, p4);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  function segmentHitsRect(a, b, r) {
    const inside = (p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
    if (inside(a) || inside(b)) return true;
    const c = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    return [0, 1, 2, 3].some((i) => segmentsCross(a, b, c[i], c[(i + 1) % 4]));
  }

  function layout(inputNodes, inputEdges) {
    const nodes = inputNodes.map((n) => {
      const size = n.w && n.h ? { w: n.w, h: n.h } : sizeOf(n.type, n.label);
      return {
        id: n.id, type: n.type, label: n.label, w: size.w, h: size.h,
        pinned: !!n.pinned && n.x != null,
        cx: (n.x || 0) + size.w / 2, cy: (n.y || 0) + size.h / 2,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    const seenEdge = new Set();
    inputEdges.forEach((e) => {
      const key = [e.from, e.to].sort().join('|');
      if (e.from !== e.to && byId.has(e.from) && byId.has(e.to) && !seenEdge.has(key)) {
        seenEdge.add(key);
        adj.get(e.from).push(e.to);
        adj.get(e.to).push(e.from);
      }
    });

    const isCore = (n) => CORE.has(n.type);
    const isConnector = (n) => CONNECTOR.has(n.type);
    const cores = nodes.filter(isCore);
    const entities = cores.filter((n) => !isConnector(n));
    const connectors = cores.filter(isConnector);

    // Attribute ownership: nearest core node, found by BFS through attributes.
    const parent = new Map();
    const seen = new Set(cores.map((c) => c.id));
    const queue = cores.map((c) => c.id);
    for (let i = 0; i < queue.length; i++) {
      for (const nb of adj.get(queue[i])) {
        if (!seen.has(nb)) {
          seen.add(nb);
          parent.set(nb, queue[i]);
          queue.push(nb);
        }
      }
    }
    const kids = new Map(nodes.map((n) => [n.id, []]));
    nodes.forEach((n) => { if (parent.has(n.id)) kids.get(parent.get(n.id)).push(n); });
    const orphans = nodes.filter((n) => !isCore(n) && !parent.has(n.id));

    // ---- Step 1: entities ----
    function fanExtent(owner, list) {
      const avgW = list.reduce((s, k) => s + k.w, 0) / list.length;
      const span = 3.7;
      let remaining = list.length;
      let ring = 0;
      let rx = 0;
      let ry = 0;
      while (remaining > 0) {
        rx = owner.w / 2 + avgW / 2 + 34 + ring * (avgW * 0.55 + 30);
        ry = owner.h / 2 + 27 + 34 + ring * 74;
        const cap = Math.max(2, Math.floor((span * (rx + ry) / 2) / (avgW * 0.82 + 12)));
        remaining -= ring === 0 ? cap : cap + 1;
        ring++;
      }
      return { hw: rx + avgW / 2, hh: ry + 27 };
    }
    const box = new Map();
    cores.forEach((c) => {
      const list = kids.get(c.id);
      if (!list.length) { box.set(c.id, { hw: c.w / 2 + 12, hh: c.h / 2 + 12 }); return; }
      const e = fanExtent(c, list);
      box.set(c.id, { hw: Math.max(c.w / 2 + 12, e.hw * 0.8), hh: Math.max(c.h / 2 + 12, e.hh * 0.8) });
    });

    // Entity-to-entity links, one per relationship pair (n-ary relationships link every pair).
    const entLinks = [];
    const linkSeen = new Set();
    const addLink = (a, b, gap) => {
      const key = [a.id, b.id].sort().join('|');
      if (a === b || linkSeen.has(key)) return;
      linkSeen.add(key);
      entLinks.push({ a, b, gap });
    };
    const entNeighbours = (conn) => adj.get(conn.id).map((id) => byId.get(id)).filter((n) => n && !isConnector(n) && isCore(n));
    connectors.forEach((conn) => {
      const nb = entNeighbours(conn);
      const gap = conn.w + 40 + (kids.get(conn.id).length ? 70 : 0);
      for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) addLink(nb[i], nb[j], gap);
    });
    entities.forEach((e) => {
      entNeighbours(e).forEach((o) => addLink(e, o, 60));
    });

    const free = entities.filter((e) => !e.pinned);
    const pinnedEnt = entities.filter((e) => e.pinned);
    const degree = (e) => entLinks.filter((l) => l.a === e || l.b === e).length;

    // Visit order: breadth-first from the best-connected entity.
    const order = [];
    if (free.length) {
      const visited = new Set();
      const walk = (start) => {
        const q = [start];
        visited.add(start.id);
        for (let i = 0; i < q.length; i++) {
          order.push(q[i]);
          entLinks.filter((l) => l.a === q[i] || l.b === q[i]).map((l) => (l.a === q[i] ? l.b : l.a))
            .forEach((o) => { if (!visited.has(o.id) && !o.pinned) { visited.add(o.id); q.push(o); } });
        }
      };
      [...free].sort((a, b) => degree(b) - degree(a)).forEach((e) => { if (!visited.has(e.id)) walk(e); });
    }

    const connPoint = (conn) => {
      const nb = entNeighbours(conn);
      if (!nb.length) return null;
      return { x: nb.reduce((s, n) => s + n.cx, 0) / nb.length, y: nb.reduce((s, n) => s + n.cy, 0) / nb.length };
    };
    const scoreLayout = () => {
      const segs = [];
      connectors.forEach((conn) => {
        const p = connPoint(conn);
        if (!p) return;
        entNeighbours(conn).forEach((e) => segs.push({ a: p, b: { x: e.cx, y: e.cy }, conn, ent: e }));
      });
      let crossings = 0;
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          if (segs[i].conn === segs[j].conn || segs[i].ent === segs[j].ent) continue;
          if (segmentsCross(segs[i].a, segs[i].b, segs[j].a, segs[j].b)) crossings++;
        }
        entities.forEach((e) => {
          if (e === segs[i].ent) return;
          if (segmentHitsRect(segs[i].a, segs[i].b, { x: e.cx - e.w / 2, y: e.cy - e.h / 2, w: e.w, h: e.h })) crossings += 0.7;
        });
      }
      const length = segs.reduce((s, g) => s + Math.hypot(g.a.x - g.b.x, g.a.y - g.b.y), 0);
      const xs = entities.map((e) => e.cx);
      const ys = entities.map((e) => e.cy);
      const area = (Math.max(...xs) - Math.min(...xs) + 300) * (Math.max(...ys) - Math.min(...ys) + 300);
      return crossings * 1000 + length * 0.2 + area * 0.0008;
    };

    function simulate(attempt) {
      let bx = 0;
      if (pinnedEnt.length) bx = Math.max(...pinnedEnt.map((c) => c.cx + c.w / 2));
      const rot = attempt * 0.97;
      const mirror = attempt % 2 ? -1 : 1;
      const scale = 230 + (attempt % 3) * 40;

      order.forEach((c, i) => {
        const linked = entLinks.filter((l) => l.a === c || l.b === c).map((l) => (l.a === c ? l.b : l.a)).filter((o) => o.pinned);
        if (linked.length) {
          const mx = linked.reduce((s, p) => s + p.cx, 0) / linked.length;
          const my = linked.reduce((s, p) => s + p.cy, 0) / linked.length;
          c.cx = mx + Math.cos(i * 2.4 + rot) * 330;
          c.cy = my + Math.sin(i * 2.4 + rot) * 330;
        } else if (pinnedEnt.length) {
          c.cx = bx + 330 + (i % 3) * 40;
          c.cy = 200 + i * 140;
        } else {
          const r = scale * Math.sqrt(i);
          c.cx = Math.cos(i * 2.39996 * mirror + rot) * r;
          c.cy = Math.sin(i * 2.39996 * mirror + rot) * r;
        }
      });

      const ITER = 650;
      for (let it = 0; it < ITER; it++) {
        const temp = 38 * (1 - it / ITER) + 1.2;
        const fx = new Map(entities.map((c) => [c.id, 0]));
        const fy = new Map(entities.map((c) => [c.id, 0]));
        const push = (a, b, px, py) => {
          fx.set(a.id, fx.get(a.id) + px); fy.set(a.id, fy.get(a.id) + py);
          fx.set(b.id, fx.get(b.id) - px); fy.set(b.id, fy.get(b.id) - py);
        };

        for (let i = 0; i < entities.length; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            const a = entities[i];
            const b = entities[j];
            let dx = a.cx - b.cx;
            let dy = a.cy - b.cy;
            let d = Math.hypot(dx, dy);
            if (d < 1) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
            const f = 22000 / (d * d);
            let px = (dx / d) * f;
            let py = (dy / d) * f;
            const ba = box.get(a.id);
            const bb = box.get(b.id);
            const ox = ba.hw + bb.hw + 24 - Math.abs(dx);
            const oy = ba.hh + bb.hh + 24 - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              if (ox < oy) px += Math.sign(dx || 1) * ox * 0.7;
              else py += Math.sign(dy || 1) * oy * 0.7;
            }
            push(a, b, px, py);
          }
        }
        entLinks.forEach(({ a, b, gap }) => {
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const d = Math.max(1, Math.hypot(dx, dy));
          const ba = box.get(a.id);
          const bb = box.get(b.id);
          const ideal = Math.max(220, (ba.hw + bb.hw) * 0.55 + gap + 20);
          const f = (d - ideal) * 0.07;
          push(a, b, (dx / d) * f, (dy / d) * f);
        });
        const gx = entities.reduce((s, c) => s + c.cx, 0) / entities.length;
        const gy = entities.reduce((s, c) => s + c.cy, 0) / entities.length;
        free.forEach((c) => {
          const ax = fx.get(c.id) - (c.cx - gx) * 0.004;
          const ay = fy.get(c.id) - (c.cy - gy) * 0.004;
          const f = Math.hypot(ax, ay) || 1;
          const step = Math.min(f, temp);
          c.cx += (ax / f) * step;
          c.cy += (ay / f) * step;
        });
      }
    }

    if (free.length) {
      let best = null;
      const attempts = free.length > 2 ? 8 : 1;
      for (let a = 0; a < attempts; a++) {
        simulate(a);
        const score = scoreLayout();
        if (!best || score < best.score) best = { score, pos: free.map((c) => [c.cx, c.cy]) };
      }
      free.forEach((c, i) => { c.cx = best.pos[i][0]; c.cy = best.pos[i][1]; });
    }

    // ---- Step 2: connectors at the centroid of their entities ----
    connectors.filter((c) => !c.pinned).forEach((conn, idx) => {
      const p = connPoint(conn);
      const nb = entNeighbours(conn);
      if (p) {
        conn.cx = p.x;
        conn.cy = p.y;
        if (nb.length === 1) conn.cx += (nb[0].w / 2 + conn.w / 2 + 50) * (idx % 2 ? -1 : 1);
      } else {
        const others = cores.filter((c) => c !== conn);
        conn.cx = (others.length ? Math.max(...others.map((c) => c.cx + c.w / 2)) : 0) + 200;
        conn.cy = idx * 140;
      }
    });
    // Parallel relationships between the same entities would sit on top of each other: fan them out.
    const groups = new Map();
    connectors.filter((c) => !c.pinned).forEach((conn) => {
      const key = entNeighbours(conn).map((e) => e.id).sort().join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(conn);
    });
    groups.forEach((list) => {
      const nb = entNeighbours(list[0]);
      if (list.length < 2 || nb.length < 2) return;
      const ang = Math.atan2(nb[1].cy - nb[0].cy, nb[1].cx - nb[0].cx) + Math.PI / 2;
      list.forEach((conn, i) => {
        const off = (i - (list.length - 1) / 2) * (conn.h + 50);
        conn.cx += Math.cos(ang) * off;
        conn.cy += Math.sin(ang) * off;
      });
    });

    // ---- Step 3: attributes ----
    const norm = (a) => ((a % TAU) + TAU) % TAU;
    function fan(owner) {
      const list = kids.get(owner.id);
      if (!list.length) return;
      const toPlace = list.filter((k) => !k.pinned);
      if (toPlace.length) {
        const occupied = adj.get(owner.id)
          .map((id) => byId.get(id))
          .filter((nb) => nb && !toPlace.includes(nb) && (isCore(nb) || nb.pinned || nb.id === parent.get(owner.id) || nb.placed))
          .map((nb) => norm(Math.atan2(nb.cy - owner.cy, nb.cx - owner.cx)))
          .sort((a, b) => a - b);

        let start = -Math.PI / 2;
        let span = TAU;
        if (occupied.length) {
          let best = -1;
          for (let i = 0; i < occupied.length; i++) {
            const next = i + 1 < occupied.length ? occupied[i + 1] : occupied[0] + TAU;
            if (next - occupied[i] > best) { best = next - occupied[i]; start = occupied[i]; span = best; }
          }
          const margin = Math.min(0.4, span * 0.14);
          start += margin;
          span -= margin * 2;
        }
        const full = span >= TAU - 0.01;
        const avgW = toPlace.reduce((s, k) => s + k.w, 0) / toPlace.length;
        const remaining = toPlace.slice();
        let ring = 0;
        while (remaining.length) {
          const rx = owner.w / 2 + avgW / 2 + 34 + ring * (avgW * 0.55 + 30);
          const ry = owner.h / 2 + 27 + 34 + ring * 74;
          const cap = Math.max(2, Math.floor((span * (rx + ry) / 2) / (avgW * 0.82 + 12)));
          const batch = remaining.splice(0, ring === 0 ? Math.min(cap, remaining.length) : Math.min(cap + 1, remaining.length));
          batch.forEach((k, i) => {
            const t = full ? (i + 0.5 * (ring % 2)) / batch.length : (i + 0.5) / batch.length;
            const ang = start + t * span;
            k.cx = owner.cx + Math.cos(ang) * rx;
            k.cy = owner.cy + Math.sin(ang) * ry;
            k.placed = true;
          });
          ring++;
        }
      }
      list.forEach(fan);
    }
    cores.forEach(fan);

    if (orphans.length) {
      const rest = nodes.filter((n) => !orphans.includes(n));
      const maxY = rest.length ? Math.max(...rest.map((n) => n.cy + n.h / 2)) : 0;
      let x = rest.length ? Math.min(...rest.map((n) => n.cx - n.w / 2)) : 0;
      orphans.filter((o) => !o.pinned).forEach((o) => {
        o.cx = x + o.w / 2;
        o.cy = maxY + 90;
        x += o.w + 24;
      });
    }

    // ---- Step 4: overlap removal ----
    const weight = (n) => (n.pinned ? 0 : isCore(n) ? 0.3 : 0.7);
    for (let pass = 0; pass < 150; pass++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const ox = (a.w + b.w) / 2 + 14 - Math.abs(a.cx - b.cx);
          const oy = (a.h + b.h) / 2 + 14 - Math.abs(a.cy - b.cy);
          if (ox <= 0 || oy <= 0) continue;
          const wa = weight(a);
          const wb = weight(b);
          if (wa + wb === 0) continue;
          const share = wa / (wa + wb);
          if (ox < oy) {
            const dir = a.cx === b.cx ? (i % 2 ? 1 : -1) : Math.sign(a.cx - b.cx);
            a.cx += dir * ox * share;
            b.cx -= dir * ox * (1 - share);
          } else {
            const dir = a.cy === b.cy ? (i % 2 ? 1 : -1) : Math.sign(a.cy - b.cy);
            a.cy += dir * oy * share;
            b.cy -= dir * oy * (1 - share);
          }
          moved = true;
        }
      }
      if (!moved) break;
    }

    let shiftX = 0;
    let shiftY = 0;
    if (!nodes.some((n) => n.pinned)) {
      shiftX = 48 - Math.min(...nodes.map((n) => n.cx - n.w / 2));
      shiftY = 48 - Math.min(...nodes.map((n) => n.cy - n.h / 2));
    }
    const out = new Map();
    nodes.forEach((n) => {
      out.set(n.id, { x: Math.round(n.cx - n.w / 2 + shiftX), y: Math.round(n.cy - n.h / 2 + shiftY), w: n.w, h: n.h });
    });
    return out;
  }

  const api = { layout, sizeOf, CORE_TYPES: CORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ERLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
