import $ from 'jquery';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

const target = UiContext.domainId
  
function getLogoDom() {
  const $logo = $('.nav__logo');
  return $logo.length ? $logo : null;
}

addPage(new AutoloadPage('A002_main', async () => {
  const $logo = getLogoDom();
  if (target === 'A002') {
    if ($logo) {
      $logo.attr('src', '/file/2/A002.jpeg');
    }
  }
}));