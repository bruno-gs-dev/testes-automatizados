import 'dotenv/config';
import puppeteer from 'puppeteer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getNavigationConfig } from './config/navigation.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// Helpers para parsing de .env
const toBool = (v, def = false) => {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'new'].includes(s);
};
const toNum = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
};
const toList = (v) => {
  if (!v) return [];
  return String(v).split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
};

// NOVO: timeouts do login (lidos do .env, com defaults)
const LOGIN_FIND_TIMEOUT = toNum(process.env.LOGIN_FIND_TIMEOUT, 8000);
const LOGIN_CONFIRM_TIMEOUT = toNum(process.env.LOGIN_CONFIRM_TIMEOUT, 12000);

// Lidos do .env - REMOVIDO: URL específica hardcoded
export const URL_ALVO = process.env.URL_ALVO || 'https://exemplo.com/app/home';

export const PALETA_CORES_PERMITIDAS = (
  process.env.PALETA_CORES_PERMITIDAS
    ? toList(process.env.PALETA_CORES_PERMITIDAS).map(s => s.toLowerCase())
    : ['#ffffff', '#000000', '#f8f9fa', '#1e293b', '#1f3f6e']
);

export function normalizeColor(colorString) {
  if (!colorString) return colorString;
  if (colorString === 'transparent') return 'rgba(0, 0, 0, 0)';
  if (colorString.startsWith('rgba')) {
    const rgba = colorString.match(/\d+(\.\d+)?/g).map(Number);
    if (rgba.length === 4 && rgba[3] === 0) return 'rgba(0, 0, 0, 0)';
    const r = rgba[0], g = rgba[1], b = rgba[2];
    return '#' + [r, g, b].map(x => ('0' + x.toString(16)).slice(-2)).join('');
  }
  if (colorString.startsWith('rgb')) {
    const rgb = colorString.match(/\d+/g).map(Number);
    return '#' + rgb.map(x => ('0' + x.toString(16)).slice(-2)).join('');
  }
  return colorString.toLowerCase();
}

// ATUALIZADO: Configuração de login centralizada (vinda do .env) - REMOVIDO: dados específicos
export const LOGIN_CONFIG = {
  idVerificacao: toNum(process.env.LOGIN_ID_VERIFICACAO, null),
  expectedPath: process.env.EXPECTED_PATH || '/app/home',
  idSistema: toNum(process.env.LOGIN_ID_SISTEMA, null),
  idContrato: (process.env.LOGIN_ID_CONTRATO ? toList(process.env.LOGIN_ID_CONTRATO).map(n => toNum(n, null)).filter(n => n != null) : []),
  nomeSistema: process.env.LOGIN_NOME_SISTEMA || '',
  contratoNome: process.env.LOGIN_CONTRATO_NOME || '',
  url: process.env.BASE_URL || 'https://exemplo.com/',
  username: process.env.LOGIN_USERNAME || '',
  password: process.env.LOGIN_PASSWORD || '',
  selectors: {
    username: process.env.LOGIN_SELECTOR_USERNAME || 'input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]',
    password: process.env.LOGIN_SELECTOR_PASSWORD || 'input[type="password"]',
    submit: process.env.LOGIN_SELECTOR_SUBMIT || 'button[type="submit"], input[type="submit"], button:contains("Entrar"), button:contains("Login")'
  }
};

// NOVO: overlay de status no navegador
export async function showStatus(page, text) {
  try {
    await page.evaluate((msg) => {
      let el = document.getElementById('__qa_status_overlay');
      if (!el) {
        el = document.createElement('div');
        el.id = '__qa_status_overlay';
        el.setAttribute('data-qa-ignore', 'true');       // NOVO: ignorar nos testes
        el.setAttribute('aria-hidden', 'true');          // NOVO: acessibilidade
        el.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;background:rgba(0,0,255,.12);backdrop-filter:saturate(120%);color:#0b5fff;font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px 10px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.3);pointer-events:none'; // NOVO: pointer-events none
        document.body.appendChild(el);
      } else {
        el.setAttribute('data-qa-ignore', 'true');
        el.setAttribute('aria-hidden', 'true');
        el.style.pointerEvents = 'none';
      }
      el.textContent = 'Automation: ' + msg;
    }, text);
  } catch {
    // ignora se a page ainda não estiver pronta
  }
}

