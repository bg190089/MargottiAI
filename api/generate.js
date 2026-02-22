export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key não configurada no servidor' });

  try {
    const { system, userMsg, images } = req.body;
    if (!system || !userMsg) return res.status(400).json({ error: 'Campos obrigatórios: system, userMsg' });

    // Montar conteúdo — com ou sem imagens
    let userContent;
    if (images && images.length > 0) {
      userContent = [
        // Imagens primeiro
        ...images.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.type || 'image/jpeg', data: img.base64 }
        })),
        // Texto depois
        { type: 'text', text: userMsg + '\n\nAnalise as imagens acima, extraia todas as medidas visíveis e preencha o laudo com os valores encontrados.' }
      ];
    } else {
      userContent = userMsg;
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!r.ok) {
      const err = await r.json();
      return res.status(r.status).json({ error: err.error?.message || r.statusText });
    }

    const data = await r.json();
    return res.status(200).json({ content: data.content[0].text });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
