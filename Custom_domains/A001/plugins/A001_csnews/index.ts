import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,AccessDeniedError,
    InvalidJoinInvitationCodeError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from 'ejun';
import type { DomainDoc } from 'ejun';
import { PERM, PERMS_BY_FAMILY, PRIV,SettingModel } from 'ejun';
import * as discussion from 'ejun';
import {
    Handler, param, post, query, requireSudo, Types,domain,Context,DomainModel,OplogModel,SystemModel,
    UserModel,ContestModel,TrainingModel,DiscussionModel,ProblemModel,camelCase, md5,superagent
} from 'ejun';
import { log2 } from 'ejun'
import yaml from 'js-yaml';
import _ from 'lodash';
import MarkdownIt from 'markdown-it';

export class A001CsnewHandler extends Handler {
    async get({ domainId }) {
        const allowedDomainIds = ['A001'];
        if (!allowedDomainIds.includes(domainId)) {
            throw new AccessDeniedError('Access denied for this domain');
        }
        this.response.template = 'csnews_domain.html';
        this.response.body = {
            domain: this.domain,
        };
    }
}
export class A001CsnewApiHandler extends Handler {
    async get({ domainId }) {
        const allowedDomainIds = ['A001'];
        if (!allowedDomainIds.includes(domainId)) {
            throw new AccessDeniedError('Access denied for this domain');
        }

        try {
            const res = await superagent.get('https://steam-api.ejunz.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=1');

            const newsItems = res.body.appnews.newsitems.map(item => {
                const sections: { title: string; content: string[] }[] = [];
                const lines = item.contents.split('\n');
                let currentSection: { title: string; content: string[] } | null = null;

                lines.forEach(line => {
                    if (line.match(/^\[ [A-Z ]+ \]$/)) {
                        if (currentSection) {
                            sections.push(currentSection);
                        }
                        currentSection = { title: line.slice(2, -2), content: [] };
                    } else if (currentSection) {
                        currentSection.content.push(line);
                    }
                });

                if (currentSection) {
                    sections.push(currentSection);
                }

                return {
                    title: item.title,
                    author: item.author,
                    date: new Date(item.date * 1000).toLocaleDateString(),
                    url: item.url,
                    sections: sections
                };
            });

            const md = new MarkdownIt();
            let markdownContent = newsItems.map(item => {
                let markdown = `# ${item.title}\n\n`;
                markdown += `**Author:** ${item.author}\n\n`;
                markdown += `**Date:** ${item.date}\n\n`;
                markdown += `**URL:** [Read more](${item.url})\n\n`;

                item.sections.forEach(section => {
                    markdown += `## ${section.title}\n\n`;
                    section.content.forEach(line => {
                        line = line.replace(/\[list\]/g, '').replace(/\[\*\]/g, '- ').replace(/\[\/list\]/g, '');
                        line = line.replace(/\[i\](.*?)\[\/i\]/g, '*$1*');
                        markdown += `${line}\n`;
                    });
                    markdown += `\n`;
                });

                return md.render(markdown);
            }).join('\n\n');

            markdownContent = markdownContent.replace(/\n/g, '');
            markdownContent = markdownContent.replace(/^'+|'+$/g, '');


            this.response.body = {
                appid: res.body.appnews.appid,
                markdown: markdownContent
            };
            this.response.type = 'text/markdown';
            console.log('this.response.body', JSON.stringify(this.response.body, null, 2));
            return;

        } catch (error) {
            console.error('Error fetching news:', error);
            this.response.body = {
                error: 'Failed to fetch news',
            };
        }
    }
}

export async function apply(ctx: Context) {

    const CheckSpaceStore = (that) => {
        const domainId = that.domain._id;
        console.log(domainId);
        if (domainId !== 'A001') {
            throw new AccessDeniedError('Access denied for this domain');
        }
        return true;
    }

    ctx.i18n.load('zh', {
        'CS_NEWS': 'CS新闻',
        'csnews_domain': 'CS新闻',
        'Fetching CS News...': '正在获取CS新闻...',
        'Reloading...': '正在刷新页面...',
        'CS News updated successfully!': 'CS新闻更新成功!',
        'Failed to update CS News.': '更新CS新闻失败。',
    });

    ctx.i18n.load('en', {
        'CS_NEWS': 'CS News',
        'csnews_domain': 'CS News',
        'Fetching CS News...': 'Fetching CS News...',
        'Reloading...': 'Reloading...',
        'CS News updated successfully!': 'CS News updated successfully!',
        'Failed to update CS News.': 'Failed to update CS News.',
    });


    const PERM = {
        PERM_VIEW_CSNEWS: 1n << 88n,
    };

    global.Ejunz.model.builtin.registerPluginPermission(
        'spaces',
        PERM.PERM_VIEW_CSNEWS, 
        'View CS News',
        true,
        false,
        'csnews'
    );



    ctx.Route('csnews_domain', '/csnews', A001CsnewHandler, PERM.PERM_VIEW_CSNEWS);
    ctx.Route('csnews_api', '/api-csnews', A001CsnewApiHandler, PERM.PERM_VIEW_CSNEWS);


   

    ctx.on('handler/after/A001CsnewApi#get', async (that) => {
        await DomainModel.edit('A001', { csnews: that.response.body.markdown });
    });
}
