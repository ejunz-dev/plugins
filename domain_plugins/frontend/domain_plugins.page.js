import $ from 'jquery';
import { i18n } from '@ejunz/ui-default';
import {
    AutoloadPage,addPage,NamedPage
  } from '@ejunz/ui-default';

addPage(new AutoloadPage('DomainPluginsPage', async () => {
    $(document).ready(function() {
        $('.domain-user tbody').each(function() {
            var familyName = $(this).find('tr:first-child td.col--family').text().trim();
            if (familyName !== 'Domain Plugins') {
                $(this).css('display', 'none');
            }
        });
    });
}));
