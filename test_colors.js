// Salve este arquivo como: test_colors.js
// (Refatorado para ser chamado pelo index.js)

import chalk from 'chalk';
import { URL_ALVO, PALETA_CORES_PERMITIDAS, normalizeColor, takeScreenshot, prepareBrowserPage, SCREENSHOT_DIR, showStatus, LOGIN_CONFIG, highlightElement, clearElementHighlight, loadLinksMap } from './utils.js';

/**
 * NOVO: Esta função é exportada para ser chamada pelo index.js (runner)
 * Ela assume que a página já está carregada.
 */
export async function checkColorsOnPage(page) {
  await showStatus(page, 'Coletando cores visíveis...');
  const colorData = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const colorResults = [];
    let elementIdCounter = 0;
    allElements.forEach(element => {
      // NOVO: ignora overlay/elementos marcados como ignoráveis
      if (element.closest('[data-qa-ignore="true"]') || element.id === '__qa_status_overlay') { elementIdCounter++; return; }

      const isVisible = !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
      if (!isVisible) { elementIdCounter++; return; }
      const style = window.getComputedStyle(element);
      const uniqueId = `check-id-${elementIdCounter}`;
      const processColor = (val, prop) => {
        if (val && val !== 'none' && !val.startsWith('url(')) {
          element.setAttribute('data-check-id', uniqueId);
          colorResults.push({ color: val, propertyName: prop, selector: `[data-check-id="${uniqueId}"]` });
        }
      };
      processColor(style.color, 'color');
      processColor(style.backgroundColor, 'background-color');
      processColor(style.borderColor, 'border-color');
      elementIdCounter++;
    });
    return colorResults;
  });

  await showStatus(page, `Verificando paleta de cores (${PALETA_CORES_PERMITIDAS.length} permitidas)...`);
  console.log(chalk.bold('--- Relatório de Cores (Página) ---'));
  const coresUnicas = [...new Map(colorData.map(item => [`${item.color}-${item.propertyName}`, item])).values()];
  let totalErros = 0;
  let colorErrorCount = 0;

  for (const item of coresUnicas) {
    // destaca o elemento sob verificação
    await highlightElement(page, item.selector, '#1e90ff');
    await new Promise(r => setTimeout(r, 120)); // pequena pausa para visualização

    const corNormalizada = normalizeColor(item.color);
    if (!PALETA_CORES_PERMITIDAS.includes(corNormalizada)) {
      totalErros++; colorErrorCount++;
      console.log(`${chalk.red('✖ COR NÃO CONFORME:')} ${item.propertyName}: ${item.color} -> ${corNormalizada}`);
      // mantém destaque para facilitar o screenshot de erro
      await takeScreenshot(page, item.selector, `erro_${totalErros}_cor.png`);
    } else {
      // remove destaque quando estiver conforme
      await clearElementHighlight(page, item.selector);
    }
  }

  if (colorErrorCount === 0) console.log(chalk.green('Nenhum problema de cor encontrado.'));
  return { totalErros, colorErrorCount };
}


/**
 * Esta é a função "antiga" que roda o teste de cores
 * apenas na URL_ALVO principal.
 */
export default async function runColorTest() {
  console.log(chalk.blue(`Executando teste de CORES (Página Única ou por links_map.*) para: ${URL_ALVO}\n`));
  let browser;
  try {
    // NOVO: usar loader unificado (TS/JS/JSON)
    const { links, source: linksSource } = await loadLinksMap();
    if (links && links.length) {
      console.log(chalk.gray(`Usando ${links.length} links de: ${linksSource}`));
      // 1. abre browser e mantém sessão (login) uma vez
      const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
      browser = b;
      let totalErros = 0, colorErrorCount = 0;

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        await showStatus(page, `Cores: navegando para ${link.text} (${i+1}/${links.length})`);
        try {
          await page.goto(link.href, { waitUntil: 'networkidle2' });
        } catch (e) {
          console.log(chalk.yellow(`Falha ao abrir ${link.href}: ${e.message.split('\n')[0]}`));
          totalErros++;
          continue;
        }
        const res = await checkColorsOnPage(page);
        totalErros += (res && res.totalErros) ? res.totalErros : 0;
        colorErrorCount += (res && res.colorErrorCount) ? res.colorErrorCount : 0;
      }

      console.log('\n----------------------------------------------------');
      await showStatus(page, 'Relatório de cores (Multi-página) concluído.');
      return { totalErros, colorErrorCount };
    }

    // fallback: comportamento antigo (página única)
    const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
    browser = b;

    // 2. Chama a lógica de teste principal
    const results = await checkColorsOnPage(page);
    
    console.log('\n----------------------------------------------------');
    await showStatus(page, 'Relatório de cores (Página Única) concluído.');
    return results;
  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA (Cores):'), err.message);
    return { totalErros: 1, colorErrorCount: 1 };
  } finally {
    if (browser) await browser.close();
  }
}