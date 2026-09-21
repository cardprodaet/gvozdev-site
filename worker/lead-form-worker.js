/**
 * Cloudflare Worker: приём заявок с сайта и отправка их в Telegram.
 *
 * Зачем нужен: токен бота нельзя держать в коде страницы — её исходник виден
 * любому посетителю. Воркер стоит посередине: сайт шлёт заявку сюда, а токен
 * лежит в настройках Cloudflare и наружу не попадает.
 *
 * Переменные окружения (задаются в панели Cloudflare, вкладка Variables):
 *   TG_TOKEN    — токен бота от @BotFather (Secret / зашифрованная переменная)
 *   TG_CHAT_ID  — id чата, куда слать заявки
 *   ALLOWED_ORIGIN — адрес сайта, например https://cardprodaet.github.io
 */

const MAX_FIELD_LENGTH = 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

// Простая защита от потока заявок с одного адреса.
// Память воркера живёт недолго, поэтому это заслон от грубого флуда, а не полноценный лимит.
const recentRequests = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (recentRequests.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  recentRequests.set(ip, hits);

  if (recentRequests.size > 1000) recentRequests.clear();   // не даём памяти расти

  return hits.length > RATE_LIMIT_MAX;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

/** Обрезает и чистит присланное значение. */
function clean(value) {
  return String(value ?? '').trim().slice(0, MAX_FIELD_LENGTH);
}

/** Экранирует символы, ломающие разметку Telegram. */
function escapeMarkdown(text) {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, allowedOrigin);
    }

    // заявки принимаем только со своего сайта
    const origin = request.headers.get('Origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
      return jsonResponse({ error: 'Forbidden' }, 403, allowedOrigin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return jsonResponse({ error: 'Слишком много заявок подряд. Попробуйте через минуту.' }, 429, allowedOrigin);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return jsonResponse({ error: 'Bad request' }, 400, allowedOrigin);
    }

    // honeypot: поле скрыто от людей, его заполняют только боты
    if (clean(data.company)) {
      return jsonResponse({ ok: true }, 200, allowedOrigin);   // тихо игнорируем
    }

    const lead = {
      name:     clean(data.name),
      contact:  clean(data.contact),
      platform: clean(data.platform),
      service:  clean(data.service),
      shop:     clean(data.shop),
      message:  clean(data.message),
    };

    if (lead.name.length < 2 || lead.contact.length < 5) {
      return jsonResponse({ error: 'Заполните имя и контакт' }, 400, allowedOrigin);
    }

    const text =
      '🔔 *Новая заявка с сайта*\n\n' +
      `👤 *Имя:* ${escapeMarkdown(lead.name)}\n` +
      `📞 *Контакт:* ${escapeMarkdown(lead.contact)}\n` +
      (lead.platform ? `🛒 *Площадка:* ${escapeMarkdown(lead.platform)}\n` : '') +
      (lead.service  ? `📦 *Направление:* ${escapeMarkdown(lead.service)}\n` : '') +
      (lead.shop     ? `🔗 *Магазин:* ${escapeMarkdown(lead.shop)}\n` : '') +
      (lead.message  ? `💬 *Сообщение:* ${escapeMarkdown(lead.message)}` : '');

    try {
      const tgResponse = await fetch(
        `https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TG_CHAT_ID,
            text,
            parse_mode: 'MarkdownV2',
          }),
        }
      );

      if (!tgResponse.ok) {
        const details = await tgResponse.text();
        console.error('Telegram отклонил сообщение:', details);
        return jsonResponse({ error: 'Не удалось отправить заявку' }, 502, allowedOrigin);
      }
    } catch (error) {
      console.error('Сбой при обращении к Telegram:', error);
      return jsonResponse({ error: 'Не удалось отправить заявку' }, 502, allowedOrigin);
    }

    return jsonResponse({ ok: true }, 200, allowedOrigin);
  },
};
