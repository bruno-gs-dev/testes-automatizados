// Salve este arquivo como: test_text.js
// (Refatorado para ser chamado pelo index.js)

import chalk from 'chalk';
import { URL_ALVO, takeScreenshot, prepareBrowserPage, showStatus, LOGIN_CONFIG, highlightElement, clearElementHighlight, loadLinksMap } from './utils.js';

/**
 * NOVO: Esta função é exportada para ser chamada pelo index.js (runner)
 * Ela assume que a página já está carregada.
 */
export async function checkTextOnPage(page) {
  await showStatus(page, 'Coletando textos e buscando "null"/"NaN"...');
  // Novo: ler tokens adicionais do env (ex: "erro,indefinido") e montar regex
  const extraTokensEnv = process.env.SEARCH_TEXTS || '';
  const extraTokens = extraTokensEnv.split(/[,\r\n]+/).map(t => t.trim()).filter(Boolean);
  const baseTokens = ['null', 'nan']; // padrões sempre incluídos (case-insensitive)
  const allTokens = [...baseTokens, ...extraTokens];

  // função para escapar caracteres especiais em tokens para uso em regex
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `\\b(${allTokens.map(escapeRegex).join('|')})\\b`;
  // passaremos o padrão como string para o contexto da página
  const textIssues = await page.evaluate((regexSource) => {
    const re = new RegExp(regexSource, 'i');

    const isVisible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const IGNORE = (el) => el.closest('[data-qa-ignore="true"]') || el.id === '__qa_status_overlay';

    // 1) Considera apenas div e span visíveis
    const nodes = Array.from(document.querySelectorAll('div, span'))
      .filter(el => isVisible(el) && !IGNORE(el));

    // 2) Coleta matches
    const matches = [];
    for (const el of nodes) {
      const textContent = el.innerText;
      if (!textContent) continue;
      const match = textContent.match(re);
      if (match) {
        matches.push({ el, text: textContent.trim().substring(0, 200), issueType: match[1] });
      }
    }

    // 3) Mantém apenas o nó mais específico (remove pais que contém outros nós com match)
    const matchedEls = matches.map(m => m.el);
    const deepest = matches.filter(m => !matchedEls.some(other => other !== m.el && m.el.contains(other)));

    // 4) Gera seletores únicos aplicando o atributo no próprio span/div alvo
    const results = [];
    let elementIdCounter = 0;
    for (const m of deepest) {
      const uniqueId = `check-id-${elementIdCounter++}`;
      m.el.setAttribute('data-check-id', uniqueId);
      results.push({
        text: m.text,
        issueType: m.issueType,
        selector: `[data-check-id="${uniqueId}"]`
      });
    }
    return results;
  }, pattern);

  await showStatus(page, 'Gerando relatório de texto...');
  console.log(chalk.bold('\n--- Relatório de Conteúdo de Texto (Página) ---'));
  const textIssuesUnicos = [...new Map(textIssues.map(item => [item.selector, item])).values()];
  let totalErros = 0;
  let textErrorCount = 0;
  for (const item of textIssuesUnicos) {
    totalErros++; textErrorCount++;
    console.log(`${chalk.magenta('✖ CONTEÚDO INVÁLIDO ENCONTRADO:')} "${item.issueType}"`);
    console.log(`  Texto de amostra: "${item.text}"`);

    // NOVO: destacar elemento e inserir uma "badge" de contexto dentro do elemento
    await highlightElement(page, item.selector, '#ff3b30');
    await page.evaluate((sel, badgeText) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'static') {
        el.dataset.qaPrevPosition = 'static';
        el.style.position = 'relative';
      }
      const badge = document.createElement('div');
      badge.className = '__qa_text_badge';
      badge.setAttribute('data-qa-ignore', 'true');
      badge.style.cssText = [
        'position:absolute',
        'top:-6px',
        'left:-6px',
        'transform: translateY(-100%)',
        'z-index:2147483647',
        'background:#ffecec',
        'color:#b00020',
        'border:1px solid #f5c2c7',
        'border-radius:4px',
        'padding:2px 6px',
        'font:11px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
        'pointer-events:none',
        'max-width:360px',
        'box-shadow:0 1px 3px rgba(0,0,0,.15)'
      ].join(';');
      badge.textContent = `Texto encontrado: "${badgeText}"`;
      el.appendChild(badge);
    }, item.selector, item.issueType);

    await takeScreenshot(page, item.selector, `erro_${totalErros}_texto_${item.issueType}.png`);

    // NOVO: remover badge e limpar destaque
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const badge = el.querySelector('div.__qa_text_badge');
      if (badge) badge.remove();
      if (el.dataset.qaPrevPosition) {
        el.style.position = '';
        delete el.dataset.qaPrevPosition;
      }
    }, item.selector);
    await clearElementHighlight(page, item.selector);
  }
  if (textErrorCount === 0) console.log(chalk.green('Nenhum "null" ou "NaN" encontrado no texto.'));
  return { totalErros, textErrorCount };
}