// NOVO: helper para achar seletor em qualquer frame
async function getFrameWithSelector(page, selector) {
  for (const frame of page.frames()) {
    try {
      if (await frame.$(selector)) return frame;
    } catch { /* ignore */ }
  }
  return null;
}

// NOVO: helper para achar seletor em qualquer frame (com wait e handle) — agora respeita timeout=0 (verificação única, sem espera)
async function waitForSelectorInAnyFrame(page, selector, timeout = 5000) {
  if (!selector) return { frame: null, handle: null };
  const scanOnce = async () => {
    for (const frame of page.frames()) {
      try {
        const handle = await frame.$(selector);
        if (handle) return { frame, handle };
      } catch { /* ignore */ }
    }
    return { frame: null, handle: null };
  };
  if (!timeout || timeout <= 0) {
    return await scanOnce();
  }
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = await scanOnce();
    if (found.frame && found.handle) return found;
    await new Promise(r => setTimeout(r, 120));
  }
  return { frame: null, handle: null };
}

// NOVO: digitar em input dentro de um frame disparando eventos (robusto)
async function fillInputInFrame(frame, selector, value) {
  try {
    const el = await frame.$(selector);
    if (!el) return false;

    // NOVO: garantir que o elemento esteja visível na viewport antes de interagir
    await frame.$eval(selector, (i) => {
      try { i.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch {}
    }).catch(() => {});

    await el.focus().catch(() => {});
    await el.click({ clickCount: 3 }).catch(() => {});

    // limpa via JS e dispara eventos
    await frame.evaluate((sel) => {
      const i = document.querySelector(sel);
      if (!i) return;
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector);

    // digita com delay
    await frame.type(selector, value, { delay: 20 }).catch(() => {});

    // garante eventos e blur
    await frame.$eval(selector, (input) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    });

    // valida
    let typed = await frame.$eval(selector, (i) => i.value);
    if (typed && typed.trim() === String(value)) return true;

    // fallback: setar diretamente e disparar eventos
    await frame.$eval(selector, (input, v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    }, String(value));

    typed = await frame.$eval(selector, (i) => i.value);
    return !!typed && typed.trim() === String(value);
  } catch {
    return false;
  }
}

// NOVO: clicar botão por texto dentro de um frame (sem usar XPath)
async function clickButtonByTextInFrame(frame, text) {
  if (!frame || !text) return false;
  const needle = text.trim().toLowerCase();
  try {
    const handles = await frame.$$('button, [role="button"], a[role="button"], input[type="submit"], input[type="button"], button[type="submit"]');
    for (const h of handles) {
      const ok = await h.evaluate((el, t) => {
        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
        const val = (el.value || '').trim().toLowerCase();
        return txt.includes(t) || val.includes(t);
      }, needle);
      if (ok) {
        await h.click().catch(() => {});
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// NOVO: Configuração de navegação baseada no tipo
export const getNavConfig = () => {
  const navType = process.env.NAV_TYPE || 'generic';
  return getNavigationConfig(navType);
};

// NOVO: Seletores customizáveis via .env (com fallback para padrões)
export const getCustomSelectors = () => {
  const navConfig = getNavConfig();
  
  return {
    mainPanel: process.env.NAV_MAIN_PANEL_SELECTOR || navConfig.mainPanelSelector,
    mainItems: process.env.NAV_MAIN_ITEMS_SELECTOR || navConfig.mainItemsSelector,
    asideWrapper: process.env.NAV_ASIDE_WRAPPER_SELECTOR || navConfig.asideWrapperSelector,
    finalLink: process.env.NAV_FINAL_LINK_SELECTOR || navConfig.finalLinkSelector,
    collapsable: process.env.NAV_COLLAPSABLE_SELECTOR || navConfig.collapsableSelector,
    clickTarget: process.env.NAV_CLICK_TARGET_SELECTOR || navConfig.clickTargetSelector
  };
};

// NOVO: Detectar tipo de aplicação automaticamente
export async function detectApplicationType(page) {
  const types = await page.evaluate(() => {
    const checks = {
      angular_fuse: !!document.querySelector('fuse-vertical-navigation'),
      bootstrap: !!document.querySelector('.navbar, .nav, [class*="bootstrap"]') || !!window.bootstrap,
      react: !!document.querySelector('[data-reactroot], #root, #__next') || !!window.React,
      vue: !!document.querySelector('[data-v-], #app') || !!window.Vue,
      generic: true
    };
    
    // Retorna o primeiro tipo detectado (exceto generic)
    for (const [type, detected] of Object.entries(checks)) {
      if (detected && type !== 'generic') return type;
    }
    return 'generic';
  });
  
  console.log(chalk.gray(`Tipo de aplicação detectado: ${types}`));
  return types;
}

// ATUALIZADO: função de login mais genérica - CORRIGIDO: seletores CSS válidos
export async function performLogin(page, loginConfig) {
  const baseUrl = loginConfig.url;
  const expectedPath = loginConfig.expectedPath || '/';
  // NOVO: Verificar se o login deve ser pulado
  if (toBool(process.env.SKIP_LOGIN, false)) {
    console.log(chalk.blue('Login pulado por configuração (SKIP_LOGIN=true).'));
    return true;
  }

  // NOVO: Verificar se login é necessário
  if (!loginConfig.username || !loginConfig.password) {
    console.log(chalk.yellow('Aviso: Credenciais de login não fornecidas. Pulando login.'));
    return true;
  }

  await showStatus(page, 'Acessando tela de login...');
  await page.goto(baseUrl, { waitUntil: 'networkidle2' }).catch(() => {});

  // CORRIGIDO: Detectar automaticamente seletores sem usar :contains()
  const autoDetectedSelectors = await page.evaluate(() => {
    let usernameField = null, passwordField = null, submitButton = null;
    
    // Busca mais abrangente por campos de input
    const usernameInputs = document.querySelectorAll([
      'input[type="email"]',
      'input[type="text"]',
      'input[name*="user"]',
      'input[name*="email"]',
      'input[name*="login"]',
      'input[id*="user"]',
      'input[id*="email"]',
      'input[id*="login"]'
    ].join(', '));
    
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    
    // CORRIGIDO: Remover :contains() e usar seletores CSS válidos
    const submitButtons = document.querySelectorAll([
      'button[type="submit"]',
      'input[type="submit"]',
      '.btn-login',
      '.login-btn',
      '.submit-btn',
      'button.btn-primary',
      'button.primary',
      '[class*="submit"]',
      '[class*="login"]'
    ].join(', '));
    
    // NOVO: Buscar botões por texto usando innerText (após querySelectorAll)
    if (submitButtons.length === 0) {
      const allButtons = document.querySelectorAll('button, input[type="button"], [role="button"]');
      for (const btn of allButtons) {
        const text = (btn.innerText || btn.textContent || btn.value || '').toLowerCase();
        if (text.includes('entrar') || text.includes('login') || text.includes('sign in') || 
            text.includes('conectar') || text.includes('acessar') || text.includes('submit')) {
          submitButton = btn.id ? `#${btn.id}` : (btn.className ? `.${btn.className.split(' ')[0]}` : 'button');
          break;
        }
      }
    }
    
    if (usernameInputs.length > 0) {
      const input = usernameInputs[0];
      usernameField = input.id ? `#${input.id}` : (input.name ? `[name="${input.name}"]` : `input[type="${input.type}"]`);
    }
    
    if (passwordInputs.length > 0) {
      const input = passwordInputs[0];
      passwordField = input.id ? `#${input.id}` : 'input[type="password"]';
    }
    
    // Se não encontrou botão por classe, usar o primeiro botão de submit
    if (!submitButton && submitButtons.length > 0) {
      const btn = submitButtons[0];
      submitButton = btn.id ? `#${btn.id}` : (btn.className ? `.${btn.className.split(' ')[0]}` : 'button[type="submit"]');
    }
    
    return { usernameField, passwordField, submitButton };
  });

  // NOVO: resolver seletor/iframe de usuário e senha dinamicamente (prioriza .env, cai p/ fallback real)
  await showStatus(page, 'Localizando campos de login...');

  const dedup = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const userCandidates = dedup([
    loginConfig.selectors.username,
    autoDetectedSelectors.usernameField,
    '[name="email"]',
    '#username',
    '[name="username"]',
    'input[id*="user"]',
    'input[name*="user"]',
    'input[id*="email"]',
    'input[name*="email"]',
    'input[type="email"]',
    'input[type="text"]'
  ]);

  const passCandidates = dedup([
    loginConfig.selectors.password,
    autoDetectedSelectors.passwordField,
    '#senha',
    '[name="senha"]',
    '#password',
    '[name="password"]',
    'input[type="password"]'
  ]);

  // NOVO: quando LOGIN_FIND_TIMEOUT=0, não esperar; apenas checar uma vez
  const perTryUser = (LOGIN_FIND_TIMEOUT && LOGIN_FIND_TIMEOUT > 0) ? Math.max(300, Math.floor(LOGIN_FIND_TIMEOUT / Math.max(1, userCandidates.length))) : 0;
  let selUser = null, userFrame = null;
  for (const sel of userCandidates) {
    const found = await waitForSelectorInAnyFrame(page, sel, perTryUser);
    if (found.frame && found.handle) { selUser = sel; userFrame = found.frame; break; }
  }

  const perTryPass = (LOGIN_FIND_TIMEOUT && LOGIN_FIND_TIMEOUT > 0) ? Math.max(300, Math.floor(LOGIN_FIND_TIMEOUT / Math.max(1, passCandidates.length))) : 0;
  let selPass = null, passFrame = null;
  for (const sel of passCandidates) {
    const found = await waitForSelectorInAnyFrame(page, sel, perTryPass);
    if (found.frame && found.handle) { selPass = sel; passFrame = found.frame; break; }
  }

  const selSubmit = loginConfig.selectors.submit || autoDetectedSelectors.submitButton || 'button[type="submit"]';
  const cleanSelSubmit = selSubmit.includes(':contains(') ? 'button[type="submit"]' : selSubmit;

  // Preenche os campos com digitação real + eventos (robusto)
  await showStatus(page, 'Preenchendo e validando campos...');
  let userOk = true, passOk = true;

  if (selUser && userFrame) {
    userOk = await fillInputInFrame(userFrame, selUser, loginConfig.username);
    if (!userOk) userOk = await fillInputInFrame(userFrame, selUser, loginConfig.username);
  } else {
    userOk = false;
  }

  if (selPass && passFrame) {
    passOk = await fillInputInFrame(passFrame, selPass, loginConfig.password);
    if (!passOk) passOk = await fillInputInFrame(passFrame, selPass, loginConfig.password);
  } else {
    passOk = false;
  }

  if (!selUser || !userOk) {
    await showStatus(page, 'Falha ao preencher o e-mail/usuário.');
    console.log(chalk.red(`Não foi possível localizar/preencher o campo de e-mail/usuário.`));
    return false;
  }
  if (!selPass || !passOk) {
    await showStatus(page, 'Falha ao preencher a senha.');
    console.log(chalk.red(`Não foi possível localizar/preencher o campo de senha.`));
    return false;
  }

  await showStatus(page, 'Enviando credenciais...');

  // NOVO: prioridade para Enter no campo de senha (mais rápido)
  const tryPressEnter = async (frame, fieldSelector) => {
    try {
      const handle = await frame.$(fieldSelector);
      if (!handle) return false;
      await handle.press('Enter');
      // blur rápido para disparar validações
      await frame.$eval(fieldSelector, (input) => input.blur()).catch(() => {});
      return true;
    } catch { return false; }
  };

  // NOVO: enviar via form (requestSubmit) como segundo passo
  const trySubmitViaForm = async (frame, fieldSelector) => {
    try {
      const ok = await frame.$eval(fieldSelector, (input) => {
        const form = input.closest('form');
        if (!form) return false;
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
        return true;
      });
      return !!ok;
    } catch { return false; }
  };

  // Fallback: clique do submit
  const clickSubmitInFrame = async (frame) => {
    if (!frame) return false;
    if (selSubmit.includes(':contains(')) {
      const textMatch = selSubmit.match(/:contains\(['"]?(.*?)[\'"]?\)/i);
      const text = textMatch ? textMatch[1] : null;
      if (text) {
        const clicked = await clickButtonByTextInFrame(frame, text);
        if (clicked) return true;
      }
    } else {
      try { await frame.click(cleanSelSubmit); return true; } catch { /* ignore */ }
    }
    return false;
  };

  // Ordem: Enter -> requestSubmit -> clique
  let submitted = false;
  if (selPass && passFrame) submitted = await tryPressEnter(passFrame, selPass);
  if (!submitted && selPass && passFrame) submitted = await trySubmitViaForm(passFrame, selPass);
  if (!submitted && selUser && userFrame) submitted = await trySubmitViaForm(userFrame, selUser);
  if (!submitted) {
    submitted = await clickSubmitInFrame(userFrame || passFrame);
    if (!submitted) {
      for (const frame of page.frames()) {
        if (await clickSubmitInFrame(frame)) { submitted = true; break; }
      }
    }
  }

  // NOVO: espera curta pós-submit (evita networkidle2 demorado)
  const quickPostSubmitWait = async () => {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {}),
      page.waitForSelector('fuse-vertical-navigation', { timeout: 3000 }).catch(() => {}),
      new Promise(r => setTimeout(r, 600))
    ]);
  };
  await quickPostSubmitWait();

  // Verificação rápida de sucesso (rota OU shell da app OU sumiço do formulário)
  const targetPath = expectedPath;
  const maxWaitMs = (LOGIN_CONFIRM_TIMEOUT && LOGIN_CONFIRM_TIMEOUT > 0) ? LOGIN_CONFIRM_TIMEOUT : 3000; // rápido por padrão
  const start = Date.now();
  while ((Date.now() - start) < maxWaitMs) {
    try {
      const urlObj = new URL(page.url());
      const pathOk = urlObj.pathname === targetPath || urlObj.pathname.endsWith(targetPath);
      const markers = await page.evaluate((uSel, pSel) => {
        const inApp = !!document.querySelector('fuse-vertical-navigation');
        const userEl = uSel ? document.querySelector(uSel) : null;
        const passEl = pSel ? document.querySelector(pSel) : null;
        return { inApp, hasLogin: !!(userEl || passEl) };
      }, selUser, selPass);
      if (pathOk || (markers.inApp && !markers.hasLogin)) {
        await showStatus(page, 'Login realizado com sucesso.');
        console.log(chalk.green('Login confirmado rapidamente.'));
        return true;
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 150));
  }

  await showStatus(page, 'Não foi possível confirmar login.');
  console.log(chalk.yellow('Aviso: rota esperada não confirmada no tempo reduzido.'));
  return false;
}

// NOVO: destacar elemento com outline azul
export async function highlightElement(page, selector, color = '#1e90ff') {
  try {
    await page.evaluate((sel, col) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (!el.dataset.qaPrevOutline) el.dataset.qaPrevOutline = el.style.outline || '';
      if (!el.dataset.qaPrevOutlineOffset) el.dataset.qaPrevOutlineOffset = el.style.outlineOffset || '';
      el.style.outline = `3px solid ${col}`;
      el.style.outlineOffset = '2px';
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch {}
    }, selector, color);
  } catch {}
}

export async function clearElementHighlight(page, selector) {
  try {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const prevOutline = el.dataset.qaPrevOutline ?? '';
      const prevOffset = el.dataset.qaPrevOutlineOffset ?? '';
      el.style.outline = prevOutline;
      el.style.outlineOffset = prevOffset;
      delete el.dataset.qaPrevOutline;
      delete el.dataset.qaPrevOutlineOffset;
    }, selector);
  } catch {}
}

// NOVO: flag para habilitar/desabilitar screenshots (ENV: ENABLE_SCREENSHOTS=0|false)
export const ENABLE_SCREENSHOTS = (() => {
  const v = process.env.ENABLE_SCREENSHOTS;
  if (v == null) return true;
  return !(String(v).toLowerCase() === '0' || String(v).toLowerCase() === 'false');
})();

// NOVO: utilitário de screenshot (elemento)
export async function takeScreenshot(page, selector, fileName) {
  if (!ENABLE_SCREENSHOTS) {
    console.log('  Captura de tela desabilitada por flag (ENABLE_SCREENSHOTS).');
    return;
  }
  try {
    const elementHandle = await page.$(selector);
    if (elementHandle) {
      if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const screenshotPath = path.join(SCREENSHOT_DIR, fileName);
      await elementHandle.screenshot({ path: screenshotPath });
      console.log(`  ${chalk.gray('Screenshot salvo em:')} ${screenshotPath}`);
    } else {
      console.log(`  ${chalk.yellow('Aviso:')} Não foi possível encontrar o elemento ${selector} para o screenshot.`);
    }
  } catch (error) {
    console.log(`  ${chalk.red('Erro ao tirar screenshot:')}`, (error && error.message) ? error.message.split('\n')[0] : error);
  }
}

// NOVO: prepara browser/page, listeners e login
export async function prepareBrowserPage(url, launchOptions = {}, loginConfig = null) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Opções do Puppeteer do .env
  const ENV_HEADLESS = toBool(process.env.HEADLESS, false);
  const ENV_SLOWMO = toNum(process.env.SLOWMO, 50);
  const ENV_MAXIMIZE = toBool(process.env.MAXIMIZE, true);
  const ENV_VIEWPORT_W = toNum(process.env.VIEWPORT_WIDTH, 1920);
  const ENV_VIEWPORT_H = toNum(process.env.VIEWPORT_HEIGHT, 1080);

  // NOVO: args e viewport específicos para headless
  const args = [
    ...(launchOptions.args || []),
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
  ];
  if (ENV_HEADLESS || !ENV_MAXIMIZE) {
    args.push(`--window-size=${ENV_VIEWPORT_W},${ENV_VIEWPORT_H}`);
  } else {
    args.push('--start-maximized');
  }

  const browser = await puppeteer.launch({
    headless: ENV_HEADLESS,
    defaultViewport: ENV_HEADLESS
      ? { width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H }   // headless: força viewport grande
      : (ENV_MAXIMIZE ? null : { width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H }),
    slowMo: ENV_SLOWMO,
    ...launchOptions,
    args
  });
  const page = await browser.newPage();

  // NOVO: user-agent real para evitar bloqueios no headless
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    );
  } catch {}

  if (!ENV_HEADLESS && !ENV_MAXIMIZE) {
    await page.setViewport({ width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H });
  }

  // Desabilitar timeouts globais
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  // Espelhar console do browser
  page.on('console', msg => {
    try { console.log(`[browser] ${msg.text()}`); } catch {}
  });

  const requestErrors = [];

  page.on('response', response => {
    try {
      if (!response.ok()) {
        requestErrors.push({ type: 'HTTP Error', status: response.status(), url: response.url() });
      }
    } catch {}
  });

  page.on('requestfailed', request => {
    try {
      requestErrors.push({ type: 'Network Failure', url: request.url(), error: request.failure() ? request.failure().errorText : 'unknown' });
    } catch {}
  });

  try {
    await showStatus(page, loginConfig ? 'Iniciando login...' : 'Carregando página alvo...');
    if (loginConfig && !toBool(process.env.SKIP_LOGIN, false)) {
      await performLogin(page, loginConfig);
    } else if (toBool(process.env.SKIP_LOGIN, false)) {
      console.log(chalk.blue('Login pulado - navegando diretamente para a URL alvo.'));
    }
    await page.goto(url, { waitUntil: 'networkidle2' });
    await showStatus(page, 'Página carregada.');
  } catch (error) {
    await browser.close();
    throw new Error(`Não foi possível carregar a URL: ${url} — ${error.message}`);
  }

  return { browser, page, requestErrors };
}

