// Busca RAG por similaridade de texto
// Usa variáveis de ambiente — configure no Vercel: SUPABASE_URL e SUPABASE_KEY

function getSupa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_KEY não configuradas');
  return { url, key };
}

// Jaccard simplificado — palavras com 4+ letras
function similarity(a, b) {
  const tok = t => new Set(
    t.toLowerCase().replace(/[^\w\sà-ú]/g, ' ').split(/\s+/).filter(w => w.length >= 4)
  );
  const sa = tok(a), sb = tok(b);
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query, exam, limit = 5 } = req.body;
    if (!query || !exam) return res.status(400).json({ error: 'query e exam obrigatórios' });

    const { url, key } = getSupa();

    const r = await fetch(
      `${url}/rest/v1/laudos?select=id,exam,classification,observation,report_text,created_at` +
      `&exam=eq.${encodeURIComponent(exam)}&order=created_at.desc&limit=150`,
      {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || 'Erro ao buscar laudos' });
    }

    const laudos = await r.json();
    if (!Array.isArray(laudos) || laudos.length === 0) {
      return res.status(200).json({ results: [] });
    }

    // Pontua combinando texto do laudo + observação
    const scored = laudos
      .filter(l => l.report_text)
      .map(l => ({
        ...l,
        score: similarity(query, l.report_text + ' ' + (l.observation || ''))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return res.status(200).json({ results: scored });
  } catch (e) {
    console.error('search error:', e);
    return res.status(500).json({ error: e.message });
  }
}
