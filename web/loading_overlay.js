/**
 * PROFITIVO — Loading & Anti-Duplication Overlay Manager
 * Bloquea envíos duplicados de formularios, muestra pantallas de carga
 * y ofrece confirmación con botón 'Continuar' al terminar subidas de cursos/videos.
 */
(function(window) {
  'use strict';

  let overlayEl = null;

  function ensureOverlayExists() {
    if (overlayEl) return overlayEl;

    const div = document.createElement('div');
    div.id = 'profitivo-global-loading-overlay';
    div.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(3, 7, 18, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      user-select: none;
      -webkit-user-select: none;
    `;

    div.innerHTML = `
      <div id="loading-card" style="
        background: linear-gradient(145deg, #0B1322, #060B14);
        border: 1px solid rgba(0, 230, 118, 0.3);
        border-radius: 16px;
        padding: 36px 30px;
        max-width: 460px;
        width: 100%;
        text-align: center;
        box-shadow: 0 0 50px rgba(0, 230, 118, 0.15), 0 20px 40px rgba(0, 0, 0, 0.8);
        position: relative;
        animation: profitivoFadeIn 0.25s ease-out;
      ">
        <!-- Estado 1: Cargando -->
        <div id="loading-state-active">
          <div style="position: relative; width: 64px; height: 64px; margin: 0 auto 20px;">
            <div style="
              width: 64px;
              height: 64px;
              border: 4px solid rgba(0, 230, 118, 0.15);
              border-top: 4px solid #00E676;
              border-radius: 50%;
              animation: profitivoSpin 0.75s linear infinite;
            "></div>
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              font-size: 1.4rem;
            ">⚡</div>
          </div>
          <h3 id="loading-overlay-title" style="color: #fff; font-size: 1.25rem; font-weight: 700; margin-bottom: 8px;">
            Procesando Solicitud
          </h3>
          <p id="loading-overlay-msg" style="color: #8899A6; font-size: 0.9rem; line-height: 1.5; margin-bottom: 0;">
            Por favor espera un momento sin cerrar ni recargar la ventana...
          </p>
        </div>

        <!-- Estado 2: Éxito con botón Continuar (para Cursos, Videos y Acciones clave) -->
        <div id="loading-state-success" style="display: none;">
          <div style="
            width: 70px;
            height: 70px;
            background: rgba(0, 230, 118, 0.15);
            border: 2px solid #00E676;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.2rem;
            color: #00E676;
            margin: 0 auto 18px;
            box-shadow: 0 0 30px rgba(0, 230, 118, 0.3);
          ">✔</div>
          <h3 id="success-overlay-title" style="color: #fff; font-size: 1.3rem; font-weight: 700; margin-bottom: 10px;">
            ¡Completado con Éxito!
          </h3>
          <p id="success-overlay-msg" style="color: #A0AEC0; font-size: 0.92rem; line-height: 1.5; margin-bottom: 24px;">
            Todos los datos y archivos se han subido y guardado correctamente en la nube.
          </p>
          <button id="btn-success-continue" type="button" style="
            background: linear-gradient(135deg, #00E676, #00B0FF);
            color: #000;
            border: none;
            font-weight: 800;
            font-size: 1rem;
            padding: 12px 28px;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0, 230, 118, 0.4);
            transition: all 0.2s ease;
            width: 100%;
          ">
            Continuar ➔
          </button>
        </div>
      </div>
    `;

    // Inyectar keyframes de animación
    const animStyle = document.createElement('style');
    animStyle.innerHTML = `
      @keyframes profitivoSpin { to { transform: rotate(360deg); } }
      @keyframes profitivoFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(animStyle);
    document.body.appendChild(div);
    overlayEl = div;
    return overlayEl;
  }

  const ProfitivoUI = {
    /**
     * Muestra la pantalla de carga bloqueando la pantalla contra dobles clics
     */
    showLoading: function(title = 'Procesando Solicitud', message = 'Guardando de forma segura en la nube... Por favor espera.') {
      const el = ensureOverlayExists();
      const activeState = el.querySelector('#loading-state-active');
      const successState = el.querySelector('#loading-state-success');
      activeState.style.display = 'block';
      successState.style.display = 'none';

      el.querySelector('#loading-overlay-title').textContent = title;
      el.querySelector('#loading-overlay-msg').textContent = message;
      el.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    },

    /**
     * Actualiza el texto de estado en vivo (ej: paso 1, subiendo video 2, etc.)
     */
    updateLoading: function(message, title = null) {
      const el = ensureOverlayExists();
      if (title) el.querySelector('#loading-overlay-title').textContent = title;
      if (message) el.querySelector('#loading-overlay-msg').textContent = message;
    },

    /**
     * Oculta la pantalla de carga
     */
    hideLoading: function() {
      if (overlayEl) {
        overlayEl.style.display = 'none';
        document.body.style.overflow = '';
      }
    },

    /**
     * Muestra la pantalla de éxito con botón 'Continuar' (para subidas de cursos/videos)
     */
    showSuccessDialog: function(title, message, onContinue) {
      const el = ensureOverlayExists();
      const activeState = el.querySelector('#loading-state-active');
      const successState = el.querySelector('#loading-state-success');
      activeState.style.display = 'none';
      successState.style.display = 'block';

      el.querySelector('#success-overlay-title').textContent = title || '¡Operación Exitosa!';
      el.querySelector('#success-overlay-msg').textContent = message || 'Todos los cambios se aplicaron correctamente.';

      const continueBtn = el.querySelector('#btn-success-continue');
      continueBtn.onclick = function() {
        el.style.display = 'none';
        document.body.style.overflow = '';
        if (typeof onContinue === 'function') {
          try { onContinue(); } catch(e) { console.error(e); }
        }
      };

      el.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  };

  window.ProfitivoUI = ProfitivoUI;
})(typeof window !== 'undefined' ? window : globalThis);
