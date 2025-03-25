import $ from 'jquery';
import { i18n } from '@ejunz/ui-default';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

addPage(new AutoloadPage('DomainPluginsPage', async () => {
    $('.domain-users tbody').each(function() {
        var familyName = $(this).find('tr:first-child td.col--family').text().trim();
        if (familyName == 'plugins' || familyName == '本域插件') {
            $(this).css('display', 'none');
        }
    });

$(document).ready(function() {
    $('.domain-user tbody').each(function() {
        var familyName = $(this).find('tr:first-child td.col--family').text().trim();
        if (familyName !== 'plugins' && familyName !== '本域插件') {
            $(this).css('display', 'none');
        }
    });
});
}));
