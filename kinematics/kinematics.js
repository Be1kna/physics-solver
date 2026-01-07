document.addEventListener('DOMContentLoaded', function(){
  // Elements
  var form = document.getElementById('kin-form');
  var resetBtn = document.getElementById('reset');
  var back = document.getElementById('back');
  var resultValues = document.getElementById('result-values');
  var explanation = document.getElementById('explanation');
  var variantSelect = document.getElementById('variant-select');
  var variantLabel = document.querySelector('label[for="variant-select"]');
  var simBtn = document.getElementById('simulate');
  var simReset = document.getElementById('sim-reset');
  var canvas = document.getElementById('sim-canvas');
  var simTimeEl = document.getElementById('sim-time');
  var simVelEl = document.getElementById('sim-vel');
  var simDistEl = document.getElementById('sim-dist');
  var showFormBtn = document.getElementById('show-formulas');
  var formulaModal = document.getElementById('formula-modal');
  var closeFormBtn = null; // will query after modal exists

  var latestSolve = null; // store last solver result

  // hide variant UI until needed
  if (variantSelect) variantSelect.style.display = 'none';
  if (variantLabel) variantLabel.style.display = 'none';

  // small helpers
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

  function addStepBox(text){
    explanation.appendChild((function(){
      var box = document.createElement('div'); box.className = 'step-box';
      var pre = document.createElement('pre'); pre.textContent = text;
      box.appendChild(pre);
      return box;
    })());
  }

  // Build a standardized multi-line step description for display and recording
  function makeStepText(actionDesc, equation, reformatted, substituted, result){
    var lines = [];
    lines.push('To ' + actionDesc + ' you can use this formula based on given values:');
    lines.push('    ' + equation);
    lines.push('Reformat the formula:');
    lines.push('    ' + reformatted);
    lines.push('Substitute in:');
    lines.push('    ' + substituted);
    lines.push('Result:');
    lines.push('    ' + result);
    return lines.join('\n');
  }

  // Deterministic solver extracted for reuse: mutates `vals` and records steps into the provided `steps` array.
  function deterministicSolve(vals, steps){
    var changed = true;
    while (changed){
      changed = false;
      // Find initial velocity v
      if (vals.v == null){
        //V = v + at - find v from V, a, t
        if (vals.V != null && vals.a != null && vals.t != null){
          vals.v = vals.V - vals.a*vals.t;
          steps.push(makeStepText('find initial velocity', 'V = v + a·t', 'v = V - a·t', 'v = ' + formatVal(vals.V) + ' - ' + formatVal(vals.a) + '·' + formatVal(vals.t), 'v = ' + formatVal(vals.v) + ' m/s'));
          changed = true; continue;
        }
        // Δd = 0.5 (v+V) t - find v from d, V, t
        if (vals.d != null && vals.V != null && vals.t != null){
          vals.v = (2*vals.d/vals.t) - vals.V;
          steps.push(makeStepText('find initial velocity', 'Δd = 0.5·(v+V)·t', 'v = (2Δd/t) - V', 'v = (2*' + formatVal(vals.d) + '/' + formatVal(vals.t) + ') - ' + formatVal(vals.V), 'v = ' + formatVal(vals.v) + ' m/s'));
          changed = true; continue;
        }
        // Δd = v t + 0.5 a t^2 - find v from d, a, t
        if (vals.d != null && vals.a != null && vals.t != null && Math.abs(vals.t) > 1e-12){
          vals.v = (vals.d - 0.5*vals.a*vals.t*vals.t)/vals.t;
          steps.push(makeStepText('find initial velocity', 'Δd = v·t + 0.5·a·t²', 'v = (Δd - 0.5·a·t²)/t', 'v = (' + formatVal(vals.d) + ' - 0.5·' + formatVal(vals.a) + '·' + formatVal(vals.t) + '²)/' + formatVal(vals.t), 'v = ' + formatVal(vals.v) + ' m/s'));
          changed = true; continue;}  }
      // Find final velocity V
      if (vals.V == null){
        // V = v + a t - find V from v, a, t
        if (vals.v != null && vals.a != null && vals.t != null){
          vals.V = vals.v + vals.a*vals.t;
          steps.push(makeStepText('find final velocity', 'V = v + a·t', 'V = v + a·t', 'V = ' + formatVal(vals.v) + ' + ' + formatVal(vals.a) + '·' + formatVal(vals.t), 'V = ' + formatVal(vals.V) + ' m/s'));
          changed = true; continue;
        }
        // Δd = 0.5 (v+V) t - find V from d, v, t
        if (vals.d != null && vals.v != null && vals.t != null){
          vals.V = (2*vals.d/vals.t) - vals.v;
          steps.push(makeStepText('find final velocity', 'Δd = 0.5·(v+V)·t', 'V = (2Δd/t) - v', 'V = (2*' + formatVal(vals.d) + '/' + formatVal(vals.t) + ') - ' + formatVal(vals.v), 'V = ' + formatVal(vals.V) + ' m/s'));
          changed = true; continue;
        }
        //Δd = Vt - 0.5 at² - find V from d, a, t
        if (vals.d != null && vals.a != null && vals.t != null){
          vals.V = (vals.d + 0.5*vals.a*vals.t*vals.t)/vals.t;
          steps.push(makeStepText('find final velocity', 'Δd = V·t - 0.5·a·t²', 'V = (Δd + 0.5·a·t²)/t', 'V = (' + formatVal(vals.d) + ' + 0.5·' + formatVal(vals.a) + '·' + formatVal(vals.t) + '²)/' + formatVal(vals.t), 'V = ' + formatVal(vals.V) + ' m/s'));
          changed = true; continue;
        }
      }
      // Find distance d
      if (vals.d == null){
        // V² = v² + 2aΔd - find d from V, v, a
        if (vals.V != null && vals.v != null && vals.a != null && Math.abs(vals.a) > 1e-12){
          vals.d = (vals.V*vals.V - vals.v*vals.v)/(2*vals.a);
          steps.push(makeStepText('find distance', 'V² = v² + 2·a·Δd', 'Δd = (V² - v²)/(2·a)', 'Δd = (' + formatVal(vals.V) + '² - ' + formatVal(vals.v) + '²)/(2*' + formatVal(vals.a) + ')', 'Δd = ' + formatVal(vals.d) + ' m'));
          changed = true; continue;
        }
        // Δd = 0.5 (v+V) t - find d from v, V, t
        if (vals.v != null && vals.V != null && vals.t != null){
          vals.d = 0.5*(vals.v + vals.V)*vals.t;
          steps.push(makeStepText('find distance', 'Δd = 0.5·(v+V)·t', 'Δd = 0.5·(v+V)·t', 'Δd = 0.5·(' + formatVal(vals.v) + ' + ' + formatVal(vals.V) + ')·' + formatVal(vals.t), 'Δd = ' + formatVal(vals.d) + ' m'));
          changed = true; continue;
        }
        // Δd = v t + 0.5 a t^2 - find d from v, a, t
        if (vals.v != null && vals.a != null && vals.t != null){
          vals.d = vals.v*vals.t + 0.5*vals.a*vals.t*vals.t;
          steps.push(makeStepText('find distance', 'Δd = v·t + 0.5·a·t²', 'Δd = v·t + 0.5·a·t²', 'Δd = ' + formatVal(vals.v) + '·' + formatVal(vals.t) + ' + 0.5·' + formatVal(vals.a) + '·' + formatVal(vals.t) + '²', 'Δd = ' + formatVal(vals.d) + ' m'));
          changed = true; continue;
        }
        // Δd = V t - 0.5 a t^2 - find d from V, a, t
        if (vals.V != null && vals.t != null && vals.a != null){
          vals.d = vals.V*vals.t - 0.5*vals.a*vals.t*vals.t;
          steps.push(makeStepText('find distance', 'Δd = V·t - 0.5·a·t²', 'Δd = V·t - 0.5·a·t²', 'Δd = ' + formatVal(vals.V) + '·' + formatVal(vals.t) + ' - 0.5·' + formatVal(vals.a) + '·' + formatVal(vals.t) + '²', 'Δd = ' + formatVal(vals.d) + ' m'));
          changed = true; continue;
        }
      }
      // Find acceleration a
      if (vals.a == null){
        // V = v + at - find a from V, v, t
        if (vals.V != null && vals.v != null && vals.t != null && Math.abs(vals.t) > 1e-12){
          vals.a = (vals.V - vals.v)/vals.t;
          steps.push(makeStepText('find acceleration', 'V = v + a·t', 'a = (V - v)/t', 'a = (' + formatVal(vals.V) + ' - ' + formatVal(vals.v) + ')/' + formatVal(vals.t), 'a = ' + formatVal(vals.a) + ' m/s²'));
          changed = true; continue;
        }
        // V² = v² + 2aΔd - find a from V, v, d
        if (vals.a == null && vals.V != null && vals.v != null && vals.d != null && Math.abs(vals.d) > 1e-12){
          vals.a = (vals.V*vals.V - vals.v*vals.v) / (2*vals.d);
          steps.push(makeStepText('find acceleration', 'V² = v² + 2·a·Δd', 'a = (V² - v²)/(2·Δd)', 'a = (' + formatVal(vals.V) + '² - ' + formatVal(vals.v) + '²)/(2*' + formatVal(vals.d) + ')', 'a = ' + formatVal(vals.a) + ' m/s²'));
          changed = true; continue;
        }
        // Δd = vt + 0.5 at² - find a from d, v, t
        if (vals.d != null && vals.v != null && vals.t != null && Math.abs(vals.t) > 1e-12){
          vals.a = (2*(vals.d - vals.v*vals.t))/(vals.t*vals.t);
          steps.push(makeStepText('find acceleration', 'Δd = v·t + 0.5·a·t²', 'a = 2(Δd - v·t)/t²', 'a = 2(' + formatVal(vals.d) + ' - ' + formatVal(vals.v) + '·' + formatVal(vals.t) + ')/' + formatVal(vals.t) + '²', 'a = ' + formatVal(vals.a) + ' m/s²'));
          changed = true; continue;
        }
        //Δd = Vt - 0.5 at² - find a from d, V, t
        if (vals.d != null && vals.V != null && vals.t != null && Math.abs(vals.t) > 1e-12){
          vals.a = (2*(vals.V*vals.t - vals.d))/(vals.t*vals.t);
          steps.push(makeStepText('find acceleration', 'Δd = V·t - 0.5·a·t²', 'a = 2(V·t - Δd)/t²', 'a = 2(' + formatVal(vals.V) + '·' + formatVal(vals.t) + ' - ' + formatVal(vals.d) + ')/' + formatVal(vals.t) + '²', 'a = ' + formatVal(vals.a) + ' m/s²'));
          changed = true; continue;}
      }
      //Find t
      if (vals.t == null){
        //V = v + at - find t from V, v, a
        if (vals.V != null && vals.v != null && vals.a != null && Math.abs(vals.a) > 1e-12){
          vals.t = (vals.V - vals.v)/vals.a;
          steps.push(makeStepText('find time', 'V = v + at', 't = (V - v)/a', 't = (' + formatVal(vals.V) + ' - ' + formatVal(vals.v) + ')/' + formatVal(vals.a), 't = ' + formatVal(vals.t) + ' s'));
          changed = true; continue;
        }
        // Δd = 0.5 (v+V) t - find t from d, v, V
        if (vals.d != null && vals.v != null && vals.V != null && (Math.abs(vals.v + vals.V) > 1e-12)){
          vals.t = (2*vals.d)/(vals.v + vals.V);
          steps.push(makeStepText('find time', 'Δd = (1/2)(v+V)t', 't = 2Δd/(v+V)', 't = (2*' + formatVal(vals.d) + ')/(' + formatVal(vals.v) + ' + ' + formatVal(vals.V) + ')', 't = ' + formatVal(vals.t) + ' s'));
          changed = true; continue;}
      }
    }
  }

  // choose automatic variant index: prefer positive t and largest t
  function pickAutoIndex(vars){
    if (!vars || !vars.length) return 0;
    var eps = 1e-9;
    var pos = vars.map(function(v,i){ return {v:v,i:i}; }).filter(function(x){ return Number.isFinite(x.v.t) && x.v.t > eps; });
    if (pos.length){ pos.sort(function(a,b){ return b.v.t - a.v.t; }); return pos[0].i; }
    var withT = vars.map(function(v,i){ return {v:v,i:i}; }).filter(function(x){ return Number.isFinite(x.v.t); });
    if (withT.length){ withT.sort(function(a,b){ return Math.abs(b.v.t) - Math.abs(a.v.t); }); return withT[0].i; }
    return 0;
  }

  // Main solver following the rules
  function solveKinematics(initial){
    // initial: {V,v,d,a,t} values or null
    var vals = {V: initial.V, v: initial.v, d: initial.d, a: initial.a, t: initial.t};
    var steps = [];

    var knownCount = Object.keys(vals).reduce(function(c,k){ return c + (vals[k] != null ? 1 : 0); }, 0);
    if (knownCount < 3) return {error: 'Need at least 3 known values (V, v, d, a, t).', steps: []};

    // Variants case per spec: if missing (v or V) AND missing t -> produce ± roots from V² = v² + 2 a d
    var variants = [];
    var needVariantCase = ((initial.V == null || initial.v == null) && initial.t == null);
    if (needVariantCase && vals.a != null && vals.d != null && (vals.v != null || vals.V != null)){
      // handle both situations: V missing (v known) OR v missing (V known)
      if (vals.v != null){
        var inside = vals.v*vals.v + 2*vals.a*vals.d;
        if (inside < 0){ return {error: 'No real roots for V from V² = v² + 2aΔd', steps: []}; }
        var r = Math.sqrt(inside);
        [r, -r].forEach(function(root){
          var copy = {V: vals.V, v: vals.v, d: vals.d, a: vals.a, t: vals.t};
          if (initial.V == null) copy.V = root;
          var tCandidate = null;
          if (Math.abs(copy.a) > 1e-12 && copy.V != null && copy.v != null) tCandidate = (copy.V - copy.v)/copy.a;
          else if (copy.d != null && copy.v != null && copy.V != null && Math.abs(copy.v + copy.V) > 1e-12) tCandidate = (2*copy.d)/(copy.v + copy.V);
          var tStep = '';
          if (tCandidate != null){
            var tEq, tReform, tSub;
            if (Math.abs(copy.a) > 1e-12 && copy.V != null && copy.v != null){
              tEq = 'V = v + at';
              tReform = 't = (V - v)/a';
              tSub = 't = (' + formatVal(copy.V) + ' - ' + formatVal(copy.v) + ')/' + formatVal(copy.a);
            } else {
              tEq = 't = 2Δd/(v+V)';
              tReform = 't = 2Δd/(v+V)';
              tSub = 't = (2*' + formatVal(copy.d) + ')/(' + formatVal(copy.v) + ' + ' + formatVal(copy.V) + ')';
            }
            tStep = makeStepText('find time', tEq, tReform, tSub, 't = ' + formatVal(tCandidate) + ' s');
          }
          // use makeStepText but show ± in reformatted and actual signed root in substituted/result
          var eq = 'V² = v² + 2·a·Δd'; //find V from v, a, d
          var reform = 'V = ±√(v² + 2·a·Δd)';
          var substituted = 'V = ±√(' + formatVal(vals.v) + '² + 2·' + formatVal(vals.a) + '·' + formatVal(vals.d) + ') = ' + (root>=0?'+':'') + formatVal(root) + ' m/s';
          var stepText = makeStepText('find final velocity', eq, reform, substituted, 'V = ' + formatVal(root) + ' m/s');
          variants.push({V: (initial.V==null?root:vals.V), v: (initial.v==null?root:vals.v), t: Number.isFinite(tCandidate)?tCandidate:null, explanation: stepText, stepsV: stepText, stepsT: (tStep? tStep : '')});
        });
        return {values: vals, steps: [], variants: variants};
      }
      // else vals.V != null and v missing -> solve for v
      var inside2 = vals.V*vals.V - 2*vals.a*vals.d;
      if (inside2 < 0){ return {error: 'No real roots for v from V² = v² + 2aΔd', steps: []}; }
      var r2 = Math.sqrt(inside2);
      [r2, -r2].forEach(function(root){
        var copy = {V: vals.V, v: vals.v, d: vals.d, a: vals.a, t: vals.t};
        if (initial.v == null) copy.v = root;
        var tCandidate = null;
        if (Math.abs(copy.a) > 1e-12 && copy.V != null && copy.v != null) tCandidate = (copy.V - copy.v)/copy.a;
        else if (copy.d != null && copy.v != null && copy.V != null && Math.abs(copy.v + copy.V) > 1e-12) tCandidate = (2*copy.d)/(copy.v + copy.V);
        var tStep2 = '';
        if (tCandidate != null){
          var tEq2, tReform2, tSub2;
          if (Math.abs(copy.a) > 1e-12 && copy.V != null && copy.v != null){
            tEq2 = 'V = v + at';
            tReform2 = 't = (V - v)/a';
            tSub2 = 't = (' + formatVal(copy.V) + ' - ' + formatVal(copy.v) + ')/' + formatVal(copy.a);
          } else {
            tEq2 = 'Δd = (1/2)(v+V)t';
            tReform2 = 't = 2Δd/(v+V)';
            tSub2 = 't = (2*' + formatVal(copy.d) + ')/(' + formatVal(copy.v) + ' + ' + formatVal(copy.V) + ')';
          }
          tStep2 = makeStepText('find time', tEq2, tReform2, tSub2, 't = ' + formatVal(tCandidate) + ' s');
        }
        var eq2 = 'V² = v² + 2·a·Δd'; //find v from V, a, d
        var reform2 = 'v = ±√(V² - 2·a·Δd)';
        var substituted2 = 'v = ±√(' + formatVal(vals.V) + '² - 2·' + formatVal(vals.a) + '·' + formatVal(vals.d) + ') = ' + (root>=0?'+':'') + formatVal(root) + ' m/s';
        var stepText2 = makeStepText('find initial velocity', eq2, reform2, substituted2, 'v = ' + formatVal(root) + ' m/s');
        variants.push({V: (initial.V==null?root:vals.V), v: (initial.v==null?root:vals.v), t: Number.isFinite(tCandidate)?tCandidate:null, explanation: stepText2, stepsV: stepText2, stepsT: (tStep2? tStep2 : '')});
      });
      return {values: vals, steps: [], variants: variants};
    }
    // otherwise run deterministic solver to fill the remaining two values
    deterministicSolve(vals, steps);

    // after deterministic attempt, check if all resolved
    var missing = Object.keys(vals).filter(function(k){ return vals[k] == null; });
    if (missing.length > 0) return {error: 'Could not determine all missing values. Provide a different combination of knowns or check inputs.', steps: steps};

    return {values: vals, steps: steps, variants: []};
  }

  // Render result helper
  function renderSolve(solveResult){
    explanation.innerHTML = '';
    if (solveResult.error){
      resultValues.textContent = 'Error: ' + solveResult.error;
      (solveResult.steps||[]).forEach(function(s){ addStepBox(s); });
      return;
    }
    latestSolve = solveResult;
    var units = {V: 'm/s', v: 'm/s', d: 'm', a: 'm/s²', t: 's'};
    if (solveResult.variants && solveResult.variants.length){
      // populate select and show label
      if (variantSelect){
        variantSelect.innerHTML = '';
        variantSelect.style.display = '';
        if (variantLabel) variantLabel.style.display = '';
        var opt = document.createElement('option'); opt.value = 'auto'; opt.textContent = 'Auto (pick variant with longest t)'; variantSelect.appendChild(opt);
        solveResult.variants.forEach(function(vv, idx){
          var o = document.createElement('option');
          o.value = String(idx);
          // determine which variable is the variant (V or v)
          var varName = 'V';
          if (solveResult.values){
            if (solveResult.values.V == null && solveResult.values.v != null) varName = 'V';
            else if (solveResult.values.v == null && solveResult.values.V != null) varName = 'v';
            else if (vv.V !== solveResult.values.V) varName = 'V';
            else if (vv.v !== solveResult.values.v) varName = 'v';
          }
          var displayVal = (varName === 'V') ? formatVal(vv.V) : formatVal(vv.v);
          o.textContent = 'Variant ' + (idx+1) + ': ' + varName + ' = ' + displayVal;
          variantSelect.appendChild(o);
        });
      }
      var chosenIdx = pickAutoIndex(solveResult.variants);
      var chosen = solveResult.variants[chosenIdx];
      // merge chosen variant into latestSolve.values so the chosen root becomes the canonical values
      latestSolve.values = latestSolve.values || {};
      latestSolve.values.V = (chosen.V != null) ? chosen.V : latestSolve.values.V;
      latestSolve.values.v = (chosen.v != null) ? chosen.v : latestSolve.values.v;
      latestSolve.values.t = (chosen.t != null) ? chosen.t : latestSolve.values.t;
      resultValues.textContent = ['V: ' + formatVal(chosen.V) + ' ' + units.V, 'v: ' + formatVal(chosen.v) + ' ' + units.v, 'd: ' + formatVal(solveResult.values.d) + ' ' + units.d, 'a: ' + formatVal(solveResult.values.a) + ' ' + units.a, 't: ' + (chosen.t!=null?formatVal(chosen.t):formatVal(solveResult.values.t)) + ' ' + units.t].join('\n');
      addStepBox(chosen.stepsV || chosen.explanation || '—');
      if (chosen.stepsT && chosen.stepsT.trim() !== '') addStepBox(chosen.stepsT);
    } else {
      // no variants -> hide variant UI, show values and deterministic steps
      if (variantSelect){ variantSelect.innerHTML = ''; variantSelect.style.display = 'none'; }
      if (variantLabel) variantLabel.style.display = 'none';
      resultValues.textContent = ['V: ' + formatVal(solveResult.values.V) + ' ' + units.V, 'v: ' + formatVal(solveResult.values.v) + ' ' + units.v, 'd: ' + formatVal(solveResult.values.d) + ' ' + units.d, 'a: ' + formatVal(solveResult.values.a) + ' ' + units.a, 't: ' + formatVal(solveResult.values.t) + ' ' + units.t].join('\n');
      (solveResult.steps || []).forEach(function(s){ addStepBox(s); });
    }
  }

  // wire UI
  if (back) back.addEventListener('click', function(){ if (location.protocol === 'file:') location.href = '../index.html'; else location.href = '/physics-solver'; });
  if (resetBtn) resetBtn.addEventListener('click', function(){
    // reset form inputs to default
    HTMLFormElement.prototype.reset.call(form);
    // reset result and explanation
    resultValues.textContent = 'No results yet.';
    explanation.innerHTML = '<p class="muted">—</p>';
    // hide & clear variant UI
    if (variantSelect){ variantSelect.innerHTML = ''; variantSelect.style.display = 'none'; }
    if (variantLabel) variantLabel.style.display = 'none';
    latestSolve = null;
    // stop and clear simulation
    try{ stopSim(); }catch(e){}
    if (canvas){ try{ var cctx = canvas.getContext('2d'); cctx.clearRect(0,0,canvas.width,canvas.height); }catch(e){} }
    if (simTimeEl) simTimeEl.textContent = '0.000';
    if (simVelEl) simVelEl.textContent = '0.000';
    if (simDistEl) simDistEl.textContent = '0.000';
    if (simVelEl) simVelEl.title = '';
    if (simDistEl) simDistEl.title = '';
  });

  if (variantSelect){
    variantSelect.addEventListener('change', function(){
      if (!latestSolve) return;
      var val = variantSelect.value;
      if (val === 'auto') return renderSolve(latestSolve);
      var n = Number(val);
      if (!Number.isFinite(n)) return;
      var vv = latestSolve.variants && latestSolve.variants[n];
      if (!vv) return;
      // merge selected variant into latestSolve.values so sim uses it
      latestSolve.values = latestSolve.values || {};
      latestSolve.values.V = (vv.V != null) ? vv.V : latestSolve.values.V;
      latestSolve.values.v = (vv.v != null) ? vv.v : latestSolve.values.v;
      latestSolve.values.t = (vv.t != null) ? vv.t : latestSolve.values.t;
      // show chosen variant
      resultValues.textContent = ['V: ' + formatVal(vv.V) + ' m/s', 'v: ' + formatVal(vv.v) + ' m/s', 'd: ' + formatVal(latestSolve.values.d) + ' m', 'a: ' + formatVal(latestSolve.values.a) + ' m/s²', 't: ' + (vv.t!=null?formatVal(vv.t):formatVal(latestSolve.values.t)) + ' s'].join('\n');
      explanation.innerHTML = '';
      addStepBox(vv.stepsV || vv.explanation || '—');
      if (vv.stepsT && vv.stepsT.trim() !== '') addStepBox(vv.stepsT);
    });
  }

  form && form.addEventListener('submit', function(e){
    e.preventDefault();
    var inputs = parseInputs();
    var count = Object.keys(inputs).reduce(function(c,k){ return c + (inputs[k] != null ? 1 : 0); }, 0);
    if (count !== 3){
      resultValues.textContent = 'Please provide exactly 3 inputs.';
      explanation.innerHTML = '<p class="muted">Provide exactly three known values.</p>';
      latestSolve = null;
      return;
    }
    var solved = solveKinematics(inputs);
    renderSolve(solved);
  });

  // Modal handlers (show formulas)
  if (showFormBtn){
    showFormBtn.addEventListener('click', function(){ if (!formulaModal) return; formulaModal.setAttribute('aria-hidden','false'); });
  }
  if (formulaModal){
    closeFormBtn = document.getElementById('close-formulas');
    formulaModal.addEventListener('click', function(ev){ if (ev.target === formulaModal || ev.target.classList.contains('modal-backdrop')){ formulaModal.setAttribute('aria-hidden','true'); } });
    if (closeFormBtn) closeFormBtn.addEventListener('click', function(){ formulaModal.setAttribute('aria-hidden','true'); });
    // allow Escape to close
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && formulaModal && formulaModal.getAttribute('aria-hidden') === 'false'){ formulaModal.setAttribute('aria-hidden','true'); } });
  }

  // --- Canvas & simulation logic (preserve behavior) ---
  var simAnim = null; var ctx = null;
  function resizeCanvas(){ if (!canvas) return; var dpr = window.devicePixelRatio || 1; var cssW = canvas.clientWidth; var cssH = canvas.clientHeight; canvas.width = Math.max(1, Math.floor(cssW * dpr)); canvas.height = Math.max(1, Math.floor(cssH * dpr)); ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); }
  window.addEventListener('resize', function(){ resizeCanvas(); if (simAnim==null && ctx) ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); });
  resizeCanvas();

  function stopSim(){ if (simAnim) cancelAnimationFrame(simAnim); simAnim = null; }
  simReset && simReset.addEventListener('click', function(){ stopSim(); if (canvas){ var cctx = canvas.getContext('2d'); cctx.clearRect(0,0,canvas.width,canvas.height); } if (simTimeEl) simTimeEl.textContent = '0.000'; if (simVelEl) simVelEl.textContent = '0.000'; if (simDistEl) simDistEl.textContent = '0.000'; });

  simBtn && simBtn.addEventListener('click', function(){
    // Require that user has pressed "Solve" first so we reuse the already computed `latestSolve`.
    if (!latestSolve){ resultValues.textContent = 'Please press Solve first to run the simulation.'; return; }
    var inputs = null;
    // start values come from the last solve result (may be deterministic or chosen variant)
    var v0 = (latestSolve.values && latestSolve.values.v != null) ? latestSolve.values.v : 0;
    var a_in = (latestSolve.values && latestSolve.values.a != null) ? latestSolve.values.a : null;
    var targetT = (latestSolve.values && latestSolve.values.t != null) ? latestSolve.values.t : null;
    var targetD = (latestSolve.values && latestSolve.values.d != null) ? latestSolve.values.d : null;
    var a_local = (a_in != null) ? a_in : 0;
    var x = 0; var v = v0; var start = null; var last = null; var finished = false; var startX = x; var movedAway = false;
    var targetV = (latestSolve.values && latestSolve.values.V != null) ? latestSolve.values.V : null;

    // simulation uses `latestSolve.values` (including any chosen variant merged there)

    // compute a sensible display range by sampling positions at relevant times
    function posAt(t){ return v0*t + 0.5*a_local*t*t; }
    var sampleTimes = [0];
    if (targetT != null && targetT > 0) sampleTimes.push(targetT);
    if (Math.abs(a_local) > 1e-12){
      var tPeak = -v0 / a_local;
      if (tPeak > 0) sampleTimes.push(tPeak);
    }
    // heuristic short duration to show movement if no targets provided
    var heuristicT = Math.max(0.5, Math.abs(v0) / Math.max(1e-3, Math.abs(a_local)));
    sampleTimes.push(heuristicT);
    sampleTimes.push(heuristicT * 2);

    var positions = sampleTimes.map(function(tt){ return posAt(tt); });
    if (targetD != null) positions.push(targetD);
    // derive min/max from samples
    var rightMax = Math.max.apply(null, positions);
    var leftMin = Math.min.apply(null, positions);
    // add small padding
    var padFraction = 0.03;
    var span = Math.max(1e-6, rightMax - leftMin);
    var extra = span * padFraction;
    rightMax += extra; leftMin -= extra;
    // ensure zero is visible if movement is small
    var rangeMin = Math.min(0, leftMin);
    var rangeMax = Math.max(0, rightMax);
    var usableRange = rangeMax - rangeMin;
    if (usableRange <= 0) usableRange = Math.max(1, Math.abs(v0) * 2);
    var canvasW = (canvas ? canvas.clientWidth : 760); var pad = 24; var usable = canvasW - pad*2; var scale = usable / usableRange;

    var ctx2 = canvas.getContext('2d');
    // nothing further: targets already taken from latestSolve.values

    function drawFrame(){ var w = canvas.clientWidth; var h = canvas.clientHeight; ctx2.clearRect(0,0,w,h); var groundY = h - 36; ctx2.strokeStyle = 'rgba(15,23,42,0.12)'; ctx2.lineWidth = 4; ctx2.beginPath(); ctx2.moveTo(pad, groundY); ctx2.lineTo(pad+usable, groundY); ctx2.stroke(); var cx = pad + Math.min(usable, Math.max(0, (x - rangeMin)*scale)); var radius = 18; var cy = groundY - radius - 2; ctx2.beginPath(); ctx2.fillStyle = '#1e40af'; ctx2.arc(cx, cy, radius, 0, Math.PI*2); ctx2.fill(); }

    function step(ts){
      if (!start) { start = ts; last = ts; }
      var dt = (ts-last)/1000; last = ts;
      v += a_local*dt;
      x += v*dt;
      var elapsed = (ts-start)/1000;
      if (simTimeEl) simTimeEl.textContent = (Math.round(elapsed*10000)/10000).toFixed(4);
      if (simVelEl) simVelEl.textContent = (Math.round(v*10000)/10000).toFixed(4);
      if (simDistEl) simDistEl.textContent = (Math.round(x*10000)/10000).toFixed(4);
      if (simVelEl) simVelEl.title = String(v);
      if (simDistEl) simDistEl.title = String(x);
      drawFrame();
      if (!movedAway && Math.abs(x-startX) > 1e-6) movedAway = true;
      // If a target time is provided, stop only when time elapses. Otherwise, fall back to distance/velocity conditions.
      if (targetT != null){
        if (elapsed >= targetT) finished = true;
      }
      if (!finished) simAnim = requestAnimationFrame(step); else simAnim = null;
    }

    stopSim(); if (canvas) ctx2.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); x = 0; v = v0; start = null; last = null; finished = false; simAnim = requestAnimationFrame(step);
  });

});
