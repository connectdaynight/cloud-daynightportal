/**
 * Cloudflare Pages Function: /api/client-logo
 * Serves client logos with proper image Content-Type headers for social scrapers
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const clientSlug = (url.searchParams.get('client') || url.searchParams.get('c') || url.searchParams.get('slug') || url.searchParams.get('id') || '').trim().toLowerCase();

  const isTcs = clientSlug === 'tcs' || clientSlug === 'thechennaisilks' || clientSlug === 'cmvjreqkd';

  if (env.DB && clientSlug) {
    try {
      const client = await env.DB.prepare("SELECT logo FROM clients WHERE slug = ? OR id = ?").bind(clientSlug, clientSlug).first();
      if (client && client.logo) {
        const dataMatch = client.logo.match(/^data:([^;]+);base64,(.+)$/);
        if (dataMatch) {
          const mime = dataMatch[1];
          const base64 = dataMatch[2];
          const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          return new Response(binary, {
            headers: {
              'Content-Type': mime,
              'Cache-Control': 'public, max-age=86400'
            }
          });
        } else if (client.logo.startsWith('http')) {
          return Response.redirect(client.logo, 302);
        } else if (client.logo.startsWith('/')) {
          return Response.redirect(`${url.origin}${client.logo}`, 302);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Known client fallback
  if (isTcs) {
    return Response.redirect(`${url.origin}/Logo/tcs-logo.png`, 302);
  }

  // Default fallback to Day Night Media main logo
  return Response.redirect(`${url.origin}/Logo/logo.png`, 302);
}
