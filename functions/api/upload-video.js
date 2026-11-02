export async function onRequestPost(context) {
  const { request, env } = context;
  const GITHUB_TOKEN = env?.GITHUB_TOKEN || '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';
  const OWNER = 'puneta29';
  const REPO = 'profitivo-videos';
  const RELEASE_ID = 412080522;

  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename') || ('asset_' + Date.now() + '.mp4');
    const cleanFilename = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9_\.-]/g, '_');

    // Leer el buffer binario completo para calcular Content-Length exacto (requerido por GitHub)
    const buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Archivo vacío o no recibido por el servidor.' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${RELEASE_ID}/assets?name=${encodeURIComponent(cleanFilename)}`;

    const lowerName = filename.toLowerCase();
    const contentType = request.headers.get('content-type') || (
      lowerName.endsWith('.pdf') ? 'application/pdf' :
      lowerName.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' :
      lowerName.endsWith('.ppt') ? 'application/vnd.ms-powerpoint' :
      lowerName.endsWith('.webm') ? 'video/webm' :
      lowerName.endsWith('.mov') ? 'video/quicktime' :
      'video/mp4'
    );

    const ghRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Profitivo-Uploader',
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength)
      },
      body: buffer
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return new Response(JSON.stringify({ error: 'GitHub Upload Error: ' + errText, status: ghRes.status }), {
        status: ghRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await ghRes.json();
    return new Response(JSON.stringify({
      success: true,
      video_url: data.browser_download_url,
      filename: cleanFilename,
      size: data.size
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
