/**
 * PROFITIVO — Security Shield & Anti-Inspection Protection
 * Bloquea la visualización del código fuente, atajos de desarrollador, clic derecho y modo inspección.
 */
(function() {
  'use strict';

  // 1. Deshabilitar Clic Derecho (Menú Contextual)
  document.addEventListener('contextmenu', function(e) {
    // Permitir clic derecho normal en inputs/textareas y elementos copiables para copiar/pegar texto legítimo
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || (e.target.closest && (e.target.closest('.copyable-data') || e.target.closest('.copyable-text') || e.target.closest('[data-copyable="true"]')))) return;
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, { capture: true });

  // 2. Bloquear Atajos de Teclado de Herramientas de Desarrollador e Inspección
  window.addEventListener('keydown', function(e) {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const key = (e.key || '').toLowerCase();
    const keyCode = e.keyCode || e.which;

    // F12
    if (keyCode === 123 || key === 'f12') {
      blockAction(e);
      return false;
    }

    // Ctrl+Shift+I / Cmd+Option+I (Inspect Element)
    if (isCtrlOrCmd && isShift && (key === 'i' || keyCode === 73)) {
      blockAction(e);
      return false;
    }

    // Ctrl+Shift+J / Cmd+Option+J (Console)
    if (isCtrlOrCmd && isShift && (key === 'j' || keyCode === 74)) {
      blockAction(e);
      return false;
    }

    // Ctrl+Shift+C (Inspect Element cursor)
    if (isCtrlOrCmd && isShift && (key === 'c' || keyCode === 67)) {
      blockAction(e);
      return false;
    }

    // Ctrl+Shift+K (Firefox Dev Console)
    if (isCtrlOrCmd && isShift && (key === 'k' || keyCode === 75)) {
      blockAction(e);
      return false;
    }

    // Ctrl+U / Cmd+Option+U (View Page Source)
    if (isCtrlOrCmd && (key === 'u' || keyCode === 85)) {
      blockAction(e);
      return false;
    }

    // Ctrl+S / Cmd+S (Save Page)
    if (isCtrlOrCmd && (key === 's' || keyCode === 83)) {
      blockAction(e);
      return false;
    }

    // Ctrl+P / Cmd+P (Print Page)
    if (isCtrlOrCmd && (key === 'p' || keyCode === 80)) {
      blockAction(e);
      return false;
    }
  }, { capture: true });

  function blockAction(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // 3. Silenciar la Consola del Navegador para Proteger Datos Internos
  try {
    const noop = function() {};
    const originalConsole = { ...window.console };
    window.console.log = noop;
    window.console.info = noop;
    window.console.debug = noop;
    window.console.warn = noop;
    window.console.dir = noop;
    window.console.table = noop;
    window.console.trace = noop;
    // Dejar un mensaje disuasivo en caso de que alguien fuerce la consola
    setInterval(function() {
      try {
        originalConsole.clear();
        originalConsole.log("%c🛡️ PROFITIVO SECURITY SHIELD ACTIVE%c\nEl modo desarrollador y la extracción de código están estrictamente protegidos.", "color: #00FF88; font-size: 16px; font-weight: bold;", "color: #E2E8F0; font-size: 12px;");
      } catch (e) {}
    }, 2500);
  } catch (e) {}

  // 4. Detección Activa de Apertura de DevTools y Bloqueo en Pantalla
  let securityOverlay = null;

  function createSecurityOverlay() {
    if (securityOverlay) return securityOverlay;
    const overlay = document.createElement('div');
    overlay.id = 'profitivo-security-shield-modal';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(3, 7, 18, 0.98);
      z-index: 9999999;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 30px;
      backdrop-filter: blur(14px);
      color: #fff;
      font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    `;
    overlay.innerHTML = `
      <div style="max-width: 480px; background: #0B132B; border: 1px solid #FF5555; padding: 36px 28px; border-radius: 16px; box-shadow: 0 0 40px rgba(255, 85, 85, 0.3);">
        <div style="font-size: 3.5rem; margin-bottom: 12px;">🛡️</div>
        <h2 style="color: #FF5555; font-size: 1.4rem; margin-bottom: 10px; font-weight: 700;">Modo Desarrollador Restringido</h2>
        <p style="color: #A0AEC0; font-size: 0.92rem; line-height: 1.5; margin-bottom: 18px;">
          Por directivas de seguridad institucional de <strong>Profitivo</strong>, la visualización de código fuente y el uso de herramientas de inspección están deshabilitados.
        </p>
        <p style="font-size: 0.8rem; color: #00FF88; background: rgba(0,255,136,0.08); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0,255,136,0.2);">
          Cierre la ventana de inspección para continuar navegando normalmente.
        </p>
      </div>
    `;
    document.body.appendChild(overlay);
    securityOverlay = overlay;
    return overlay;
  }

  function setDevToolsBlocked(isBlocked) {
    if (!document.body) return;
    const overlay = createSecurityOverlay();
    if (isBlocked) {
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Desenfocar contenido detrás
      Array.from(document.body.children).forEach(el => {
        if (el !== overlay) el.style.filter = 'blur(10px)';
      });
    } else {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      Array.from(document.body.children).forEach(el => {
        if (el !== overlay) el.style.filter = '';
      });
    }
  }

  // Comprobar apertura de DevTools por desfase de dimensiones (acoplado)
  function checkDevToolsDimensions() {
    // Excluir dispositivos móviles y pantallas táctiles: en móviles la barra de direcciones del navegador
    // (Chrome/Safari) y la barra de navegación del sistema generan diferencias naturales de altura que no son DevTools.
    const isMobileOrTouch = ('ontouchstart' in window) ||
                            (navigator.maxTouchPoints > 0) ||
                            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
                            window.innerWidth <= 820;
    if (isMobileOrTouch) {
      setDevToolsBlocked(false);
      return;
    }

    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      setDevToolsBlocked(true);
    } else {
      setDevToolsBlocked(false);
    }
  }

  window.addEventListener('resize', checkDevToolsDimensions);
  setInterval(checkDevToolsDimensions, 800);

  // Trampa de temporizador para DevTools flotante o desacoplado
  setInterval(function() {
    const start = performance.now();
    // Invocación dinámica de debugger protegida
    try {
      (function() {}).constructor("debugger")();
    } catch(e) {}
    const diff = performance.now() - start;
    if (diff > 120) {
      setDevToolsBlocked(true);
    }
  }, 1200);

  // 5. Evitar arrastrar imágenes o elementos para inspeccionarlos
  document.addEventListener('dragstart', function(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'a') {
      e.preventDefault();
      return false;
    }
  });

  // 6. Inyectar estilos globales de protección CSS
  const style = document.createElement('style');
  style.innerHTML = `
    /* Evitar selección de texto no deseada en interfaces sensibles */
    body {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }
    /* Permitir selección normal en campos de formulario y elementos copiables para comodidad del usuario */
    input, textarea, [contenteditable="true"], .copyable-data, .copyable-text, [data-copyable="true"] {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      user-select: text !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  }
})();
