// Salve este arquivo como: test_navigation.js
// Esta versão contém a lógica de expansão recursiva correta.

import chalk from 'chalk';
import { URL_ALVO, prepareBrowserPage, showStatus, LOGIN_CONFIG, getCustomSelectors, detectApplicationType } from './utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Lógica de descoberta de links (executada no navegador)
 * ADICIONADO "EXPORT" PARA QUE O INDEX.JS POSSA CHAMAR ESTA FUNÇÃO
 */
export async function discoverLinks(page) {
  await showStatus(page, 'Mapeando: Iniciando descoberta de links...');
  
  // NOVO: Detectar tipo de aplicação e usar seletores apropriados
  const appType = await detectApplicationType(page);
  const selectors = getCustomSelectors();
  
  console.log(chalk.gray(`Usando configuração de navegação: ${appType}`));
  console.log(chalk.gray(`Seletores: ${JSON.stringify(selectors, null, 2)}`));
  
  const mainPanelSelector = selectors.mainPanel;
  const mainPanelItemsSelector = selectors.mainItems;
  const asideWrapperSelector = selectors.asideWrapper;
  const finalLinkSelector = `${asideWrapperSelector} ${selectors.finalLink}`;
  
  /**
   * Esta função procura repetidamente por submenus fechados (collapsable-item)
   * e clica neles até que não haja mais nada para expandir.
   */
  async function expandAllSubMenus(page, wrapperSelector) {
    const collapsableSelector = `${wrapperSelector} ${selectors.collapsable}`;
    
    // O seletor-chave: Procura o *alvo clicável* (<a> ou <div><div>)
    // DENTRO de um item que tenha a classe de "colapsado".
    const collapsableItemSelector = `
      ${collapsableSelector}.fuse-vertical-navigation-item-collapsed > a,
      ${collapsableSelector}.fuse-vertical-navigation-item-collapsed > div > div
    `;

    let closedSubMenus = await page.$$(collapsableItemSelector);
    let iterations = 0; // Prevenção de loop infinito
    
    while (closedSubMenus.length > 0 && iterations < 10) {
      console.log(chalk.gray(`    Expandindo ${closedSubMenus.length} submenus encontrados...`));
      
      for (const handle of closedSubMenus) {
        try {
          // Usa o clique nativo do browser, que é mais confiável
          await handle.evaluate(el => el.click());
          await new Promise(r => setTimeout(r, 300)); // Espera a animação
        } catch (e) {
          // Ignora se o elemento sumir após o clique
        }
      }
      
      iterations++;
      // Procura novamente para ver se novos submenus apareceram
      closedSubMenus = await page.$$(collapsableItemSelector);
    }
  }


  // NOVO: Busca mais genérica por itens de navegação
  const mainNavHandles = await page.$$(mainPanelItemsSelector);
  const discoveredLinks = new Map();

  console.log(chalk.gray(`Encontrados ${mainNavHandles.length} itens no menu principal. Iterando...`));

  for (const handle of mainNavHandles) {
    const itemInfo = await handle.evaluate((el, clickSelector) => {
      const tagName = el.tagName.toLowerCase();
      const span = el.querySelector('span') || el.querySelector('.text') || el;
      const text = span ? span.innerText.trim() : (el.innerText || '').trim();
      let href = null;
      
      // Busca por link direto
      const anchor = el.querySelector('a') || (el.tagName === 'A' ? el : null);
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin) && !anchor.href.endsWith('#')) {
        href = anchor.href;
      }
      
      // Verifica se é clicável (categoria)
      const isClickable = el.querySelector(clickSelector) || el.matches(clickSelector);
      
      return { tagName, text, href, isClickable };
    }, selectors.clickTarget);

    if (itemInfo.href) {
      // É um link direto
      console.log(chalk.cyan(`  [+] Link direto encontrado:`), itemInfo.text); 
      if (!discoveredLinks.has(itemInfo.href)) {
        discoveredLinks.set(itemInfo.href, { text: itemInfo.text, href: itemInfo.href });
      }
    } else if (itemInfo.isClickable) {
      // É uma categoria clicável
      console.log(chalk.blueBright(`  [*] Clicando categoria:`), itemInfo.text); 
      await showStatus(page, `Mapeando: ${itemInfo.text}...`);
      
      try {
        const clicked = await handle.evaluate((el, clickSelector) => {
          const target = el.querySelector(clickSelector) || el;
          if (target && typeof target.click === 'function') {
            target.click();
            return true;
          }
          return false;
        }, selectors.clickTarget);

        if (!clicked) throw new Error('Elemento clicável não foi encontrado.');
        
        await new Promise(r => setTimeout(r, 750));

        await expandAllSubMenus(page, asideWrapperSelector);
        
        const finalLinks = await page.evaluate((selector) => {
          const links = [];
          document.querySelectorAll(selector).forEach(a => {
            const span = a.querySelector('span') || a.querySelector('.text') || a;
            const text = span ? span.innerText.trim() : a.innerText.trim();
            if (a.href && a.href.startsWith(window.location.origin) && !a.href.endsWith('#')) {
              links.push({ text, href: a.href });
            }
          });
          return links;
        }, finalLinkSelector);

        console.log(chalk.gray(`    Encontrados ${finalLinks.length} links em "${itemInfo.text}".`));
        finalLinks.forEach(link => {
          if (!discoveredLinks.has(link.href)) {
            discoveredLinks.set(link.href, link);
          }
        });

      } catch (e) {
        console.log(chalk.yellow(`    Aviso: falha ao processar a categoria "${itemInfo.text}".`), e.message.split('\n')[0]);
      }
    }
  }

  const result = Array.from(discoveredLinks.values());

  // SALVA JSON COM LINKS PARA USO PELOS OUTROS TESTES
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const linksFile = path.join(__dirname, 'links_map.json');
    fs.writeFileSync(linksFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(chalk.gray(`Links de navegação salvos em: ${linksFile}`));
  } catch (e) {
    console.log(chalk.yellow('Aviso: falha ao salvar links_map.json:'), e.message.split('\n')[0]);
  }

  return result;
}


