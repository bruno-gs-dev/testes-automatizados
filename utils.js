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
const LOGIN_DEBUG = toBool(process.env.LOGIN_DEBUG, false);
const LOGIN_REQUIRED = toBool(process.env.LOGIN_REQUIRED, false);
const IGNORE_NETWORK_FAILURE = toBool(process.env.IGNORE_NETWORK_FAILURE, false);

// NOVO: configurações de sessão
const POST_LOGIN_WAIT = toNum(process.env.POST_LOGIN_WAIT, 3000);
const NAVIGATION_DELAY = toNum(process.env.NAVIGATION_DELAY, 2000);

// Lidos do .env - REMOVIDO: URL específica hardcoded
export const URL_ALVO = process.env.URL_ALVO || 'https://exemplo.com/app';

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

// Função helper para limpar valores do .env (remove \r\n\t e espaços)
const cleanEnvValue = (value) => value ? value.replace(/[\r\n\t]/g, '').trim() : '';

// Fallback: ler valor direto do arquivo .env quando process.env vier vazio (robusto em Windows)
function getEnvSelector(key, defaultValue) {
  const fromEnv = cleanEnvValue(process.env[key]);
  if (fromEnv) return fromEnv;
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return defaultValue;
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\n|\r\n?/);
    for (let rawLine of lines) {
      if (!rawLine) continue;
      const line = String(rawLine).trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const k = line.slice(0, eqIdx).trim();
      if (k !== key) continue;
      let val = line.slice(eqIdx + 1);
      // remover comentários inline e aspas
      const hashIdx = val.indexOf('#');
      if (hashIdx >= 0) val = val.slice(0, hashIdx);
      val = val.replace(/["']/g, '').replace(/[\r\n\t]/g, '').trim();
      if (val) return val;
    }
  } catch { /* ignore */ }
  return defaultValue;
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
    // Preferir valores do .env; se vierem vazios por parsing em Windows, tentar ler direto do arquivo .env
    username: getEnvSelector('LOGIN_SELECTOR_USERNAME', '#form_j_username'),
    password: getEnvSelector('LOGIN_SELECTOR_PASSWORD', '#form_j_password'),
    // Removido :contains do default (não é suportado em querySelector)
    submit: getEnvSelector('LOGIN_SELECTOR_SUBMIT', '#form_0')
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
        el.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;background:rgba(0, 0, 255, 1);backdrop-filter:saturate(120%);color:#fff;font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:8px 10px;border-radius:6px;box-shadow:0 2px 6px rgba(0, 0, 0, 1);pointer-events:none'; // NOVO: pointer-events none
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
      try { i.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch { }
    }).catch(() => { });

    await el.focus().catch(() => { });
    await el.click({ clickCount: 3 }).catch(() => { });

    // limpa via JS e dispara eventos
    await frame.evaluate((sel) => {
      const i = document.querySelector(sel);
      if (!i) return;
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector);

    // digita com delay
    await frame.type(selector, value, { delay: 20 }).catch(() => { });

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
        await h.click().catch(() => { });
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
      generic_navbar: !!document.querySelector('#navigation'),
      sidebar: !!document.querySelector('.sidebar, .side-nav'),
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

// ATUALIZADO: função de login mais genérica - CORRIGIDO: melhor estabilização da sessão
export async function performLogin(page, loginConfig) {
  const baseUrl = loginConfig.url;
  const expectedPath = loginConfig.expectedPath || '/';

  // NOVO: Verificar se o login deve ser pulado
  if (toBool(process.env.SKIP_LOGIN, false)) {
    console.log(chalk.blue('Login pulado por configuração (SKIP_LOGIN=true).'));
    return true;
  }

  // CORRIGIDO: Verificar se login é necessário (obrigatório vs opcional)
  if (!loginConfig.username || !loginConfig.password) {
    if (LOGIN_REQUIRED) {
      console.log(chalk.red('❌ ERRO: Credenciais de login não fornecidas, mas LOGIN_REQUIRED=true'));
      return false;
    } else {
      console.log(chalk.yellow('Aviso: Credenciais de login não fornecidas. Pulando login.'));
      return true;
    }
  }

  if (LOGIN_DEBUG) console.log(chalk.gray('[LOGIN] Iniciando processo de login'));
  await showStatus(page, 'Acessando tela de login...');
  if (LOGIN_DEBUG) console.log(chalk.gray(`[LOGIN] URL base: ${baseUrl}`));
  await page.goto(baseUrl, { waitUntil: 'networkidle2' }).catch(() => { });

  if (LOGIN_DEBUG) console.log(chalk.gray('[LOGIN] Coletando possíveis seletores automaticamente...'));
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

  if (LOGIN_DEBUG) {
    console.log(chalk.gray(`[LOGIN] auto.usernameField = ${autoDetectedSelectors.usernameField || 'n/d'}`));
    console.log(chalk.gray(`[LOGIN] auto.passwordField = ${autoDetectedSelectors.passwordField || 'n/d'}`));
    console.log(chalk.gray(`[LOGIN] auto.submitButton = ${autoDetectedSelectors.submitButton || 'n/d'}`));
  }
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

  // NOVO: garantir seleção dos campos (restaurado)
  const perTryUser = (LOGIN_FIND_TIMEOUT && LOGIN_FIND_TIMEOUT > 0)
    ? Math.max(300, Math.floor(LOGIN_FIND_TIMEOUT / Math.max(1, userCandidates.length)))
    : 0;
  let selUser = null, userFrame = null;
  for (const sel of userCandidates) {
    const found = await waitForSelectorInAnyFrame(page, sel, perTryUser);
    if (found.frame && found.handle) { selUser = sel; userFrame = found.frame; break; }
  }

  const perTryPass = (LOGIN_FIND_TIMEOUT && LOGIN_FIND_TIMEOUT > 0)
    ? Math.max(300, Math.floor(LOGIN_FIND_TIMEOUT / Math.max(1, passCandidates.length)))
    : 0;
  let selPass = null, passFrame = null;
  for (const sel of passCandidates) {
    const found = await waitForSelectorInAnyFrame(page, sel, perTryPass);
    if (found.frame && found.handle) { selPass = sel; passFrame = found.frame; break; }
  }

  // CORRIGIDO: Priorizar seletor do .env se disponível e válido
  // NOVO: Trim agressivo para remover \r\n e espaços
  const rawSubmitSel = loginConfig.selectors.submit;
  const cleanSubmitSel = rawSubmitSel ? rawSubmitSel.replace(/[\r\n\t]/g, '').trim() : null;
  
  const envSubmitSel = cleanSubmitSel &&
    cleanSubmitSel.length > 0 &&
    !cleanSubmitSel.includes(':contains(')
    ? cleanSubmitSel
    : null;

  // Fallback detectado no DOM (autodetect + padrões)
  const submitFallbackCandidates = [
    autoDetectedSelectors.submitButton,
    'button[type="submit"]',
    'input[type="submit"]',
    '.login',
    'button'
  ].filter(Boolean);

  let autoSubmitSel = null;
  for (const sel of submitFallbackCandidates) {
    try {
      const found = await page.$(sel);
      if (found) { autoSubmitSel = sel; break; }
    } catch { /* ignore */ }
  }

  if (LOGIN_DEBUG) {
    console.log(chalk.gray(`[LOGIN] Submit preferido (env): ${envSubmitSel || 'n/d'}`));
    console.log(chalk.gray(`[LOGIN] Submit detectado (fallback): ${autoSubmitSel || 'n/d'}`));
  }

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

  if (LOGIN_DEBUG) {
    console.log(chalk.gray(`[LOGIN] Resultado preenchimento usuário: ${userOk}`));
    console.log(chalk.gray(`[LOGIN] Resultado preenchimento senha: ${passOk}`));
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

  // NOVO: estratégias reordenadas — ENV primeiro, depois texto, depois detectado
  const submitStrategies = [
    // 1) Clique no seletor do .env (preferido) - MELHORADO para input[type="submit"]
    async () => {
      if (!envSubmitSel) return false;
      if (LOGIN_DEBUG) console.log(chalk.gray(`Tentativa 1: Clique no seletor ENV ${envSubmitSel}`));
      try {
        // NOVO: Verificar se o elemento existe e obter informações detalhadas
        const elementInfo = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);
          
          return {
            exists: true,
            tagName: el.tagName.toLowerCase(),
            type: el.type || '',
            value: el.value || '',
            className: el.className || '',
            disabled: el.disabled || el.hasAttribute('disabled'),
            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            rect: {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              left: rect.left
            }
          };
        }, envSubmitSel);

        if (!elementInfo) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`  Elemento ${envSubmitSel} não encontrado`));
          return false;
        }

        if (LOGIN_DEBUG) {
          console.log(chalk.gray(`  Elemento encontrado: ${elementInfo.tagName}[type="${elementInfo.type}"]`));
          console.log(chalk.gray(`  Visível: ${elementInfo.visible}, Desabilitado: ${elementInfo.disabled}`));
        }

        if (elementInfo.disabled) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`  Elemento ${envSubmitSel} está desabilitado`));
          return false;
        }

        if (!elementInfo.visible) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`  Elemento ${envSubmitSel} não está visível`));
          return false;
        }

        // NOVO: Estratégias específicas para input[type="submit"]
        if (elementInfo.tagName === 'input' && elementInfo.type === 'submit') {
          // Estratégia 1: Clique via JavaScript (mais confiável para inputs)
          const jsClickSuccess = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            
            try {
              // Garantir que está na viewport
              el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
              
              // Para input[type="submit"], simular clique do mouse
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0
              });
              
              el.dispatchEvent(event);
              return true;
            } catch (e) {
              console.log('JS Click error:', e.message);
              return false;
            }
          }, envSubmitSel);

          if (jsClickSuccess) {
            if (LOGIN_DEBUG) console.log(chalk.gray(`  ✓ Clique JS bem-sucedido em input[type="submit"]`));
            return true;
          }

          // Estratégia 2: Submit do form via input
          const formSubmitSuccess = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            
            try {
              const form = el.closest('form') || el.form;
              if (form) {
                if (typeof form.requestSubmit === 'function') {
                  form.requestSubmit(el); // Passa o botão como submitter
                } else {
                  form.submit();
                }
                return true;
              }
              return false;
            } catch (e) {
              console.log('Form Submit error:', e.message);
              return false;
            }
          }, envSubmitSel);

          if (formSubmitSuccess) {
            if (LOGIN_DEBUG) console.log(chalk.gray(`  ✓ Form submit bem-sucedido via input`));
            return true;
          }
        }

        // Fallback: Puppeteer click com wait
        try {
          await page.waitForSelector(envSubmitSel, { visible: true, timeout: 2000 });
          await page.click(envSubmitSel, { delay: 100 });
          if (LOGIN_DEBUG) console.log(chalk.gray(`  ✓ Clique Puppeteer bem-sucedido`));
          return true;
        } catch (clickErr) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`  Erro no clique Puppeteer: ${clickErr.message}`));
        }

        // Último recurso: Foco + Enter
        try {
          await page.focus(envSubmitSel);
          await page.keyboard.press('Enter');
          if (LOGIN_DEBUG) console.log(chalk.gray(`  ✓ Enter após foco bem-sucedido`));
          return true;
        } catch (enterErr) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`  Erro no Enter: ${enterErr.message}`));
        }

        return false;
      } catch (e) {
        if (LOGIN_DEBUG) console.log(chalk.yellow(`  Erro na estratégia ENV: ${e.message}`));
        return false;
      }
    },

    // 2) Clique por texto - MELHORADO para incluir inputs
    async () => {
      if (LOGIN_DEBUG) console.log(chalk.gray('Tentativa 2: Busca por texto do botão'));
      const textVariations = ['logar', 'entrar', 'login', 'sign in', 'conectar', 'acessar', 'submit'];
      
      for (const text of textVariations) {
        const clicked = await page.evaluate((searchText) => {
          // NOVO: Incluir input[type="submit"] na busca por texto
          const elements = document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]');
          
          for (const el of elements) {
            const btnText = (el.innerText || el.textContent || el.value || '').toLowerCase();
            const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            const disabled = el.disabled || el.hasAttribute('disabled');

            if (visible && !disabled && btnText.includes(searchText)) {
              try {
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                
                // Para inputs, usar evento de mouse
                if (el.tagName.toLowerCase() === 'input') {
                  const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0
                  });
                  el.dispatchEvent(event);
                } else {
                  el.click();
                }
                return true;
              } catch {
                return false;
              }
            }
          }
          return false;
        }, text);
        
        if (clicked) {
          if (LOGIN_DEBUG) console.log(chalk.gray(`  ✓ Clicou em elemento com texto contendo "${text}"`));
          return true;
        }
      }
      return false;
    },

    // 3) Clique no seletor detectado (fallback) - SEM MUDANÇAS
    async () => {
      if (!autoSubmitSel) return false;
      if (LOGIN_DEBUG) console.log(chalk.gray(`Tentativa 3: Clique no seletor detectado ${autoSubmitSel}`));
      try {
        const jsClickSuccess = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;

          const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          const isDisabled = el.disabled || el.hasAttribute('disabled');

          if (!isVisible || isDisabled) return false;

          try {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            
            // Usar evento de mouse para inputs
            if (el.tagName.toLowerCase() === 'input') {
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0
              });
              el.dispatchEvent(event);
            } else {
              el.click();
            }
            return true;
          } catch {
            return false;
          }
        }, autoSubmitSel);

        if (jsClickSuccess) return true;

        // Fallback Puppeteer
        await page.click(autoSubmitSel, { delay: 100 });
        return true;
      } catch {
        return false;
      }
    },

    // 4) Form submit via campo de senha - SEM MUDANÇAS
    async () => {
      if (LOGIN_DEBUG) console.log(chalk.gray('Tentativa 4: Form submit via campo de senha'));
      try {
        if (!selPass || !passFrame) return false;
        const ok = await passFrame.$eval(selPass, (input) => {
          const form = input.closest('form');
          if (!form) return false;
          try {
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.submit();
            return true;
          } catch {
            return false;
          }
        });
        return !!ok;
      } catch { return false; }
    },

    // 5) Enter no campo de senha - SEM MUDANÇAS
    async () => {
      if (LOGIN_DEBUG) console.log(chalk.gray('Tentativa 5: Enter no campo de senha'));
      try {
        if (!selPass || !passFrame) return false;
        const handle = await passFrame.$(selPass);
        if (!handle) return false;
        await handle.press('Enter');
        await passFrame.$eval(selPass, (input) => input.blur()).catch(() => { });
        return true;
      } catch { return false; }
    },
  ];

  // NOVO: executar estratégias uma por uma até uma funcionar
  let submitted = false;
  for (let i = 0; i < submitStrategies.length && !submitted; i++) {
    try {
      submitted = await submitStrategies[i]();
      if (submitted) {
        if (LOGIN_DEBUG) console.log(chalk.green(`✓ Submit realizado com sucesso na tentativa ${i + 1}`));
        break;
      }
    } catch (e) {
      if (LOGIN_DEBUG) console.log(chalk.yellow(`Tentativa ${i + 1} falhou: ${e.message}`));
    }
  }

  if (!submitted) {
    if (LOGIN_DEBUG) console.log(chalk.red('[LOGIN] Nenhuma estratégia de submit obteve sucesso'));
    console.log(chalk.red('✖ Todas as tentativas de submit falharam'));
    return false;
  }

  // NOVO: espera curta pós-submit (evita networkidle2 demorado)
  const quickPostSubmitWait = async () => {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => { }),
      page.waitForSelector('fuse-vertical-navigation', { timeout: 3000 }).catch(() => { }),
      new Promise(r => setTimeout(r, 600))
    ]);
  };
  await quickPostSubmitWait();

  if (LOGIN_DEBUG) console.log(chalk.gray('[LOGIN] Verificando sucesso de login...'));

  // CORRIGIDO: Verificação mais rigorosa com timeout maior para sistemas lentos
  const targetPath = expectedPath;
  const maxWaitMs = Math.max(LOGIN_CONFIRM_TIMEOUT || 5000, 8000); // Mínimo 8 segundos
  const start = Date.now();

  let lastLoggedUrl = '';
  let consecutiveLoginDetections = 0;

  while ((Date.now() - start) < maxWaitMs) {
    try {
      const currentUrl = page.url();

      // NOVO: Verificar se caiu em página de sessão expirada ou erro
      if (currentUrl.includes('/sessao/expirada') || currentUrl.includes('/login') || currentUrl.includes('/error')) {
        if (currentUrl !== lastLoggedUrl) {
          if (LOGIN_DEBUG) console.log(chalk.yellow(`Detectada página de sessão/login: ${currentUrl}`));
          lastLoggedUrl = currentUrl;
          consecutiveLoginDetections = 1;
        } else {
          consecutiveLoginDetections++;
          if (consecutiveLoginDetections >= 2) { // REDUZIDO de 3 para 2
            if (LOGIN_DEBUG) console.log(chalk.red(`[LOGIN] Muitas tentativas na mesma URL de login. Parando verificação.`));
            break;
          }
        }

        await new Promise(r => setTimeout(r, 200));
        continue;
      }

      // NOVO: resetar contador se saiu das páginas de login
      if (consecutiveLoginDetections > 0) {
        consecutiveLoginDetections = 0;
        lastLoggedUrl = '';
      }

      // CORRIGIDO: Verificação mais específica de sucesso
      const urlObj = new URL(currentUrl);
      const pathOk = urlObj.pathname === targetPath ||
        urlObj.pathname.endsWith(targetPath.split('/').pop()) ||
        currentUrl.includes('/pages/') ||
        currentUrl.includes('/app/') ||
        currentUrl.includes('/inicio') ||
        currentUrl.includes('/home');

      const markers = await page.evaluate((uSel, pSel) => {
        const inApp = !!document.querySelector('fuse-vertical-navigation') ||
          !!document.querySelector('#app') ||
          !!document.querySelector('.app') ||
          !!document.querySelector('[class*="main"]') ||
          window.location.pathname.includes('/pages/') ||
          window.location.pathname.includes('/app/');
        const userEl = uSel ? document.querySelector(uSel) : null;
        const passEl = pSel ? document.querySelector(pSel) : null;
        const hasLoginForm = !!(userEl || passEl);

        return { inApp, hasLogin: hasLoginForm, currentPath: window.location.pathname };
      }, selUser, selPass);

      if (LOGIN_DEBUG && currentUrl !== lastLoggedUrl) {
        console.log(chalk.gray(`Debug login - URL: ${currentUrl}, inApp: ${markers.inApp}, hasLogin: ${markers.hasLogin}`));
        lastLoggedUrl = currentUrl;
      }

      if (pathOk || (markers.inApp && !markers.hasLogin)) {
        await showStatus(page, 'Login realizado com sucesso.');
        console.log(chalk.green('✅ Login confirmado com sucesso!'));
        
        // NOVO: Aguardar um tempo após login para estabilizar a sessão
        if (POST_LOGIN_WAIT > 0) {
          if (LOGIN_DEBUG) console.log(chalk.gray(`[LOGIN] Aguardando ${POST_LOGIN_WAIT}ms para estabilizar sessão...`));
          await new Promise(r => setTimeout(r, POST_LOGIN_WAIT));
          
          // NOVO: Verificar se a sessão ainda está válida após a espera
          const sessionUrl = page.url();
          if (sessionUrl.includes('/login') || sessionUrl.includes('/sessao/expirada')) {
            if (LOGIN_DEBUG) console.log(chalk.yellow(`[LOGIN] Sessão expirou durante a espera: ${sessionUrl}`));
            return false;
          }
        }
        
        return true;
      }

    } catch (e) {
      if (LOGIN_DEBUG) console.log(chalk.gray(`Erro na verificação de login: ${e.message}`));
    }

    await new Promise(r => setTimeout(r, 1000)); // Aumentado de 800ms para 1s
  }

  const finalUrl = page.url();
  await showStatus(page, 'Verificação de login finalizada.');

  // CORRIGIDO: Verificação final mais rigorosa
  const isLoginPage = finalUrl.includes('/login') || finalUrl.includes('/sessao/expirada');
  const isAppPage = finalUrl.includes('/pages/') || finalUrl.includes('/app/') || finalUrl.includes('/inicio');

  if (isAppPage && !isLoginPage) {
    if (LOGIN_DEBUG) console.log(chalk.green('✅ Login provavelmente bem-sucedido (detectada rota da aplicação).'));
    return true;
  }

  // NOVO: Se login é obrigatório e falhou, mostrar erro claro
  if (LOGIN_REQUIRED && isLoginPage) {
    console.log(chalk.red.bold('❌ ERRO CRÍTICO: Login obrigatório falhou!'));
    console.log(chalk.red(`   URL final: ${finalUrl}`));
    console.log(chalk.red('   O sistema não pode continuar acessar a autenticação.'));
    return false;
  }

  if (LOGIN_DEBUG) console.log(chalk.yellow(`⚠️  Aviso: Login pode não ter sido confirmado. URL final: ${finalUrl}`));

  // NOVO: Se não é obrigatório, continua mesmo com falha
  if (!LOGIN_REQUIRED) {
    if (LOGIN_DEBUG) console.log(chalk.blue('Continuando execução (login não obrigatório)...'));
    return true;
  }

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
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch { }
    }, selector, color);
  } catch { }
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
  } catch { }
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

