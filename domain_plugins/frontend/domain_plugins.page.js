import $ from 'jquery';
import {
    AutoloadPage,addPage
  } from '@ejunz/ui-default';

addPage(new AutoloadPage('DomainPluginsPage', async () => {
    $('.domain-users tbody').each(function() {
        var familyName = $(this).find('tr:first-child td.col--family').text().trim();
        if (familyName == 'plugins') {
            $(this).css('display', 'none');
        }
    });

$(document).ready(function() {
    $('.domain-user tbody').each(function() {
        var familyName = $(this).find('tr:first-child td.col--family').text().trim();
        if (familyName !== 'plugins') {
            $(this).css('display', 'none');
            
        }
    });
});
}));
