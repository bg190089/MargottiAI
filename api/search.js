const SUPA_URL = 'https://orsgbbpdgfhjmmkowunn.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'sb_publishable_72cEtH51tXeqJlth8EjTww_yHcX3qDb';

// Calcula similaridade simples por palavras-chave em comum
function similarity(text1, text2) {
  const normalize = t => t.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union === 0 ? 0 : intersection / union;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query, exam, limit = 5 } = req.body;
    if (!query || !exam) return res.status(400).json({ error: 'query e exam obrigatórios' });

    // Buscar todos os laudos do exame
    const r = await fetch(
      `${SUPA_URL}/rest/v1/laudos?select=id,exam,classification,observation,report_text,created_at&exam=eq.${exam}&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (!r.ok) return res.status(r.status).json({ error: 'Erro ao buscar laudos' });
    const laudos = await r.json();
    if (!Array.isArray(laudos) || laudos.length === 0) {
      return res.status(200).json({ results: [] });
    }

    // Calcular similaridade de cada laudo com a query
    const scored = laudos
      .filter(l => l.report_text)
      .map(l => ({
        id: l.id,
        exam: l.exam,
        classification: l.classification,
        observation: l.observation || '',
        report_text: l.report_text,
        created_at: l.created_at,
        score: similarity(query, l.report_text + ' ' + (l.observation || ''))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return res.status(200).json({ results: scored });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
