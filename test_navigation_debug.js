// Salve este arquivo como: test_navigation_debug.js

import chalk from 'chalk';
import { URL_ALVO, prepareBrowserPage, showStatus, LOGIN_CONFIG } from './utils.js';

export default async function runDebugTest() {
  console.log(chalk.yellow.bold(`--- INICIANDO TESTE DE DEBUG FOCADO ---`));
  console.log(chalk.blue(`Executando teste de NAVEGAÇÃO para: ${URL_ALVO}\n`));
  let browser;

  // --- SELETORES EXATOS FORNECIDOS ---
  // 1. O que clicar (Ex: "Trânsito" - o 3º item do tipo 'aside')
  const CLICK_TARGET_SELECTOR = 'body > app-root > layout > compact-layout > fuse-vertical-navigation > div.fuse-vertical-navigation-wrapper.ng-tns-c59-0 > div.fuse-vertical-navigation-content.ng-tns-c59-0.ps > fuse-vertical-navigation-aside-item:nth-child(3) > div > div';

  // 2. Onde coletar os links (O wrapper que aparece)
  const LINK_WRAPPER_SELECTOR = 'body > app-root > layout > compact-layout > fuse-vertical-navigation > div.fuse-vertical-navigation-aside-wrapper.ng-tns-c59-0.ng-trigger.ng-trigger-fadeInLeft.ng-star-inserted.ps > fuse-vertical-navigation-aside-item > div.fuse-vertical-navigation-item-children.ng-star-inserted';
  // --- FIM DOS SELETORES ---

  try {
    const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
    browser = b;

    await showStatus(page, 'DEBUG: Aguardando seletor de clique...');
    console.log(chalk.gray(`Aguardando pelo seletor de clique: ${CLICK_TARGET_SELECTOR}`));
    
    // 1. Espera o item 3 (Trânsito) estar visível
    await page.waitForSelector(CLICK_TARGET_SELECTOR, { visible: true, timeout: 10000 });
    
    await showStatus(page, 'DEBUG: Clicando no item 3...');
    console.log(chalk.blueBright(`[*] Clicando no item 3 ("Trânsito")...`));
    
    // 2. Clica nele
    await page.click(CLICK_TARGET_SELECTOR);
    
    // 3. Espera a animação do 'aside-wrapper' terminar
    await new Promise(r => setTimeout(r, 1000)); 
    
    await showStatus(page, 'DEBUG: Aguardando wrapper de links...');
    console.log(chalk.gray(`Aguardando pelo wrapper de links: ${LINK_WRAPPER_SELECTOR}`));

    // 4. Espera o wrapper de links aparecer
    await page.waitForSelector(LINK_WRAPPER_SELECTOR, { visible: true, timeout: 5000 });
    
    await showStatus(page, 'DEBUG: Coletando links...');
    console.log(chalk.gray(`Coletando todos os 'a' dentro do wrapper...`));

    // 5. Coleta os links de DENTRO do wrapper
    const discoveredLinks = await page.evaluate((wrapperSelector) => {
      const links = [];
      const wrapper = document.querySelector(wrapperSelector);
      if (!wrapper) return []; // Retorna vazio se o wrapper não for encontrado

      wrapper.querySelectorAll('a').forEach(a => {
        const span = a.querySelector('span');
        const text = span ? span.innerText.trim() : a.innerText.trim();
        if (a.href && a.href.startsWith(window.location.origin) && !a.href.endsWith('#')) {
          links.push({ text, href: a.href });
        }
      });
      return links;
    }, LINK_WRAPPER_SELECTOR); // Passa o seletor para dentro do evaluate

    // --- Relatório de Descoberta ---
    console.log(chalk.bold('\n--- Relatório de Mapeamento de Links (DEBUG) ---'));
    if (discoveredLinks.length === 0) {
      console.log(chalk.red('Nenhum link <a> foi encontrado dentro do wrapper especificado.'));
    } else {
      console.log(chalk.green(`Encontrados ${discoveredLinks.length} links navegáveis no item "Trânsito":`));
      discoveredLinks.forEach(link => {
        console.log(`  - ${chalk.cyan(link.text)} ${chalk.gray(`(${link.href})`)}`);
      });
    }

    console.log(chalk.yellow.bold('\n--- TESTE DE DEBUG CONCLUÍDO ---'));
    
    return { totalErros: 0 };

  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA NO TESTE DE DEBUG:'), err.message);
    return { totalErros: 1 };
  } finally {
    if (browser) await browser.close();
  }
}