import $ from 'jquery';
import { NamedPage, addPage } from '@ejunz/ui-default';
import { i18n, request, tpl } from '@ejunz/ui-default';
import { Notification } from '@ejunz/ui-default';

addPage(new NamedPage('a001csnews', async () => {
    $('#updateButton').on('click', async function() {
        try {
            Notification.success(i18n('Fetching CS News...'));
            const response = await request.get(`/d/${UiContext.domainId}/api-csnews`);
            if (response) {
                Notification.success(i18n('CS News updated successfully!'));
                Notification.success(i18n('Reloading...'));
                location.reload();
            } else {
                Notification.error(i18n('Failed to update CS News.'));
            }
        } catch (error) {
            console.error('API error:', error);
        }
    });
}));