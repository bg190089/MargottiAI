const SUPA_URL = 'https://orsgbbpdgfhjmmkowunn.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'sb_publishable_72cEtH51tXeqJlth8EjTww_yHcX3qDb';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, method = 'GET', body } = req.method === 'GET' 
    ? req.query 
    : { path: req.query.path, method: req.method, body: req.body };

  if (!path) return res.status(400).json({ error: 'path required' });

  try {
    const opts = {
      method: method,
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : '',
      },
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const r = await fetch(SUPA_URL + path, opts);
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
