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
      $logo.attr('src', 'https://picsum.photos/300/200');
    }
  } 
}));
