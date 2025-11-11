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
  
  // NOVO: Verificar se está em página válida antes de continuar
  const currentUrl = page.url();
  if (currentUrl.includes('/sessao/expirada') || currentUrl.includes('/login')) {
    throw new Error(`Página não válida para descoberta de links: ${currentUrl}. Verifique se o login foi bem-sucedido.`);
  }
  
  // CORRIGIDO: Detectar tipo de aplicação apenas UMA VEZ e usar seletores apropriados
  const appType = await detectApplicationType(page);
  const selectors = getCustomSelectors();
  
  console.log(chalk.gray(`Usando seletores configurados:`));
  console.log(chalk.gray(`  Painel principal: ${selectors.mainPanel}`));
  console.log(chalk.gray(`  Itens de navegação: ${selectors.mainItems}`));
  
  const discoveredLinks = new Map();
  
  // NOVO: Lógica específica para Angular Fuse com detecção de submenus aninhados
  if (appType === 'angular_fuse') {
    console.log(chalk.blue('Detectado Angular Fuse - usando lógica específica de navegação'));
    
    // Aguardar o componente Fuse estar completamente carregado
    await page.waitForSelector('fuse-vertical-navigation', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000)); // Aguardar animações
    
    // PRIMEIRO: Coletar TODOS os links diretos que já estão visíveis no menu principal
    console.log(chalk.cyan('📋 FASE 1: Coletando links diretos do menu principal...'));
    const initialDirectLinks = await page.evaluate(() => {
      const navigation = document.querySelector('fuse-vertical-navigation');
      if (!navigation) return [];
      
      const links = [];
      // CORRIGIDO: Buscar TODOS os tipos de itens de navegação com links diretos
      const allNavigationItems = [
        ...navigation.querySelectorAll('fuse-vertical-navigation-aside-item a'),
        ...navigation.querySelectorAll('fuse-vertical-navigation-basic-item a'),
        ...navigation.querySelectorAll('fuse-vertical-navigation-collapsable-item a'),
        ...navigation.querySelectorAll('fuse-vertical-navigation-group-item a')
      ];
      
      allNavigationItems.forEach(a => {
        const text = (a.innerText || a.textContent || '').trim();
        const href = a.href;
        
        // Validação completa de link navegável
        if (href && 
            href !== '#' && 
            href !== '' && 
            href !== 'javascript:void(0)' && 
            href !== 'javascript:;' &&
            !href.endsWith('#') &&
            !href.startsWith('#') &&
            href.startsWith(window.location.origin) && 
            text && 
            text.trim().length > 0 &&
            !text.toLowerCase().includes('sair') &&
            !text.toLowerCase().includes('logout')) {
          links.push({ text, href });
        }
      });
      
      // NOVO: Remover duplicatas baseado no href
      const uniqueLinks = [];
      const seenHrefs = new Set();
      links.forEach(link => {
        if (!seenHrefs.has(link.href)) {
          seenHrefs.add(link.href);
          uniqueLinks.push(link);
        }
      });
      
      return uniqueLinks;
    });
    
    console.log(chalk.green(`✓ Encontrados ${initialDirectLinks.length} links diretos no menu principal:`));
    initialDirectLinks.forEach(link => {
      discoveredLinks.set(link.href, link);
      console.log(chalk.green(`  [+] ${link.text}`));
    });
    
    // SEGUNDO: Buscar todos os itens de navegação principais para expandir
    console.log(chalk.cyan('\n📋 FASE 2: Explorando itens expansíveis...'));
    // CORRIGIDO: Buscar TODOS os tipos de itens que podem ter submenus
    const mainNavItems = await page.$$('fuse-vertical-navigation-aside-item, fuse-vertical-navigation-collapsable-item, fuse-vertical-navigation-group-item');
    console.log(chalk.gray(`Encontrados ${mainNavItems.length} itens de navegação para analisar`));
    
    for (let i = 0; i < mainNavItems.length; i++) {
      const item = mainNavItems[i];
      
      try {
        // Verificar se já tem link direto (que já foi coletado na FASE 1)
        const hasDirectLink = await item.evaluate(el => {
          const anchor = el.querySelector('a');
          return !!(anchor && anchor.href && anchor.href.startsWith(window.location.origin) && !anchor.href.endsWith('#'));
        });
        
        if (hasDirectLink) {
          // Pula itens que já têm link direto (já foram coletados)
          continue;
        }
        
        // Verificar se é um item clicável (categoria)
        const itemInfo = await item.evaluate(el => {
          const clickableDiv = el.querySelector('div > div'); // Seletor específico do Fuse
          const text = (el.innerText || el.textContent || '').trim().split('\n')[0]; // Pega só a primeira linha
          
          if (clickableDiv && text && text.length > 0) {
            return { text, isClickable: true };
          }
          return null;
        });
        
        if (itemInfo && itemInfo.isClickable) {
          console.log(chalk.blue(`  [*] Expandindo categoria: ${itemInfo.text}`));
          
          // Clicar no item para expandir
          await item.evaluate(el => {
            const clickTarget = el.querySelector('div > div');
            if (clickTarget) {
              clickTarget.click();
            }
          });
          
          // Aguardar a expansão
          await new Promise(r => setTimeout(r, 750));
          
          // NOVO: Buscar pelo wrapper de links que aparece
          const asideWrapper = await page.$('.fuse-vertical-navigation-aside-wrapper');
          if (asideWrapper) {
            console.log(chalk.gray(`    Wrapper encontrado, analisando conteúdo...`));
            
            // NOVO: PRIMEIRO coletar TODOS os links diretos do wrapper (incluindo os que estão dentro de aside-item)
            const allDirectLinksInWrapper = await page.evaluate(() => {
              const wrapper = document.querySelector('.fuse-vertical-navigation-aside-wrapper');
              if (!wrapper) return [];
              
              const links = [];
              // MUDANÇA: Buscar TODOS os links <a> do wrapper, independente de onde estão
              wrapper.querySelectorAll('a').forEach(a => {
                const text = (a.innerText || a.textContent || '').trim();
                const href = a.href;
                
                // Validação completa de link navegável
                if (href && 
                    href !== '#' && 
                    href !== '' && 
                    href !== 'javascript:void(0)' && 
                    href !== 'javascript:;' &&
                    !href.endsWith('#') &&
                    !href.startsWith('#') &&
                    href.startsWith(window.location.origin) && 
                    text && 
                    text.trim().length > 0 &&
                    !text.toLowerCase().includes('sair') &&
                    !text.toLowerCase().includes('logout')) {
                  links.push({ text, href });
                }
              });
              return links;
            });
            
            // Filtrar apenas os links que ainda não foram descobertos
            const newDirectLinks = allDirectLinksInWrapper.filter(link => !discoveredLinks.has(link.href));
            
            if (newDirectLinks.length > 0) {
              console.log(chalk.green(`      ✓ Encontrados ${newDirectLinks.length} links diretos na categoria "${itemInfo.text}"`));
              newDirectLinks.forEach(link => {
                discoveredLinks.set(link.href, link);
                console.log(chalk.green(`        ➤ ${link.text}`));
              });
            }
            
            // NOVO: DEPOIS explorar itens colapsáveis para encontrar mais links
            const collapsableItems = await page.$$('.fuse-vertical-navigation-aside-wrapper fuse-vertical-navigation-collapsable-item');
            
            if (collapsableItems.length > 0) {
              console.log(chalk.magenta(`      Encontrados ${collapsableItems.length} itens colapsáveis para explorar...`));
              
              for (let k = 0; k < collapsableItems.length; k++) {
                const collapsableItem = collapsableItems[k];
                
                try {
                  // Verificar se o item colapsável é expandível
                  const collapsableItemInfo = await collapsableItem.evaluate(el => {
                    const clickableDiv = el.querySelector('div > div');
                    const text = (el.innerText || el.textContent || '').trim().split('\n')[0];
                    
                    if (clickableDiv && text && text.length > 0) {
                      return { text, isClickable: true };
                    }
                    return null;
                  });
                  
                  if (collapsableItemInfo && collapsableItemInfo.isClickable) {
                    console.log(chalk.blue(`        [*] Expandindo item colapsável: ${collapsableItemInfo.text}`));
                    
                    // Clicar no item colapsável
                    await collapsableItem.evaluate(el => {
                      const clickTarget = el.querySelector('div > div');
                      if (clickTarget) {
                        clickTarget.click();
                      }
                    });
                    
                    // Aguardar expansão do item colapsável
                    await new Promise(r => setTimeout(r, 750));
                    
                    // NOVO: Coletar todos os links que aparecem após expandir o item colapsável
                    const collapsableLinks = await page.evaluate(() => {
                      const wrapper = document.querySelector('.fuse-vertical-navigation-aside-wrapper');
                      if (!wrapper) return [];
                      
                      const links = [];
                      wrapper.querySelectorAll('a').forEach(a => {
                        const text = (a.innerText || a.textContent || '').trim();
                        const href = a.href;
                        
                        // Validação completa de link navegável
                        if (href && 
                            href !== '#' && 
                            href !== '' && 
                            href !== 'javascript:void(0)' && 
                            href !== 'javascript:;' &&
                            !href.endsWith('#') &&
                            !href.startsWith('#') &&
                            href.startsWith(window.location.origin) && 
                            text && 
                            text.trim().length > 0 &&
                            !text.toLowerCase().includes('sair') &&
                            !text.toLowerCase().includes('logout')) {
                          links.push({ text, href });
                        }
                      });
                      return links;
                    });
                    
                    // Filtrar apenas os novos links que ainda não foram descobertos
                    const newCollapsableLinks = collapsableLinks.filter(link => !discoveredLinks.has(link.href));
                    
                    if (newCollapsableLinks.length > 0) {
                      console.log(chalk.green(`          ➤ ${newCollapsableLinks.length} novos links encontrados no item colapsável "${collapsableItemInfo.text}"`));
                      newCollapsableLinks.forEach(link => {
                        discoveredLinks.set(link.href, link);
                        console.log(chalk.green(`            ✓ ${link.text}`));
                      });
                    }
                  }
                  
                } catch (e) {
                  console.log(chalk.yellow(`        ⚠ Erro ao processar item colapsável ${k + 1}: ${e.message}`));
                }
              }
            }
            
            // Fechar o menu clicando fora
            await page.click('body', { offset: { x: 10, y: 10 } });
            await new Promise(r => setTimeout(r, 500));
          }
        }
        
      } catch (e) {
        console.log(chalk.yellow(`  ⚠ Erro ao processar item ${i + 1}: ${e.message}`));
      }
    }
    
  } else {
    // Lógica genérica para outros tipos de aplicação
    console.log(chalk.blue('Usando lógica genérica de navegação'));

    // CORRIGIDO: respeitar NAV_MAIN_PANEL_SELECTOR e NAV_MAIN_ITEMS_SELECTOR do .env/config
    // Compatível com Shadow DOM (busca profunda)
    const result = await page.evaluate((selectors) => {
      const deepQuerySelectorAll = (root, selector) => {
        const out = [];
        const visit = (node) => {
          try {
            out.push(...node.querySelectorAll(selector));
          } catch { /* selector pode ser inválido */ }
          const walk = (container) => {
            const children = container.children ? Array.from(container.children) : [];
            for (const el of children) {
              if (el.shadowRoot) {
                visit(el.shadowRoot);
              }
              // também descer normalmente para alcançar shadow hosts aninhados
              walk(el);
            }
          };
          walk(node);
        };
        visit(root);
        return out;
      };

      const deepQuerySelector = (root, selector) => {
        try {
          const direct = root.querySelector(selector);
          if (direct) return direct;
        } catch { /* ignore */ }
        const all = deepQuerySelectorAll(root, selector);
        return all.length ? all[0] : null;
      };

      let foundWhere = 'não definido';
      let panel = null;
      if (selectors && selectors.mainPanel) {
        panel = deepQuerySelector(document, selectors.mainPanel);
        foundWhere = panel ? (panel.getRootNode() instanceof ShadowRoot ? 'shadow DOM' : 'documento principal') : 'não encontrado';
      }

      const root = panel
        ? (panel.shadowRoot ? panel.shadowRoot : panel)
        : document;

      const candidates = (selectors && selectors.mainItems)
        ? deepQuerySelectorAll(root, selectors.mainItems)
        : deepQuerySelectorAll(root, 'a[href]');

      const links = [];
      for (const node of candidates) {
        try {
          const anchor = node.matches && node.matches('a[href]') ? node : (node.querySelector ? node.querySelector('a[href]') : null);
          if (!anchor) continue;
          const text = (anchor.innerText || anchor.textContent || '').trim();
          const href = anchor.href;
          if (href && href !== '#' && href !== '' && href !== 'javascript:void(0)' && href !== 'javascript:;'
              && !href.endsWith('#') && !href.startsWith('#') && href.startsWith(window.location.origin)
              && text && text.trim().length > 0 && !text.toLowerCase().includes('sair') && !text.toLowerCase().includes('logout')) {
            links.push({ text, href });
          }
        } catch { /* ignore */ }
      }

      // Dedupe
      const seen = new Set();
      const unique = links.filter(l => !seen.has(l.href) && seen.add(l.href));
      return { links: unique, foundWhere };
    }, selectors);

    const allLinks = result.links || [];
    const foundWhere = result.foundWhere || 'desconhecido';

    // MELHORADO: Debug mais claro sobre o que foi encontrado
    console.log(chalk.gray(`Painel principal (${selectors.mainPanel}): ${foundWhere}`));
    console.log(chalk.gray(`Coletados ${allLinks.length} links candidatos`));

    allLinks.forEach(link => {
      if (!discoveredLinks.has(link.href)) {
        discoveredLinks.set(link.href, link);
      }
    });
  }
  
  // Converter Map para Array
  const uniqueLinks = Array.from(discoveredLinks.values());
  
  console.log(chalk.green(`✓ Encontrados ${uniqueLinks.length} links/rotas únicos (incluindo links diretos e submenus)`));
  
  uniqueLinks.forEach((link, index) => {
    console.log(chalk.cyan(`  ${index + 1}. ${link.text}`), chalk.gray(`(${link.href})`));
  });

  // SALVA JSON COM LINKS PARA USO PELOS OUTROS TESTES
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const linksFile = path.join(__dirname, 'links_map.json');
    
    // NOVO: Validação final dos links antes de salvar
    const validLinksForSaving = uniqueLinks.filter(link => {
      return link && 
             link.href && 
             !link.href.endsWith('#') && 
             !link.href.startsWith('#') && 
             link.href !== '#' && 
             link.text && 
             link.text.trim().length > 0;
    });
    
    console.log(chalk.gray(`Salvando ${validLinksForSaving.length} links válidos (de ${uniqueLinks.length} encontrados)`));
    
    fs.writeFileSync(linksFile, JSON.stringify(validLinksForSaving, null, 2), 'utf8');
    console.log(chalk.gray(`Links de navegação salvos em: ${linksFile}`));
  } catch (e) {
    console.log(chalk.yellow('Aviso: falha ao salvar links_map.json:'), e.message.split('\n')[0]);
  }

  return uniqueLinks;
}


