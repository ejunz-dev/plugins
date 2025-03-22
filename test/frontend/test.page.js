import $ from 'jquery';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

const target = UiContext.domainId
  
function getLogoDom() {
  const $logo = $('.nav__logo');
  return $logo.length ? $logo : null;
}

addPage(new AutoloadPage('testPage', async () => {
  const $logo = getLogoDom();
  if (target === 'A001') {
    if ($logo) {
      $logo.attr('src', '/file/2/Counter-Strike_2_%2528Icon%2529.webp');
    }
  }
  if (target === 'A002') {
    if ($logo) {
      $logo.attr('src', '/file/2/Yin_and_Yang_symbol.svg.png');
    }
  }
}));
