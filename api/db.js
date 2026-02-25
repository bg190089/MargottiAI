// Proxy para o Supabase — todas operações de banco passam por aqui
// Configure no Vercel: SUPABASE_URL e SUPABASE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Nunca usar cache — sempre busca dados frescos do Supabase
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_KEY;

  if (!supaUrl || !supaKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_KEY não configuradas no servidor' });
  }

  try {
    const path   = req.query.path || '';
    const method = req.method;
    const url    = `${supaUrl}${path}`;

    const headers = {
      'apikey':        supaKey,
      'Authorization': `Bearer ${supaKey}`,
      'Content-Type':  'application/json',
      'Cache-Control': 'no-cache',
    };

    // POST: retorna o registro criado (para pegar o ID)
    if (method === 'POST') headers['Prefer'] = 'return=representation';

    // GET: permite buscar mais de 100 linhas (limite padrão do Supabase)
    if (method === 'GET') headers['Range'] = '0-999';

    const fetchOpts = { method, headers };
    if ((method === 'POST' || method === 'PATCH') && req.body) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const r = await fetch(url, fetchOpts);

    // DELETE retorna 204 sem body
    if (r.status === 204) return res.status(204).end();

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      const msg = typeof data === 'object'
        ? (data?.message || data?.hint || JSON.stringify(data))
        : data;
      return res.status(r.status).json({ error: msg || r.statusText });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('db error:', e);
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}
