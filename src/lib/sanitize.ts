import sanitizeHtml from 'sanitize-html';

/**
 * پاک‌سازی محتوای HTML مقاله — جایگزین سازگار با Vercel Serverless برای DOMPurify
 * امنیت کامل ضد XSS حفظ می‌شود (allowlist تگ‌ها/attributeها/schemeها)
 */
export function sanitizeContent(dirty: string): string {
  if (!dirty) return '';

  return sanitizeHtml(dirty, {
    allowedTags: [
      // متن
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'small', 'sub', 'sup',
      // تیترها
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // لیست‌ها
      'ul', 'ol', 'li',
      // نقل‌قول و کد
      'blockquote', 'pre', 'code',
      // جدول
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      // لینک و تصویر
      'a', 'img',
      // سایر
      'div', 'span', 'hr', 'figure', 'figcaption'
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // لینک‌های خارجی: nofollow + noopener + تب جدید
      a: (tagName, attribs) => {
        const href = attribs.href || '';
        if (href.startsWith('http') && !href.includes('fanzoom.ir')) {
          return {
            tagName: 'a',
            attribs: {
              ...attribs,
              rel: 'noopener noreferrer nofollow',
              target: '_blank'
            }
          };
        }
        return { tagName, attribs };
      }
    }
  });
}
