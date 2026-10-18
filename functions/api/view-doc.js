/**
 * PROFITIVO — Cloudflare Pages Function: Document Inline Viewer Proxy
 * Endpoint: /api/view-doc?url=...
 * Entrega documentos (PDF, etc.) con Content-Disposition: inline y MIME correcto
 * para que el navegador los abra directamente en una pestaña sin descargarlos al dispositivo.
 */

export async function onRequestGet(context) {
  const { request } = context;
  const urlObj = new URL(request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL de documento requerida', { status: 400 });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Profitivo-DocViewer'
      },
      redirect: 'follow'
    });

    const lower = targetUrl.toLowerCase();
    const contentType = lower.endsWith('.pdf') ? 'application/pdf' :
      (lower.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' :
      (lower.endsWith('.ppt') ? 'application/vnd.ms-powerpoint' :
      (upstreamRes.headers.get('content-type') || 'application/pdf')));

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Content-Disposition', 'inline');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    if (upstreamRes.headers.get('content-length')) {
      responseHeaders.set('Content-Length', upstreamRes.headers.get('content-length'));
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response('Error sirviendo documento: ' + err.message, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }
  });
}
