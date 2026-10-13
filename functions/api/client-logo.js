/**
 * Cloudflare Pages Function: /api/client-logo
 * Serves client logos with proper image Content-Type headers for social scrapers
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const clientSlug = (url.searchParams.get('client') || url.searchParams.get('c') || url.searchParams.get('slug') || url.searchParams.get('id') || '').trim().toLowerCase();

  if (clientSlug === 'tcs' || clientSlug === 'the chennai silks') {
    return Response.redirect(`${url.origin}/Logo/tcs-logo.png`, 302);
  }

  if (env.DB && clientSlug) {
    try {
      const client = await env.DB.prepare("SELECT logo FROM clients WHERE slug = ? OR id = ?").bind(clientSlug, clientSlug).first();
      if (client && client.logo) {
        if (client.logo.startsWith('data:image/svg+xml;base64,')) {
          const base64 = client.logo.replace('data:image/svg+xml;base64,', '');
          const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          return new Response(binary, {
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        } else if (client.logo.startsWith('http')) {
          return Response.redirect(client.logo, 302);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Default fallback to Day Night Media main logo
  return Response.redirect(`${url.origin}/Logo/logo.png`, 302);
}
