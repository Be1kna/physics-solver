// Theme toggle: persist in localStorage as 'ps-theme' ('dark'|'light')
(function(){
  var key = 'ps-theme';
  function setTheme(mode){
    if (mode === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    try{ localStorage.setItem(key, mode); }catch(e){}
    updateButton(mode);
  }

  function updateButton(mode){
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.textContent = mode === 'dark' ? '🌙' : '☀️';
    btn.setAttribute('aria-pressed', mode === 'dark');
  }

  function init(){
    var stored = null;
    try{ stored = localStorage.getItem(key); }catch(e){}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = stored || (prefersDark ? 'dark' : 'light');
    setTheme(mode);

    document.addEventListener('click', function(e){
      var t = e.target;
      if (t && t.id === 'theme-toggle'){
        var newMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        setTheme(newMode);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
