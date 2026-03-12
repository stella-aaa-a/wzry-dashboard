export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // 只允许代理小红书和抖音的图片域名，防止滥用
  const allowedDomains = [
    'sns-webpic-qc.xhscdn.com',
    'sns-img-qc.xhscdn.com',
    'sns-img-bd.xhscdn.com',
    'ci.xiaohongshu.com',
    'xhscdn.com',
    'p3-pc-sign.douyinpic.com',
    'p6-pc-sign.douyinpic.com',
    'p9-pc-sign.douyinpic.com',
    'douyinpic.com',
  ];

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    const hostname = new URL(targetUrl).hostname;
    const isAllowed = allowedDomains.some(d => hostname.endsWith(d));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        // 伪装成小红书/抖音自己的请求
        'Referer': 'https://www.xiaohongshu.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
