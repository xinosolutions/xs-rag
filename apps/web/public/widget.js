(function () {
  function init() {
    var script = document.currentScript;
    if (!script) {
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].getAttribute('data-key')) {
          script = scripts[i];
          break;
        }
      }
    }

    if (!script) {
      console.error('xs-rag widget: Could not find script element with data-key');
      return;
    }

    var key = script.getAttribute('data-key');
    if (!key) {
      console.error('xs-rag widget: Missing data-key attribute');
      return;
    }

    var scriptSrc = script.src || '';
    var origin = window.location.origin;
    if (scriptSrc) {
      try {
        var url = new URL(scriptSrc);
        origin = url.origin;
      } catch (e) {
        // fallback to window.location.origin
      }
    }

    var embedUrl = origin + '/embed/' + encodeURIComponent(key);

    if (document.getElementById('xsrag-widget-container')) {
      return;
    }

    var container = document.createElement('div');
    container.id = 'xsrag-widget-container';

    var iframe = document.createElement('iframe');
    iframe.id = 'xsrag-widget-iframe';
    iframe.setAttribute('data-testid', 'widget-iframe');
    iframe.title = 'Document Assistant Chat';
    iframe.src = embedUrl;
    iframe.style.position = 'fixed';
    iframe.style.bottom = '88px';
    iframe.style.right = '20px';
    iframe.style.width = '400px';
    iframe.style.height = '600px';
    iframe.style.maxWidth = 'calc(100vw - 40px)';
    iframe.style.maxHeight = 'calc(100vh - 110px)';
    iframe.style.border = '1px solid #e5e7eb';
    iframe.style.borderRadius = '16px';
    iframe.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2)';
    iframe.style.zIndex = '2147483646';
    iframe.style.display = 'none';
    iframe.style.backgroundColor = '#ffffff';

    var launcher = document.createElement('button');
    launcher.id = 'xsrag-widget-launcher';
    launcher.setAttribute('data-testid', 'widget-launcher');
    launcher.setAttribute('aria-label', 'Toggle Document Assistant Chat');
    launcher.style.position = 'fixed';
    launcher.style.bottom = '20px';
    launcher.style.right = '20px';
    launcher.style.width = '56px';
    launcher.style.height = '56px';
    launcher.style.borderRadius = '50%';
    launcher.style.backgroundColor = '#2563eb';
    launcher.style.color = '#ffffff';
    launcher.style.border = 'none';
    launcher.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.25)';
    launcher.style.cursor = 'pointer';
    launcher.style.display = 'flex';
    launcher.style.alignItems = 'center';
    launcher.style.justifyContent = 'center';
    launcher.style.zIndex = '2147483647';
    launcher.style.transition = 'transform 0.15s ease-in-out';

    var chatIcon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    var closeIcon =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    launcher.innerHTML = chatIcon;

    var isOpen = false;
    launcher.onclick = function () {
      isOpen = !isOpen;
      if (isOpen) {
        iframe.style.display = 'block';
        launcher.innerHTML = closeIcon;
      } else {
        iframe.style.display = 'none';
        launcher.innerHTML = chatIcon;
      }
    };

    container.appendChild(iframe);
    container.appendChild(launcher);
    document.body.appendChild(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