// NOVO: prepara browser/page, listeners e login - CORRIGIDO: evitar dupla navegação
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
  } catch { }

  if (!ENV_HEADLESS && !ENV_MAXIMIZE) {
    await page.setViewport({ width: ENV_VIEWPORT_W, height: ENV_VIEWPORT_H });
  }

  // Desabilitar timeouts globais
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);

  // Espelhar console do browser
  page.on('console', msg => {
    try { console.log(`[browser] ${msg.text()}`); } catch { }
  });

  const requestErrors = [];

  page.on('response', response => {
    try {
      if (!response.ok()) {
        requestErrors.push({ type: 'HTTP Error', status: response.status(), url: response.url() });
      }
    } catch { }
  });

  page.on('requestfailed', request => {
    try {
      // NOVO: respeitar flag para ignorar "Network Failure"
      if (IGNORE_NETWORK_FAILURE) return;
      requestErrors.push({ type: 'Network Failure', url: request.url(), error: request.failure() ? request.failure().errorText : 'unknown' });
    } catch { }
  });

  try {
    await showStatus(page, loginConfig ? 'Iniciando login...' : 'Carregando página alvo...');

    if (loginConfig && !toBool(process.env.SKIP_LOGIN, false)) {
      const loginSuccess = await performLogin(page, loginConfig);
      if (!loginSuccess) {
        // NOVO: Se login é obrigatório e falhou, encerrar imediatamente
        if (LOGIN_REQUIRED) {
          await browser.close();
          throw new Error('Login obrigatório falhou - não é possível continuar');
        } else {
          console.log(chalk.yellow('Login falhou, mas continuando execução (não obrigatório)...'));
          console.log(chalk.gray(`Navegando para URL alvo: ${url}`));
          await page.goto(url, { waitUntil: 'networkidle2' });
        }
      } else {
        // Login bem-sucedido - verificar se precisa navegar
        const currentUrl = page.url();
        const targetUrl = new URL(url);
        const currentPath = new URL(currentUrl).pathname;
        const targetPath = targetUrl.pathname;

        if (currentPath !== targetPath && !currentUrl.includes(targetPath)) {
          console.log(chalk.gray(`Navegando para URL alvo específica: ${url}`));
          
          // NOVO: Aguardar antes de navegar para não perder a sessão
          await safeNavigationDelay();
          
          // NOVO: Verificar se sessão ainda é válida antes de navegar
          const preNavUrl = page.url();
          if (preNavUrl.includes('/login') || preNavUrl.includes('/sessao/expirada')) {
            throw new Error(`Sessão perdida antes de navegar para URL alvo: ${preNavUrl}`);
          }
          
          await page.goto(url, { waitUntil: 'networkidle2' });
          
          // NOVO: Verificar se não foi redirecionado para login após navegação
          const postNavUrl = page.url();
          if (postNavUrl.includes('/login') || postNavUrl.includes('/sessao/expirada')) {
            throw new Error(`Redirecionado para login após navegar: ${postNavUrl}`);
          }
        } else {
          console.log(chalk.gray(`✅ Já na página correta após login: ${currentUrl}`));
        }
      }
    } else if (toBool(process.env.SKIP_LOGIN, false)) {
      console.log(chalk.blue('Login pulado - navegando diretamente para a URL alvo.'));
      await page.goto(url, { waitUntil: 'networkidle2' });
    } else {
      await page.goto(url, { waitUntil: 'networkidle2' });
    }

    // NOVO: Verificação final mais rigorosa com detalhes
    const finalUrl = page.url();
    if (LOGIN_REQUIRED && (finalUrl.includes('/sessao/expirada') || finalUrl.includes('/login'))) {
      throw new Error(`Sistema requer login mas redirecionou para: ${finalUrl}`);
    }

    // NOVO: Aguardar um pouco para garantir que a página esteja estável
    await new Promise(r => setTimeout(r, 1000));
    
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