/**
 * Executa um teste de "map & click" (O TESTE DE NAVEGAÇÃO NORMAL)
 */
export default async function runNavigationTest(onlyDiscover = false) {
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
    
    // NOVO: Se onlyDiscover for true, para aqui
    if (onlyDiscover) {
      console.log(chalk.blue.bold('\n✅ Descoberta de links concluída. Testes de navegação não executados.'));
      return { totalErros: 0, linksTestados: 0, linksEncontrados: discoveredLinks.length };
    }
    
    // --- PARTE B: TESTE DE NAVEGAÇÃO (1 a 1) ---
    console.log(chalk.bold('\n--- Iniciando Teste de Navegação (Acessando 1 a 1) ---'));
    let navigationErrors = 0;

    for (let i = 0; i < discoveredLinks.length; i++) {
      const link = discoveredLinks[i];
      const logPrefix = `[${i + 1}/${discoveredLinks.length}] ${link.text}:`;
      
      await showStatus(page, `Navegando: ${link.text} (${i + 1}/${discoveredLinks.length})`);
      console.log(`Testando ${logPrefix}`); // Deixei os logs de navegação visíveis aqui

      try {
        // NOVO: Verificar se o link é válido antes de tentar navegar
        if (link.href.endsWith('#') || link.href.startsWith('#') || link.href === '#') {
          throw new Error(`Link inválido detectado: "${link.href}" - âncora vazia ou fragmento`);
        }
        
        const currentUrlBefore = page.url();
        const response = await page.goto(link.href, { waitUntil: 'networkidle2' });
        const status = response ? response.status() : 'unknown';
        const url = page.url();
        
        // NOVO: Verificar se realmente mudou de página
        if (url === currentUrlBefore && link.href.endsWith('#')) {
          throw new Error(`Navegação não efetiva - link "${link.href}" não mudou a página atual`);
        }

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