// NOVO: carregador unificado de links (TS/JS/JSON)
export async function loadLinksMap() {
  const tsPath = path.join(__dirname, 'links_map.ts');
  const jsPath = path.join(__dirname, 'links_map.js');
  const jsonPath = path.join(__dirname, 'links_map.json');

  const tryImportModule = async (absPath) => {
    try {
      if (!fs.existsSync(absPath)) return null;
      const moduleUrl = pathToFileURL(absPath).href;
      const mod = await import(moduleUrl);
      const links = mod.default || mod.linksMap || mod;
      return Array.isArray(links) ? links : null;
    } catch {
      return null;
    }
  };

  const loadLinksFromTs = (absPath) => {
    try {
      if (!fs.existsSync(absPath)) return null;
      const src = fs.readFileSync(absPath, 'utf8');

      // Extrai o primeiro array literal do arquivo (tolerante a comentários)
      const extractArrayLiteral = (code) => {
        let startSearch = code.indexOf('linksMap');
        if (startSearch < 0) startSearch = 0;
        let inS = false, inD = false, inT = false;
        let inLC = false, inBC = false, esc = false;
        let depth = 0, start = -1, end = -1;

        for (let i = startSearch; i < code.length; i++) {
          const ch = code[i], nx = code[i + 1];

          if (inLC) { if (ch === '\n' || ch === '\r') inLC = false; continue; }
          if (inBC) { if (ch === '*' && nx === '/') { inBC = false; i++; } continue; }

          if (inS) { if (!esc && ch === '\'') inS = false; esc = ch === '\\' && !esc; continue; }
          if (inD) { if (!esc && ch === '"') inD = false; esc = ch === '\\' && !esc; continue; }
          if (inT) { if (!esc && ch === '`') inT = false; esc = ch === '\\' && !esc; continue; }

          if (ch === '/' && nx === '/') { inLC = true; i++; continue; }
          if (ch === '/' && nx === '*') { inBC = true; i++; continue; }

          if (ch === '[') { if (depth === 0) start = i; depth++; continue; }
          if (ch === ']') { depth--; if (depth === 0) { end = i; break; } continue; }
        }
        if (start >= 0 && end > start) return code.slice(start, end + 1);
        return null;
      };

      const stripCommentsPreserveStrings = (code) => {
        let out = '';
        let inS = false, inD = false, inT = false;
        let inLC = false, inBC = false, esc = false;

        for (let i = 0; i < code.length; i++) {
          const ch = code[i], nx = code[i + 1];

          if (inLC) { if (ch === '\n' || ch === '\r') { inLC = false; out += ch; } continue; }
          if (inBC) { if (ch === '*' && nx === '/') { inBC = false; i++; } continue; }

          if (inS) { out += ch; if (!esc && ch === '\'') inS = false; esc = ch === '\\' && !esc; continue; }
          if (inD) { out += ch; if (!esc && ch === '"') inD = false; esc = ch === '\\' && !esc; continue; }
          if (inT) { out += ch; if (!esc && ch === '`') inT = false; esc = ch === '\\' && !esc; continue; }

          if (ch === '/' && nx === '/') { inLC = true; i++; continue; }
          if (ch === '/' && nx === '*') { inBC = true; i++; continue; }

          if (ch === '\'') { inS = true; esc = false; out += ch; continue; }
          if (ch === '"') { inD = true; esc = false; out += ch; continue; }
          if (ch === '`') { inT = true; esc = false; out += ch; continue; }

          out += ch;
        }
        return out;
      };

      const arrayRaw = extractArrayLiteral(src);
      if (!arrayRaw) return null;

      let jsonLike = stripCommentsPreserveStrings(arrayRaw);
      // remove vírgula antes de } ou ] (trailing commas)
      jsonLike = jsonLike.replace(/,\s*(?=[}\]])/g, '');

      const linksArr = JSON.parse(jsonLike);
      return Array.isArray(linksArr) ? linksArr : null;
    } catch {
      return null;
    }
  };

  let links = await tryImportModule(tsPath) || await tryImportModule(jsPath);
  let source = null;

  if (links && Array.isArray(links)) {
    source = fs.existsSync(jsPath) ? 'links_map.js' : 'links_map.ts (module)';
  } else {
    links = loadLinksFromTs(tsPath);
    if (links && Array.isArray(links)) {
      source = 'links_map.ts (parsed)';
    } else if (fs.existsSync(jsonPath)) {
      links = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      source = 'links_map.json';
    }
  }

  if (links && Array.isArray(links)) {
    const seen = new Set();
    links = links.filter(l => l && l.href && !seen.has(l.href) && seen.add(l.href));
  }

  return { links: Array.isArray(links) ? links : [], source };
}