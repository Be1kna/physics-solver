document.addEventListener('DOMContentLoaded', function(){
  var form = document.getElementById('kin-form');
  var resetBtn = document.getElementById('reset');
  var back = document.getElementById('back');
  var resultValues = document.getElementById('result-values');
  var explanation = document.getElementById('explanation');

  if (back) back.addEventListener('click', function(){
    if (location.protocol === 'file:'){
      location.href = '../index.html';
    } else {
      location.href = '/physics-solver';
    }
  });

  if (resetBtn) resetBtn.addEventListener('click', function(){
    form.reset();
    resultValues.textContent = 'No results yet.';
    explanation.innerHTML = '<p class="muted">—</p>';
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var inputs = parseInputs();
    var solveResult = solveKinematics(inputs);
    if (solveResult.error){
      resultValues.textContent = 'Error: ' + solveResult.error;
      // render steps (if any) as boxes
      explanation.innerHTML = '';
      if (solveResult.steps && solveResult.steps.length){
        solveResult.steps.forEach(function(s){
          var box = document.createElement('div');
          box.className = 'step-box';
          var pre = document.createElement('pre');
          pre.textContent = s;
          box.appendChild(pre);
          explanation.appendChild(box);
        });
      } else {
        explanation.innerHTML = '<p class="muted">—</p>';
      }
    } else {
      var out = [];
      var units = {V: 'm/s', v: 'm/s', d: 'm', a: 'm/s²', t: 's'};
      ['V','v','d','a','t'].forEach(function(key){
        out.push(key + ': ' + (formatVal(solveResult.values[key])) + ' ' + units[key]);
      });
      resultValues.textContent = out.join('\n');
      // render each step as a styled box
      explanation.innerHTML = '';
      solveResult.steps.forEach(function(s){
        var box = document.createElement('div');
        box.className = 'step-box';
        var pre = document.createElement('pre');
        pre.textContent = s;
        box.appendChild(pre);
        explanation.appendChild(box);
      });
    }
  });

  // Simulation controls
  var simBtn = document.getElementById('simulate');
  var simReset = document.getElementById('sim-reset');
  var canvas = document.getElementById('sim-canvas');
  var simTimeEl = document.getElementById('sim-time');
  var simVelEl = document.getElementById('sim-vel');
  var simDistEl = document.getElementById('sim-dist');
  var simAnim = null;
  var ctx = null;

  // ensure the canvas has a device-pixel-ratio aware backing store
  function resizeCanvas(){
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    // desired CSS size
    var cssW = canvas.clientWidth;
    var cssH = canvas.clientHeight;
    // set internal buffer size
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    ctx = canvas.getContext('2d');
    // scale so 1 unit = 1 CSS pixel in drawing commands
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // make sure canvas resizes on window resize
  window.addEventListener('resize', function(){ resizeCanvas(); if (simAnim==null && ctx) { /* redraw static frame */ ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); } });
  // initial resize
  resizeCanvas();

  function stopSim(){
    if (simAnim) cancelAnimationFrame(simAnim);
    simAnim = null;
  }

  simReset && simReset.addEventListener('click', function(){
    stopSim();
    if (canvas){
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    if (simTimeEl) simTimeEl.textContent = '0.000';
    if (simVelEl) simVelEl.textContent = '0.000';
    if (simDistEl) simDistEl.textContent = '0.000';
  });

  simBtn && simBtn.addEventListener('click', function(){
    // read current inputs (use parsed values, but don't require solver)
    var inputs = parseInputs();
    var v0 = (inputs.v != null) ? inputs.v : 0;
    var a = (inputs.a != null) ? inputs.a : null;
    var targetT = inputs.t; // may be null
    var targetD = inputs.d; // may be null
    // if solveKinematics can produce missing t or d, try that to get better targets
    var solved = null;
    try { solved = solveKinematics(inputs); } catch (e){ solved = null; }
    if (!targetT && solved && solved.values && solved.values.t) targetT = solved.values.t;
    if (!targetD && solved && solved.values && solved.values.d) targetD = solved.values.d;

    // simulation parameters
    var x = 0; // meters
    var v = v0; // m/s
    // prefer explicit input acceleration; otherwise use solver's computed a if available
    var a_local = (a != null) ? a : (solved && solved.values && solved.values.a != null ? solved.values.a : 0);
    var start = null;
    var last = null;
    var finished = false;
    var startX = null;
    var movedAway = false;
    // compute target final velocity if provided
    var targetV = inputs.V != null ? inputs.V : (solved && solved.values && solved.values.V != null ? solved.values.V : null);

    // estimate range of motion (min/max positions) so canvas shows full travel both forward and backward
    var estDist = 0;
    function posAt(t){ return v0*t + 0.5*a_local*t*t; }
    if (targetD != null) estDist = Math.abs(targetD);
    if (targetT != null){
      var atT = Math.abs(posAt(targetT));
      estDist = Math.max(estDist, atT);
      if (a_local !== 0){
        var tPeak = -v0 / a_local;
        if (tPeak > 0 && tPeak < targetT){ estDist = Math.max(estDist, Math.abs(posAt(tPeak))); }
      }
    }
    if (estDist === 0){ if (a_local !== 0) estDist = Math.max(1, Math.abs((v0*v0)/(2*a_local))); else estDist = Math.max(1, Math.abs(v0) * 2); }

    var canvasW = (canvas ? canvas.clientWidth : 760);
    var pad = 24; // CSS pixels
    var usable = canvasW - pad*2;

    // compute min/max positions over relevant times
    var positions = [0];
    if (targetT != null) positions.push(posAt(targetT));
    if (a_local !== 0){ var tPeak2 = -v0 / a_local; if (tPeak2 > 0 && (targetT == null || tPeak2 <= targetT)) positions.push(posAt(tPeak2)); }
    if (targetD != null) positions.push(targetD);
    var minPos = Math.min.apply(null, positions);
    var maxPos = Math.max.apply(null, positions);
    var range = Math.abs(maxPos - minPos);
    if (range < 1e-6) range = estDist;
    var scale = range > 0 ? (usable / range) : 1; // CSS pixels per meter

    var ctx = canvas.getContext('2d');
    // world offset so ball can start at the max positive point (visual right)
    var worldOffset = maxPos;
    var minWorld = minPos + worldOffset;
    var targetD_world = (targetD != null) ? (targetD + worldOffset) : null;
    function drawFrame(){
      // use CSS pixel sizes (ctx is scaled to CSS pixels)
      var w = canvas.clientWidth;
      var h = canvas.clientHeight;
      // clear
      ctx.clearRect(0,0,w,h);
      // draw ground line and object as a circle sitting on it
      var groundY = h - 36; // CSS pixels, fixed baseline
      ctx.strokeStyle = 'rgba(15,23,42,0.12)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pad, groundY);
      ctx.lineTo(pad + usable, groundY);
      ctx.stroke();

      var cx = pad + Math.min(usable, Math.max(0, (x - minWorld) * scale));
      var radius = 18;
      var cy = groundY - radius - 2; // small gap so circle appears on the line
      ctx.beginPath();
      ctx.fillStyle = '#1e40af';
      ctx.arc(cx, cy, radius, 0, Math.PI*2);
      ctx.fill();
    }

    function step(ts){
      if (!start) { start = ts; last = ts; }
      var dt = (ts - last)/1000; // seconds
      last = ts;
      // update velocity then position (semi-implicit Euler) to ensure v changes are visible immediately
      v += a_local*dt;
      x += v*dt;
      var elapsed = (ts - start)/1000;
      // update readouts
      if (simTimeEl) simTimeEl.textContent = (Math.round(elapsed*10000)/10000).toFixed(4);
      if (simVelEl) simVelEl.textContent = (Math.round(v*10000)/10000).toFixed(4);
      if (simDistEl) simDistEl.textContent = (Math.round(x*10000)/10000).toFixed(4);
      // also set title attributes with full precision for inspection
      if (simVelEl) simVelEl.title = String(v);
      if (simDistEl) simDistEl.title = String(x);
      drawFrame();

      // track whether we've moved away from start (so targetD==start isn't considered immediately)
      if (!movedAway && Math.abs(x - startX) > 1e-6) movedAway = true;
      // stopping conditions
      if (targetT != null && elapsed >= targetT) finished = true;
      if (targetD_world != null){
        var delta = targetD_world - startX;
        if (Math.abs(delta) < 1e-9){
          if (movedAway && Math.abs(x - targetD_world) < 1e-3) finished = true;
        } else if (delta > 0){ if (x >= targetD_world) finished = true; }
        else { if (x <= targetD_world) finished = true; }
      }
      if (targetV != null){
        if (targetV >= 0){ if (v >= targetV) finished = true; }
        else { if (v <= targetV) finished = true; }
      }

      if (!finished) simAnim = requestAnimationFrame(step);
      else {
        simAnim = null;
      }
    }

    // start animation
    stopSim();
    // clear canvas and draw initial
    if (canvas){ ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); }
    x = worldOffset; startX = x; v = v0; start = null; last = null; finished = false;
    simAnim = requestAnimationFrame(step);
  });
});

