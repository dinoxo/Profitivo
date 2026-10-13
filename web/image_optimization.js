/**
 * PROFITIVO — Módulo de Compresión Inteligente de Imágenes
 * Convierte automáticamente fotos/capturas (JPG, PNG, HEIC) a formato WebP progresivo
 * con redimensionamiento óptico (máx 1600px) y calidad balanceada (0.82).
 * Reduce hasta un 90% el peso sin perder nitidez en números, letras ni comprobantes.
 */

(function attachProfitivoImageOptimizer(global) {
  'use strict';

  const DEFAULT_OPTIONS = {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.82,
    outputType: 'image/webp'
  };

  /**
   * Comprime un archivo de imagen (File o Blob)
   * @param {File|Blob} fileOrBlob 
   * @param {Object} options 
   * @returns {Promise<{blob: Blob, file: File, base64: string, originalSize: number, compressedSize: number, savingsPercent: number}>}
   */
  async function compressImage(fileOrBlob, options = {}) {
    const config = { ...DEFAULT_OPTIONS, ...options };
    const originalSize = fileOrBlob.size;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("No se pudo leer el archivo de imagen."));

      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("El archivo proporcionado no es una imagen válida."));

        img.onload = () => {
          let { width, height } = img;

          // Redimensionamiento proporcional
          if (width > config.maxWidth || height > config.maxHeight) {
            if (width / height > config.maxWidth / config.maxHeight) {
              height = Math.round((height * config.maxWidth) / width);
              width = config.maxWidth;
            } else {
              width = Math.round((width * config.maxHeight) / height);
              height = config.maxHeight;
            }
          }

          // Crear canvas optimizado
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          // Suavizado de imagen de alta calidad
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Verificar soporte WebP o fallback a JPEG
          let targetType = config.outputType;
          const testCanvas = document.createElement('canvas');
          if (testCanvas.toDataURL('image/webp').indexOf('data:image/webp') !== 0) {
            targetType = 'image/jpeg';
          }

          canvas.toBlob(
            (compressedBlob) => {
              if (!compressedBlob) {
                return reject(new Error("Error al procesar el lienzo de la imagen."));
              }

              const compressedSize = compressedBlob.size;
              const savingsPercent = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

              // Crear nuevo File con nombre .webp
              const originalName = fileOrBlob.name || 'comprobante_profitivo.jpg';
              const baseName = originalName.replace(/\.[^/.]+$/, "");
              const extension = targetType === 'image/webp' ? '.webp' : '.jpg';
              const optimizedFileName = `${baseName}_optimized${extension}`;

              const optimizedFile = new File([compressedBlob], optimizedFileName, {
                type: targetType,
                lastModified: Date.now()
              });

              const base64Url = canvas.toDataURL(targetType, config.quality);

              console.log(
                `%c[Profitivo Optimizer] %cComprimido: ${(originalSize / 1024).toFixed(1)} KB -> ${(compressedSize / 1024).toFixed(1)} KB (-${savingsPercent}%)`,
                'color: #00E676; font-weight: bold;',
                'color: #F8FAFC;'
              );

              resolve({
                blob: compressedBlob,
                file: optimizedFile,
                base64: base64Url,
                originalSize,
                compressedSize,
                savingsPercent
              });
            },
            targetType,
            config.quality
          );
        };

        img.src = e.target.result;
      };

      reader.readAsDataURL(fileOrBlob);
    });
  }

  // Exponer a nivel global
  global.ProfitivoImageOptimizer = {
    compress: compressImage
  };

})(typeof window !== 'undefined' ? window : this);
