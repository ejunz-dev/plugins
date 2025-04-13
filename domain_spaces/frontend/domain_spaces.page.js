import $ from 'jquery';
import { i18n } from '@ejunz/ui-default';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

addPage(new AutoloadPage('DomainSpacesPage', async () => {
$(document).ready(function() {
    $('.domain-use tbody').each(function() {
        var familyName = $(this).find('tr:first-child td.col--family').text().trim();
        if (familyName !== 'Domain Spaces' && familyName !== '本域空间') {
            $(this).css('display', 'none');
        }
    });
});
}));
