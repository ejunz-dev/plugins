import $ from 'jquery';
import { NamedPage, addPage } from '@ejunz/ui-default';
import { i18n, request, tpl } from '@ejunz/ui-default';

addPage(new NamedPage('a001csnews', async () => {
    $('#updateButton').on('click', async function() {
        try {
            const response = await request.get(`/d/${UiContext.domainId}/api-csnews`);
            setTimeout(() => {
                location.reload();
            }, 1000);
        } catch (error) {
            console.error('API error:', error);
        }
    });
}));