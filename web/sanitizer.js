/**
 * PROFITIVO — Módulo Universal de Sanitización de Datos
 * Protege contra XSS (Cross-Site Scripting), inyecciones HTML y payloads maliciosos.
 */
(function(window) {
  'use strict';

  const ProfitivoSanitizer = {
    /**
     * Escapa caracteres especiales para inserción segura en el DOM
     */
    escapeHtml: function(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\//g, '&#x2F;');
    },

    /**
     * Limpia texto plano eliminando etiquetas HTML, scripts y vectores de ataque
     */
    cleanText: function(str, maxLength = 2000) {
      if (str === null || str === undefined) return '';
      let val = String(str);

      // 1. Eliminar bloques de script, style, iframe y objetos
      val = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      val = val.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
      val = val.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      val = val.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
      val = val.replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');

      // 2. Eliminar todas las etiquetas HTML restantes
      val = val.replace(/<[^>]*>/g, '');

      // 3. Neutralizar esquemas de pseudo-protocolo peligrosos
      val = val.replace(/javascript\s*:/gi, '');
      val = val.replace(/vbscript\s*:/gi, '');
      val = val.replace(/data\s*:\s*text\/html/gi, '');

      // 4. Neutralizar manejadores de eventos en línea (onerror, onload, onclick, etc.)
      val = val.replace(/on\w+\s*=/gi, '');

      // 5. Eliminar caracteres de control invisibles no imprimibles
      val = val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      val = val.trim();
      if (maxLength && val.length > maxLength) {
        val = val.substring(0, maxLength);
      }
      return val;
    },

    /**
     * Limpia y valida nombres de usuario (solo letras, números, puntos, guiones y guión bajo)
     */
    cleanUsername: function(username) {
      if (!username) return '';
      return String(username)
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '')
        .substring(0, 30);
    },

    /**
     * Limpia y valida formato de correo electrónico
     */
    cleanEmail: function(email) {
      if (!email) return '';
      const clean = String(email).trim().toLowerCase().substring(0, 100);
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
      if (!emailRegex.test(clean)) {
        throw new Error("El correo electrónico ingresado no tiene un formato válido.");
      }
      return clean;
    },

    /**
     * Limpia números telefónicos permitiendo solo caracteres válidos
     */
    cleanPhone: function(phone) {
      if (!phone) return '';
      return String(phone).replace(/[^\d+()\s-]/g, '').trim().substring(0, 25);
    },

    /**
     * Sanitiza y valida números y montos financieros
     */
    cleanAmount: function(amount) {
      const num = parseFloat(amount);
      if (isNaN(num) || num < 0) return 0.00;
      return Math.round(num * 100) / 100;
    },

    /**
     * Sanitiza URLs permitiendo únicamente protocolos web seguros
     */
    cleanUrl: function(url) {
      if (!url) return '';
      const val = String(url).trim();
      if (/^(https?:\/\/|\/|blob:)/i.test(val)) {
        // Rechazar caracteres peligrosos en la URL
        return val.replace(/[<>"'`\\]/g, '');
      }
      return '';
    },

    /**
     * Sanitiza objetos de datos completos de forma recursiva
     */
    sanitizeObject: function(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(item => typeof item === 'object' ? this.sanitizeObject(item) : (typeof item === 'string' ? this.cleanText(item) : item));
      }

      const clean = {};
      for (const [key, val] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (typeof val === 'string') {
          if (lowerKey.includes('email')) {
            try { clean[key] = this.cleanEmail(val); } catch(e) { clean[key] = this.cleanText(val, 100); }
          } else if (lowerKey.includes('url') || lowerKey.includes('thumbnail')) {
            clean[key] = this.cleanUrl(val);
          } else if (lowerKey === 'username') {
            clean[key] = this.cleanUsername(val);
          } else if (lowerKey.includes('phone')) {
            clean[key] = this.cleanPhone(val);
          } else if (lowerKey.includes('password')) {
            clean[key] = String(val).substring(0, 100); // No modificar caracteres de contraseña pero limitar longitud
          } else {
            clean[key] = this.cleanText(val);
          }
        } else if (typeof val === 'number') {
          clean[key] = isNaN(val) ? 0 : val;
        } else if (typeof val === 'boolean') {
          clean[key] = val;
        } else if (typeof val === 'object' && val !== null) {
          clean[key] = this.sanitizeObject(val);
        } else {
          clean[key] = val;
        }
      }
      return clean;
    }
  };

  window.ProfitivoSanitizer = ProfitivoSanitizer;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfitivoSanitizer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
