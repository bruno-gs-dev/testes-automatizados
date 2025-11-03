// Configurações de navegação para diferentes tipos de aplicação

export const navigationConfigs = {
  // Configuração genérica para a maioria das aplicações
  generic: {
    mainPanelSelector: '#navigation, nav, .navbar, .menu',
    mainItemsSelector: 'a[href]:not([href="#"]):not([href=""])',
    asideWrapperSelector: '.dropdown-menu, .submenu',
    finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
    collapsableSelector: '.dropdown, .has-submenu',
    clickTargetSelector: 'a'
  },

  // Configuração para aplicações Angular com Fuse template
  angular_fuse: {
    mainPanelSelector: 'fuse-vertical-navigation',
    mainItemsSelector: 'fuse-vertical-navigation-aside-item',
    asideWrapperSelector: '.fuse-vertical-navigation-aside-wrapper',
    finalLinkSelector: 'a',
    collapsableSelector: '.fuse-vertical-navigation-item',
    clickTargetSelector: 'div > div'
  },

  // NOVO: Configuração para navbar genérica com #navigation
  generic_navbar: {
    mainPanelSelector: '#navigation',
    mainItemsSelector: '#navigation a[href]:not([href="#"]):not([href=""])',
    asideWrapperSelector: '.dropdown-menu, .submenu, .sub-nav',
    finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
    collapsableSelector: '.dropdown, .has-submenu, .has-children',
    clickTargetSelector: 'a, .dropdown-toggle, .menu-toggle'
  },

  // NOVO: Bootstrap navbar
  bootstrap: {
    mainPanelSelector: '.navbar-nav, #navigation, nav',
    mainItemsSelector: '.navbar-nav a[href]:not([href="#"]):not([href=""]), #navigation a[href]:not([href="#"]):not([href=""]), nav a[href]:not([href="#"]):not([href=""])',
    asideWrapperSelector: '.dropdown-menu',
    finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
    collapsableSelector: '.dropdown',
    clickTargetSelector: 'a'
  },

  // NOVO: Sidebar genérico
  sidebar: {
    mainPanelSelector: '#navigation, .sidebar, .side-nav',
    mainItemsSelector: '#navigation a[href]:not([href="#"]):not([href=""]), .sidebar a[href]:not([href="#"]):not([href=""]), .side-nav a[href]:not([href="#"]):not([href=""])',
    asideWrapperSelector: '.sub-menu, .submenu',
    finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
    collapsableSelector: '.has-submenu, .expandable',
    clickTargetSelector: 'a, .toggle'
  }
};

// Função para obter configuração baseada no tipo
export function getNavigationConfig(type) {
  const configs = {
    angular_fuse: {
      mainPanelSelector: 'fuse-vertical-navigation',
      mainItemsSelector: 'fuse-vertical-navigation-aside-item',
      asideWrapperSelector: '.fuse-vertical-navigation-aside-wrapper',
      finalLinkSelector: 'a',
      collapsableSelector: '.fuse-vertical-navigation-item',
      clickTargetSelector: 'div > div'
    },
    
    bootstrap: {
      mainPanelSelector: '.navbar-nav, #navigation, nav',
      mainItemsSelector: '.navbar-nav a[href]:not([href="#"]):not([href=""]), #navigation a[href]:not([href="#"]):not([href=""]), nav a[href]:not([href="#"]):not([href=""])',
      asideWrapperSelector: '.dropdown-menu',
      finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
      collapsableSelector: '.dropdown',
      clickTargetSelector: 'a'
    },
    
    generic: {
      mainPanelSelector: '#navigation, #horizontal-menu, nav, .navbar, .menu, .header, .sidebar',
      mainItemsSelector: 'a[href]:not([href="#"]):not([href=""])',
      asideWrapperSelector: '.dropdown-menu, .submenu',
      finalLinkSelector: 'a[href]:not([href="#"]):not([href=""])',
      collapsableSelector: '.dropdown, .has-submenu',
      clickTargetSelector: 'a'
    }
  };

  return configs[type] || configs.generic;
}

export default navigationConfigs;
