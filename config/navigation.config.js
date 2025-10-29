// Configurações de navegação para diferentes tipos de aplicação

export const navigationConfigs = {
  // Configuração genérica para a maioria das aplicações
  generic: {
    mainPanelSelector: 'nav, .navigation, .sidebar, .menu, [role="navigation"]',
    mainItemsSelector: 'a, .nav-item, .menu-item, li',
    asideWrapperSelector: '.submenu, .dropdown-menu, .nested-menu, .sub-navigation',
    finalLinkSelector: 'a[href]',
    collapsableSelector: '.collapsed, .expandable, .has-submenu, [aria-expanded="false"]',
    clickTargetSelector: 'a, button, .clickable, [role="button"]'
  },

  // Configuração para aplicações Angular com Fuse template
  angular_fuse: {
    mainPanelSelector: 'fuse-vertical-navigation > div.fuse-vertical-navigation-wrapper > div.fuse-vertical-navigation-content',
    mainItemsSelector: 'fuse-vertical-navigation-basic-item, fuse-vertical-navigation-aside-item',
    asideWrapperSelector: 'div.fuse-vertical-navigation-aside-wrapper > fuse-vertical-navigation-aside-item > div.fuse-vertical-navigation-item-children',
    finalLinkSelector: 'fuse-vertical-navigation-basic-item a',
    collapsableSelector: 'fuse-vertical-navigation-collapsable-item.fuse-vertical-navigation-item-collapsed > a, fuse-vertical-navigation-collapsable-item.fuse-vertical-navigation-item-collapsed > div > div',
    clickTargetSelector: 'div > div'
  },

  // Configuração para Bootstrap/Material UI
  bootstrap: {
    mainPanelSelector: '.navbar-nav, .nav, .sidebar-nav',
    mainItemsSelector: '.nav-item, .nav-link',
    asideWrapperSelector: '.dropdown-menu, .collapse',
    finalLinkSelector: '.nav-link[href], .dropdown-item[href]',
    collapsableSelector: '.collapsed[data-bs-toggle], [aria-expanded="false"]',
    clickTargetSelector: 'a, button, [data-bs-toggle]'
  },

  // Configuração para React/Next.js comum
  react: {
    mainPanelSelector: 'nav, [role="navigation"], .navigation',
    mainItemsSelector: 'a, li, .nav-item',
    asideWrapperSelector: '.submenu, .dropdown, .nested',
    finalLinkSelector: 'a[href]',
    collapsableSelector: '.closed, [aria-expanded="false"]',
    clickTargetSelector: 'a, button, .toggle'
  }
};

// Função para obter configuração baseada no tipo
export function getNavigationConfig(type = 'generic') {
  return navigationConfigs[type] || navigationConfigs.generic;
}

export default navigationConfigs;