/**
 * Executa um teste de "map & click" (O TESTE DE NAVEGAÇÃO NORMAL)
 */
export default async function runNavigationTest() {
  console.log(chalk.blue(`Executando teste de NAVEGAÇÃO (Map & Click) para: ${URL_ALVO}\n`));
  let browser;
  try {
    // 1. Prepara o browser e faz o login
    const { browser: b, page } = await prepareBrowserPage(URL_ALVO, {}, LOGIN_CONFIG);
    browser = b;

    // --- PARTE A: DESCOBERTA DOS LINKS (com nova lógica) ---
    const discoveredLinks = await discoverLinks(page);

    // --- Relatório de Descoberta ---
    console.log(chalk.bold('\n--- Relatório de Mapeamento de Links ---'));
    if (discoveredLinks.length <= 10) { 
      console.log(chalk.yellow(`Atenção: Apenas ${discoveredLinks.length} links foram encontrados.`));
    } else {
      console.log(chalk.green(`Encontrados ${discoveredLinks.length} links navegáveis únicos:`));
    }
    
    discoveredLinks.forEach(link => {
      console.log(`  - ${chalk.cyan(link.text)} ${chalk.gray(`(${link.href})`)}`);
    });
    
    
    // --- PARTE B: TESTE DE NAVEGAÇÃO (1 a 1) ---
    console.log(chalk.bold('\n--- Iniciando Teste de Navegação (Acessando 1 a 1) ---'));
    let navigationErrors = 0;

    for (let i = 0; i < discoveredLinks.length; i++) {
      const link = discoveredLinks[i];
      const logPrefix = `[${i + 1}/${discoveredLinks.length}] ${link.text}:`;
      
      await showStatus(page, `Navegando: ${link.text} (${i + 1}/${discoveredLinks.length})`);
      console.log(`Testando ${logPrefix}`); // Deixei os logs de navegação visíveis aqui

      try {
        const response = await page.goto(link.href, { waitUntil: 'networkidle2' });
        const status = response ? response.status() : 'unknown';
        const url = page.url();

        if (!response || !response.ok() || url.includes('login') || url.includes('error')) {
          throw new Error(`Status ${status} ou redirecionamento para página de login/erro.`);
        }
        
        console.log(`  ${chalk.green('✓ SUCESSO')} (Status ${status}) - URL: ${url}`);

      } catch (err) {
        navigationErrors++;
        console.log(`  ${chalk.red('✖ FALHA')} ao carregar ${link.href}`);
        console.log(`    ${chalk.red(err.message.split('\n')[0])}`);
        try {
          await page.goto(URL_ALVO, { waitUntil: 'networkidle2' });
        } catch {}
      }
    }

    // --- Resumo Final ---
    console.log('\n----------------------------------------------------');
    await showStatus(page, 'Teste de navegação concluído.');
    if (navigationErrors > 0) {
      console.log(chalk.red.bold(`Teste de navegação concluído com ${navigationErrors} falhas.`));
    } else {
      console.log(chalk.green.bold('Teste de navegação concluído com sucesso. Todos os links foram acessados.'));
    }
    
    return { totalErros: navigationErrors, linksTestados: discoveredLinks.length };

  } catch (err) {
    console.log(chalk.red.bold('✖ FALHA CRÍTICA no teste de navegação:'), err.message);
    return { totalErros: 1, linksTestados: 0 };
  } finally {
    if (browser) await browser.close();
  }
}