function parseInputs(){
  function getVal(id){
    var el = document.getElementById(id);
    if (!el) return null;
    var v = el.value.trim();
    if (v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  return {
    V: getVal('V'),
    v: getVal('v'),
    d: getVal('d'),
    a: getVal('a'),
    t: getVal('t')
  };
}

function formatVal(x){
  if (x === null || x === undefined) return '—';
  if (Number.isFinite(x)) return (Math.round(x*1000)/1000).toString();
  return String(x);
}

function solveKinematics(initial){
  var vals = {V: initial.V, v: initial.v, d: initial.d, a: initial.a, t: initial.t};
  var steps = [];

  function addDetailedStep(target, formulas, chosenOriginal, rearrangedSymbolic, substitutionNumeric, result){
    var s = '';
    s += 'To find ' + target + ' use one of these formulas:\n';
    formulas.forEach(function(f){ s += '    ' + f + '\n'; });
    s += '\n';
    s += 'Since we do not know the other required values, choose this formula:\n';
    s += '    ' + chosenOriginal + '\n\n';
    if (rearrangedSymbolic) s += 'Reformat the formula:\n    ' + rearrangedSymbolic + '\n\n';
    if (substitutionNumeric) s += 'Substitute in:\n    ' + substitutionNumeric + '\n\n';
    if (result) s += 'Result:\n    ' + result + '\n';
    steps.push(s);
  }

  var knownCount = Object.keys(vals).reduce(function(c,k){ return c + (vals[k] != null ? 1 : 0); }, 0);
  if (knownCount < 3) return {error: 'Need at least 3 known values (V, v, d, a, t).', steps: steps};

  var progress = true;
  while (progress){
    progress = false;

    // Eq1: V = v + a*t
    if (vals.V == null && vals.v != null && vals.a != null && vals.t != null){
      vals.V = vals.v + vals.a * vals.t;
      addDetailedStep('V', ['V = v + a·t', 'V² = v² + 2a·d', 'd = 0.5·(v+V)·t', 'd = V·t - 0.5·a·t²'], 'V = v + a·t', 'V = v + a·t', 'V = ' + formatVal(vals.v) + ' + ' + formatVal(vals.a) + '·' + formatVal(vals.t), formatVal(vals.V) + ' m/s');
      progress = true; continue;
    }
    if (vals.v == null && vals.V != null && vals.a != null && vals.t != null){
      vals.v = vals.V - vals.a * vals.t;
      addDetailedStep('v', ['V = v + a·t', 'V² = v² + 2a·d', 'd = 0.5·(v+V)·t', 'd = V·t - 0.5·a·t²'], 'V = v + a·t', 'v = V - a·t', 'v = ' + formatVal(vals.V) + ' - ' + formatVal(vals.a) + '·' + formatVal(vals.t), formatVal(vals.v) + ' m/s');
      progress = true; continue;
    }
    if (vals.a == null && vals.V != null && vals.v != null && vals.t != null){
      if (vals.t === 0){ steps.push('Cannot compute a from (V-v)/t: t = 0'); }
      else { vals.a = (vals.V - vals.v)/vals.t; addDetailedStep('a', ['V = v + a·t', 'd = v·t + 0.5·a·t²', 'V² = v² + 2a·d', 'd = V·t - 0.5·a·t²'], 'V = v + a·t', 'a = (V - v)/t', 'a = ('+formatVal(vals.V)+' - '+formatVal(vals.v)+')/'+formatVal(vals.t), formatVal(vals.a) + ' m/s²'); progress = true; continue; }
    }
    if (vals.t == null && vals.V != null && vals.v != null && vals.a != null){
      if (vals.a === 0){ steps.push('Cannot compute t from (V-v)/a: a = 0'); }
      else { vals.t = (vals.V - vals.v)/vals.a; addDetailedStep('t', ['V = v + a·t', 'd = v·t + 0.5·a·t²', 'V² = v² + 2a·d', 'd = 0.5·(v+V)·t'], 'V = v + a·t', 't = (V - v)/a', 't = ('+formatVal(vals.V)+' - '+formatVal(vals.v)+')/'+formatVal(vals.a), formatVal(vals.t) + ' s'); progress = true; continue; }
    }

    // Eq2: d = v*t + 0.5*a*t^2
    if (vals.d == null && vals.v != null && vals.a != null && vals.t != null){
      vals.d = vals.v*vals.t + 0.5*vals.a*vals.t*vals.t;
      addDetailedStep('Δd', ['V = v + a·t', 'Δd = v·t + 0.5·a·t²', 'V² = v² + 2a·Δd', 'Δd = 0.5·(v+V)·t'], 'Δd = v·t + 0.5·a·t²', 'Δd = v·t + 0.5·a·t²', 'Δd = '+formatVal(vals.v)+'·'+formatVal(vals.t)+' + 0.5·'+formatVal(vals.a)+'·'+formatVal(vals.t)+'²', formatVal(vals.d) + ' m');
      progress = true; continue;
    }
    if (vals.a == null && vals.d != null && vals.v != null && vals.t != null){
      if (vals.t === 0){ steps.push('Cannot compute a from d = v·t + 0.5·a·t²: t = 0'); }
      else { vals.a = 2*(vals.d - vals.v*vals.t)/(vals.t*vals.t); addDetailedStep('a', ['V = v + a·t', 'Δd = v·t + 0.5·a·t²', 'V² = v² + 2a·Δd', 'Δd = 0.5·(v+V)·t'], 'Δd = v·t + 0.5·a·t²', 'a = 2(Δd - v·t)/t²', 'a = 2('+formatVal(vals.d)+' - '+formatVal(vals.v)+'·'+formatVal(vals.t)+')/'+formatVal(vals.t)+'²', formatVal(vals.a) + ' m/s²'); progress = true; continue; }
    }
    if (vals.v == null && vals.d != null && vals.a != null && vals.t != null){
      if (vals.t === 0){ steps.push('Cannot compute v from d = v·t + 0.5·a·t²: t = 0'); }
      else { vals.v = (vals.d - 0.5*vals.a*vals.t*vals.t)/vals.t; addDetailedStep('v', ['V = v + a·t', 'Δd = v·t + 0.5·a·t²', 'V² = v² + 2a·Δd', 'Δd = 0.5·(v+V)·t'], 'Δd = v·t + 0.5·a·t²', 'v = (Δd - 0.5·a·t²)/t', 'v = ('+formatVal(vals.d)+' - 0.5·'+formatVal(vals.a)+'·'+formatVal(vals.t)+'²)/'+formatVal(vals.t), formatVal(vals.v) + ' m/s'); progress = true; continue; }
    }
    if (vals.t == null && vals.d != null && vals.v != null && vals.a != null){
      // quadratic: 0.5*a*t^2 + v*t - d = 0
      var A = 0.5*vals.a, B = vals.v, C = -vals.d;
      var disc = B*B - 4*A*C;
      if (Math.abs(A) < 1e-12){
        if (B === 0){ steps.push('Cannot solve for t: both a and v are zero'); }
        else { vals.t = -C/B; steps.push('Linear solve for t: t = d/v = '+formatVal(vals.t)); progress = true; continue; }
      }
      if (disc < 0){ addDetailedStep('t', ['Δd = v·t + 0.5·a·t²', 'V = v + a·t', 'Δd = 0.5·(v+V)·t'], 'quadratic formula', null, 'No real solution for t (discriminant < 0)'); }
      else {
        var r1 = (-B + Math.sqrt(disc))/(2*A);
        var r2 = (-B - Math.sqrt(disc))/(2*A);
        // prefer positive root
        var chosen = null;
        if (r1 >= 0 && r2 >= 0) chosen = Math.min(r1,r2);
        else if (r1 >= 0) chosen = r1;
        else if (r2 >= 0) chosen = r2;
        else chosen = r1; // fallback
        vals.t = chosen;
        var sub = 'Equation: 0.5·a·t² + v·t - d = 0\n';
        sub += 'A = ' + A + ', B = ' + B + ', C = ' + C + '\n';
        sub += 'Discriminant = B² - 4AC = ' + disc + '\n';
        sub += 'Roots: t = (-B ± √disc)/(2A) = ' + formatVal(r1) + ', ' + formatVal(r2);
        addDetailedStep('t', ['Δd = v·t + 0.5·a·t²', 'V = v + a·t', 'Δd = 0.5·(v+V)·t'], 'Solve quadratic 0.5·a·t² + v·t - d = 0', sub, 'Chosen t = ' + formatVal(vals.t) + ' s');
        progress = true; continue;
      }
    }

    // Eq3: V^2 = v^2 + 2*a*d
    if (vals.V == null && vals.v != null && vals.a != null && vals.d != null){
      var inside = vals.v*vals.v + 2*vals.a*vals.d;
      if (inside < 0){ addDetailedStep('V', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = 0.5·(v+V)·t'], 'V² = v² + 2a·d', null, 'No real V (negative inside of sqrt)'); }
      else { vals.V = Math.sqrt(inside); if (vals.v < 0) vals.V = -vals.V; addDetailedStep('V', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = 0.5·(v+V)·t'], 'V² = v² + 2a·d', 'V = ±√(v² + 2a·d)', 'V = √('+formatVal(vals.v)+'² + 2·'+formatVal(vals.a)+'·'+formatVal(vals.d)+')', formatVal(vals.V) + ' m/s'); progress = true; continue; }
    }
    if (vals.v == null && vals.V != null && vals.a != null && vals.d != null){
      var inside2 = vals.V*vals.V - 2*vals.a*vals.d;
      if (inside2 < 0){
        addDetailedStep('v', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = 0.5·(v+V)·t'], 'V² = v² + 2a·d', null, 'No real v (negative inside of sqrt)');
      } else {
        vals.v = Math.sqrt(inside2); if (vals.V < 0) vals.v = -vals.v; addDetailedStep('v', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = 0.5·(v+V)·t'], 'V² = v² + 2a·d', 'v = ±√(V² - 2a·d)', 'v = √('+formatVal(vals.V)+'² - 2·'+formatVal(vals.a)+'·'+formatVal(vals.d)+')', formatVal(vals.v) + ' m/s'); progress = true; continue;
      }
    }
    if (vals.a == null && vals.V != null && vals.v != null && vals.d != null){
      if (vals.d === 0){ steps.push('Cannot compute a from (V² - v²)/(2d): d = 0'); }
      else { vals.a = (vals.V*vals.V - vals.v*vals.v)/(2*vals.d); addDetailedStep('a', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = v·t + 0.5·a·t²'], 'V² = v² + 2a·d', 'a = (V² - v²)/(2·d)', 'a = ('+formatVal(vals.V)+'² - '+formatVal(vals.v)+'²) / (2·'+formatVal(vals.d)+')', formatVal(vals.a) + ' m/s²'); progress = true; continue; }
    }
    if (vals.d == null && vals.V != null && vals.v != null && vals.a != null){
      if (vals.a === 0){ steps.push('Cannot compute d from (V² - v²)/(2a): a = 0'); }
      else { vals.d = (vals.V*vals.V - vals.v*vals.v)/(2*vals.a); addDetailedStep('Δd', ['V = v + a·t', 'V² = v² + 2a·d', 'Δd = 0.5·(v+V)·t'], 'V² = v² + 2a·d', 'd = (V² - v²)/(2·a)', 'd = ('+formatVal(vals.V)+'² - '+formatVal(vals.v)+'²) / (2·'+formatVal(vals.a)+')', formatVal(vals.d) + ' m'); progress = true; continue; }
    }

    // Eq4: d = 0.5*(v + V)*t
    if (vals.d == null && vals.v != null && vals.V != null && vals.t != null){
      vals.d = 0.5*(vals.v + vals.V)*vals.t; addDetailedStep('Δd', ['V = v + a·t', 'Δd = 0.5·(v+V)·t', 'Δd = v·t + 0.5·a·t²', 'd = V·t - 0.5·a·t²'], 'Δd = 0.5·(v+V)·t', 'Δd = 0.5·(v+V)·t', 'Δd = 0.5·('+formatVal(vals.v)+' + '+formatVal(vals.V)+')·'+formatVal(vals.t), formatVal(vals.d) + ' m'); progress = true; continue;
    }
    if (vals.V == null && vals.d != null && vals.v != null && vals.t != null){
      vals.V = (2*vals.d/vals.t) - vals.v; addDetailedStep('V', ['V = v + a·t', 'Δd = 0.5·(v+V)·t', 'V² = v² + 2a·d', 'Δd = V·t - 0.5·a·t²'], 'Δd = 0.5·(v+V)·t', 'V = (2·Δd/t) - v', 'V = (2·'+formatVal(vals.d)+'/'+formatVal(vals.t)+') - '+formatVal(vals.v), formatVal(vals.V) + ' m/s'); progress = true; continue;
    }
    if (vals.v == null && vals.d != null && vals.V != null && vals.t != null){
      vals.v = (2*vals.d/vals.t) - vals.V; addDetailedStep('v', ['V = v + a·t', 'Δd = 0.5·(v+V)·t', 'V² = v² + 2a·d', 'Δd = V·t - 0.5·a·t²'], 'Δd = 0.5·(v+V)·t', 'v = (2·Δd/t) - V', 'v = (2·'+formatVal(vals.d)+'/'+formatVal(vals.t)+') - '+formatVal(vals.V), formatVal(vals.v) + ' m/s'); progress = true; continue;
    }
    if (vals.t == null && vals.d != null && vals.v != null && vals.V != null){
      if ((vals.v + vals.V) === 0){ steps.push('Cannot compute t from d = 0.5·(v+V)·t: v+V = 0'); }
      else { vals.t = (2*vals.d)/(vals.v + vals.V); addDetailedStep('t', ['Δd = 0.5·(v+V)·t', 'Δd = v·t + 0.5·a·t²', 'V = v + a·t'], 'Δd = 0.5·(v+V)·t', 't = 2·Δd/(v+V)', 't = 2·'+formatVal(vals.d)+' / ('+formatVal(vals.v)+' + '+formatVal(vals.V)+')', formatVal(vals.t) + ' s'); progress = true; continue; }
    }

    // no more progress
  }

  var missing = Object.keys(vals).filter(function(k){ return vals[k] == null; });
  if (missing.length > 0) return {error: 'Could not determine all missing values. Provide different combination of knowns or check for inconsistent inputs.', steps: steps};

  return {values: vals, steps: steps};
}