/**
 * Esta é a função "antiga" que roda o teste de texto
 * apenas na URL_ALVO principal.
 */
export default async function runTextTest() {
  console.log(chalk.blue(`Executando teste de TEXTO (Página Única ou por links_map.json) para: ${URL_ALVO}\n`));
  let browser;
  try {
    // NOVO: usar loader unificado (TS/JS/JSON)
    const { links, source: linksSource } = await loadLinksMap();

    if (links && links.length) {
      console.log(chalk.gray(`Usando ${links.length} links de: ${linksSource}`));
      // abre browser e mantém sessão (login) uma vez
      const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
      browser = b;
      let totalErros = 0, textErrorCount = 0;
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        await showStatus(page, `Texto: navegando para ${link.text} (${i+1}/${links.length})`);
        try {
          // tenta navegação direta
          await page.goto(link.href, { waitUntil: 'networkidle2' });
        } catch (e) {
          // não encerra aqui: vamos tentar fallback abaixo
        }

        // Verifica se realmente navegou para a rota esperada; se não, tenta clicar num link na página (fallback SPA)
        let navigated = false;
        try {
          const currentUrl = page.url();
          const targetPath = new URL(link.href).pathname;
          const curPath = new URL(currentUrl).pathname;
          if (currentUrl === link.href || curPath === targetPath || curPath.endsWith(targetPath) || currentUrl.startsWith(link.href)) {
            navigated = true;
          }
        } catch { /* ignore */ }

        if (!navigated) {
          // tenta encontrar um <a> ou botão que leve ao href (ou por parte do path/texto)
          const clicked = await page.evaluate((href) => {
            try {
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              for (const a of anchors) {
                const ah = a.getAttribute('href') || '';
                // normaliza: compara caminhos relativos e absolutos
                if (ah === href || ah === href.replace(window.location.origin, '') ) { a.click(); return true; }
                try { if (new URL(ah, window.location.origin).href === href) { a.click(); return true; } } catch {}
                if (href.endsWith(ah) || ah.endsWith(href)) { a.click(); return true; }
              }
              // busca por texto relevante (último segmento da rota)
              const seg = (href.split('/').filter(Boolean).pop() || '').replace(/[-_]/g,' ').toLowerCase();
              if (seg) {
                const candidates = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
                for (const el of candidates) {
                  const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                  if (txt && txt.includes(seg)) { el.click(); return true; }
                }
              }
            } catch (err) { /* ignore */ }
            return false;
          }, link.href);

          if (clicked) {
            // espera a navegação SPA (ou mudança de rota)
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            navigated = true;
            console.log(chalk.gray(`Fallback: clique detectado para navegar a ${link.text}`));
          }
        }

        if (!navigated) {
          console.log(chalk.yellow(`Aviso: não foi possível navegar até ${link.href}. Pulando...`));
          totalErros++;
          continue;
        }

        // agora executa a verificação de texto
        const res = await checkTextOnPage(page);
        totalErros += (res && res.totalErros) ? res.totalErros : 0;
        textErrorCount += (res && res.textErrorCount) ? res.textErrorCount : 0;
      }
      console.log('\n----------------------------------------------------');
      await showStatus(page, 'Relatório de texto (Multi-página) concluído.');
      return { totalErros, textErrorCount };
    }

    // fallback: comportamento antigo (página única)
    const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
    browser = b;

    await showStatus(page, 'Coletando textos e buscando "null"/"NaN"...');
    const results = await checkTextOnPage(page);

    await showStatus(page, 'Relatório de texto (Página Única) concluído.');
    return results;
  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA:'), err.message);
    return { totalErros: 1, textErrorCount: 1 };
  } finally {
    if (browser) await browser.close();
  }
}