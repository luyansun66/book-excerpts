interface CoverContext {
  request: Request;
}

const ALLOWED_HOSTS = new Set(['books.google.com', 'covers.openlibrary.org']);

export async function onRequestGet(context: CoverContext): Promise<Response> {
  const url = new URL(context.request.url);
  const rawUrl = url.searchParams.get('url');

  if (!rawUrl) {
    return new Response('missing url', { status: 400 });
  }

  let remote: URL;
  try {
    remote = new URL(rawUrl);
  } catch {
    return new Response('invalid url', { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(remote.hostname)) {
    return new Response('forbidden host', { status: 400 });
  }

  if (remote.protocol === 'http:') {
    remote.protocol = 'https:';
  }

  const upstream = await fetch(remote.toString(), {
    headers: { Accept: 'image/*' },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('cover fetch failed', { status: 502 });
  }

  const contentType = upstream.headers.get('Content-Type') ?? 'image/jpeg';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
