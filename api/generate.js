export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });

  try {
    const { system, userMsg, images } = req.body;
    if (!userMsg) return res.status(400).json({ error: 'userMsg obrigatório' });

    // ══════════════════════════════════════════════════════════
    //  PIPELINE DE 2 ETAPAS PARA IMAGENS/PDF
    //  Etapa 1: Extração especializada de medidas e achados
    //  Etapa 2: Geração do laudo (texto puro)
    // ══════════════════════════════════════════════════════════
    let finalUserMsg = userMsg;

    if (images && images.length > 0) {
      // ── ETAPA 1: Extração especializada ──
      const extractionParts = [];

      for (const img of images) {
        if (img.type === 'application/pdf') {
          extractionParts.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: img.base64 }
          });
        } else {
          const mt = img.type && img.type.startsWith('image/') ? img.type : 'image/jpeg';
          extractionParts.push({
            type: 'image',
            source: { type: 'base64', media_type: mt, data: img.base64 }
          });
        }
      }

      extractionParts.push({
        type: 'text',
        text: `Você é um especialista em leitura de imagens de ultrassonografia diagnóstica.

═══ TAREFA PRINCIPAL ═══
Analise cada imagem/documento e extraia TODAS as informações clínicas visíveis com máxima precisão.

═══ PASSO 1: IDENTIFICAR O TIPO DE EXAME ═══
Para CADA imagem, identifique o exame com base em:
- Labels/texto visível na tela do aparelho (ex: "THYROID", "OB", "PELVIS", "ABD")
- Anatomia reconhecível na imagem (formato do órgão, localização)
- Tipo de sonda inferido pelo campo de visão

Tipos possíveis:
- TIREOIDE: lobos tireoidianos, istmo, nódulos tireoidianos, Doppler de artérias tireoidianas
- ENDOVAGINAL/TRANSVAGINAL: útero, endométrio, ovários, folículos, cistos ovarianos
- OBSTÉTRICO: biometria fetal (DBP, CC, CA, CF), placenta, líquido amniótico, Doppler umbilical
- ABDOME: fígado, vesícula, pâncreas, baço, rins, aorta, bexiga
- MAMAS: tecido mamário, nódulos, cistos, linfonodos axilares
- URINÁRIO: rins, bexiga, próstata, resíduo pós-miccional
- VASCULAR: carótidas, vertebrais, Doppler com velocidades
- PRÓSTATA: próstata via abdominal ou transretal
- CERVICAL: linfonodos cervicais, glândulas salivares
- PARTES MOLES: subcutâneo, lipomas, cistos, hérnias
- PAREDE ABDOMINAL: musculatura, hérnias, coleções

═══ PASSO 2: EXTRAIR MEDIDAS POR ESTRUTURA ═══
Organize as medidas identificando claramente QUAL estrutura pertence cada valor.

FORMATO OBRIGATÓRIO:
[Imagem N — TIPO DO EXAME identificado]
Estrutura: medida1 x medida2 x medida3 cm (ou mm)
Volume: valor cm³ (se visível)
Achados: descrição de alterações visíveis

═══ REGRAS DE EXTRAÇÃO POR EXAME ═══

TIREOIDE — procure especificamente:
- Lobo direito: 3 dimensões (longitudinal x AP x transversal) + volume
- Lobo esquerdo: 3 dimensões + volume
- Istmo: espessura
- Volume global da glândula
- Nódulos: localização (lobo, terço superior/médio/inferior), dimensões, ecogenicidade (hipo/hiper/iso/anecóico), contornos (regulares/irregulares/espiculados), composição (sólido/cístico/misto), calcificações (micro/macro/nenhuma), classificação TI-RADS se visível
- Doppler: VPS artéria tireóidiana inferior D e E, padrão vascular (normal/aumentado)
- Linfonodos cervicais: dimensões, aspecto

ENDOVAGINAL/TRANSVAGINAL — procure especificamente:
- Útero: 3 dimensões + volume, posição (AVF/RVF)
- Endométrio: espessura em mm, aspecto (homogêneo/heterogêneo/trilaminar)
- Ovário direito: 3 dimensões + volume, folículos (número e maior diâmetro)
- Ovário esquerdo: 3 dimensões + volume, folículos
- Miomas: localização (subseroso/intramural/submucoso), dimensões
- Cistos ovarianos: lado, dimensões, conteúdo (anecóico/complexo)
- Líquido no fundo de saco: presente/ausente, volume estimado
- DIU: posição se visível

OBSTÉTRICO — procure especificamente:
- CCN (comprimento cabeça-nádegas) para primeiro trimestre
- DBP, CC, CA, CF para segundo/terceiro trimestre
- Peso fetal estimado e percentil
- BCF/FC fetal em bpm
- Placenta: localização, grau de maturação (Grannum)
- Líquido amniótico: maior bolsão, ILA
- Doppler: IP artéria umbilical, IP ACM, IP artérias uterinas D e E

ABDOME — procure especificamente:
- Fígado: dimensões do lobo D (crânio-caudal), ecotextura
- Vesícula: dimensões, espessura da parede, cálculos (número, tamanho)
- Colédoco: calibre
- Pâncreas: dimensões
- Baço: dimensão do maior eixo
- Rins D e E: eixo bipolar, espessura do parênquima
- Aorta: calibre
- Nódulos hepáticos: segmento, dimensões, ecogenicidade
- Cálculos renais: lado, dimensões, localização (cálice/pelve/JUP)

MAMAS — procure especificamente:
- Nódulos: mama (D/E), localização (quadrante, distância do mamilo), dimensões, forma (oval/redonda/irregular), margens (circunscritas/não circunscritas), ecogenicidade, classificação BI-RADS se visível
- Cistos: lado, dimensões, conteúdo
- Linfonodos axilares: dimensões, aspecto (hilo presente/ausente)

VASCULAR — procure especificamente:
- VPS, VDF, IR, IP de cada artéria (ACC, ACI, ACE bilateral)
- Artérias vertebrais: direção do fluxo, velocidades
- Espessura íntima-média (EIM)
- Placas ateromatosas: localização, espessura, ecogenicidade

═══ PASSO 3: IDENTIFICAR ACHADOS PATOLÓGICOS ═══
Se identificar QUALQUER dos seguintes achados, descreva com detalhes:

ACHADOS PATOGNOMÔNICOS (alta confiança):
- Cálculos (imagem hiperecogênica com sombra acústica posterior)
- Cistos simples (imagem anecóica com reforço acústico posterior)
- Hidronefrose (dilatação pielocalicial)
- Derrame pleural/pericárdico/ascite (coleções líquidas)
- Nódulos sólidos com dimensões e ecogenicidade definidas

ACHADOS SUGESTIVOS (descrever, não diagnosticar):
- Nódulos com calcificações (descrever tipo: micro/macro)
- Espessamento de parede (vesicular, endometrial)
- Massas complexas (descrever componentes sólido/cístico)
- Dilatação de vias biliares ou ductos
- Alterações de ecotextura parenquimatosa (esteatose, hepatopatia)

REGRA: Descreva o achado morfológico. NÃO faça diagnóstico. 
Ex: "Imagem nodular hiperecogênica de 2,1 x 1,9 cm no segmento VII" (correto)
Ex: "Hemangioma hepático" (INCORRETO — isso é diagnóstico, não descrição)

═══ REGRAS GERAIS ═══
1. Se um valor estiver parcialmente legível, escreva "~valor (APROXIMADO)"
2. Se completamente ilegível, escreva "ILEGÍVEL"
3. NÃO invente valores que não estejam visíveis
4. Se a imagem misturar exames diferentes (tireoide + transvaginal), separe por exame
5. Se houver múltiplas imagens do mesmo exame, agrupe as medidas por estrutura
6. Se não encontrar NENHUMA medida legível, responda: "Nenhuma medida identificável."

═══ EXEMPLO DE SAÍDA IDEAL ═══
[Imagem 1 — TIREOIDE]
Lobo direito: 4,2 x 1,5 x 1,3 cm | Volume: 4,3 cm³
Nódulo lobo direito terço médio: 0,8 x 0,6 cm, sólido, isoecogênico, contornos regulares, sem calcificações

[Imagem 2 — TIREOIDE]
Lobo esquerdo: 3,8 x 1,4 x 1,2 cm | Volume: 3,2 cm³
Istmo: 0,3 cm
Sem nódulos no lobo esquerdo

[Imagem 3 — TIREOIDE DOPPLER]
ATID VPS: 28 cm/s
ATIE VPS: 25 cm/s
Padrão vascular habitual

[Imagem 4 — ENDOVAGINAL]
Útero AVF: 7,2 x 3,8 x 4,1 cm | Volume: 57,8 cm³
Endométrio: 8 mm, homogêneo

[Imagem 5 — ENDOVAGINAL]
Ovário direito: 3,2 x 2,1 x 1,8 cm | Volume: 6,3 cm³
Cisto simples: 1,5 cm, conteúdo anecóico, paredes finas`
      });

      const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: extractionParts }]
        })
      });

      if (!extractionResponse.ok) {
        const err = await extractionResponse.json().catch(() => ({}));
        return res.status(extractionResponse.status).json({
          error: 'Erro na extração de medidas: ' + (err?.error?.message || extractionResponse.statusText)
        });
      }

      const extractionData = await extractionResponse.json();
      const extractedMeasures = extractionData.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      // ── ETAPA 2: Gerar laudo com medidas extraídas ──
      if (extractedMeasures && !extractedMeasures.includes('Nenhuma medida identificável')) {
        finalUserMsg += '\n\n══ MEDIDAS E ACHADOS EXTRAÍDOS DAS IMAGENS ══\n' + extractedMeasures +
          '\n══ FIM DAS MEDIDAS ══\n\n' +
          'INSTRUÇÕES SOBRE AS MEDIDAS EXTRAÍDAS:\n' +
          '- Use EXATAMENTE esses valores no laudo, colocando cada medida na estrutura correta.\n' +
          '- Se foram identificados exames diferentes nas imagens, gere o laudo para o exame selecionado usando apenas as medidas correspondentes.\n' +
          '- Achados patológicos descritos devem ser incorporados no laudo com a terminologia do Dr. Roberto (consultar referências do banco).\n' +
          '- NÃO invente valores adicionais que não estejam listados acima.\n' +
          '- Medidas marcadas como APROXIMADO: use com o prefixo "cerca de" ou "aproximadamente".\n' +
          '- Medidas marcadas como ILEGÍVEL: use ___ no laudo.';
      } else {
        finalUserMsg += '\n\n[Imagens analisadas mas nenhuma medida claramente legível foi encontrada. Use ___ para medidas não fornecidas.]';
      }
    }

    // ── CHAMADA PRINCIPAL: Geração do laudo (sempre texto puro) ──
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: system || '',
        messages: [{ role: 'user', content: finalUserMsg }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || r.statusText });
    }

    const data    = await r.json();
    const content = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return res.status(200).json({ content });
  } catch (e) {
    console.error('generate error:', e);
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}
