import $ from 'jquery';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

const target = UiContext.domainId
  
function getLogoDom() {
  const $logo = $('.nav__logo');
  return $logo.length ? $logo : null;
}

addPage(new AutoloadPage('A004_main', async () => {
  const $logo = getLogoDom();
  if (target === 'A004') {
    if ($logo) {
      $logo.attr('src', '/file/2/A004.jpeg');
    }
  }
}));