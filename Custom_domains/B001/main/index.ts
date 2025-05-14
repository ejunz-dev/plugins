import { Context } from 'ejun';
import { SettingModel } from 'ejun';
import { load } from 'js-yaml';
import { SystemModel } from 'ejun';
import { DiscussionModel } from 'ejun';
import { DomainModel } from 'ejun';



export async function apply(ctx: Context) {
    ctx.i18n.load('en', {
        'b001home_main': 'Jacka\'s IELTS Channel',
        'b001home': 'Jacka\'s IELTS Channel',
        'b001hub': 'Learning Center',
        'b001hub_main': 'Learning Center',
        'b001share': 'Share Center',
        'b001share_main': 'Share Center',
    });


    ctx.i18n.load('zh', {
        'b001home_main': 'jacka的雅思频道',
        'b001home': 'jacka的雅思频道',
        'b001hub': '学习中心',
        'b001hub_main': '学习中心', 
        'b001share': '分享中心',
        'b001share_main': '分享中心', 
    });


    // PLUGINS
    // ctx.once('handler/after', async (that) => {
    //     if (that.domain._id === 'A001') 
    //         if (that.domain.csnews) {
    //         SettingModel.DomainSetting(
    //             SettingModel.Setting('setting_domain', 'csnews', '', 'markdown', 'CSNEWS'),
    //         );
    //     }
    // });

    // SPACES
    // ctx.once('handler/before/DomainEdit#get', async (that) => {
    //     if (that.domain.hub_announce) {
    //         SettingModel.DomainSetting(
    //             SettingModel.Setting('setting_domain', 'hub_announce', '', 'markdown', 'Hub Announce')
    //         );
    //     }
    //     if (that.domain.share_announce) {
    //         SettingModel.DomainSetting(
    //             SettingModel.Setting('setting_domain', 'share_announce', '', 'markdown', 'Share Announce')
    //         );
    //     }

    // });


    async function postInitDiscussionNode({ domainId }) {
        if (domainId == 'B001') {
            const nodes = load(this.domain.nodes);
            console.log('nodes,',nodes);
            await DiscussionModel.flushNodes(domainId);
            for (const category of Object.keys(nodes)) {
                for (const item of nodes[category]) {
                    // eslint-disable-next-line no-await-in-loop
                    const curr = await DiscussionModel.getNode(domainId, item.name);
                    // eslint-disable-next-line no-await-in-loop
                    if (!curr) await DiscussionModel.addNode(domainId, item.name, category, item.pic ? { pic: item.pic } : undefined);
                }
            }
            this.back();
        }else{
            const nodes = load(SystemModel.get('discussion.nodes'));
            await DiscussionModel.flushNodes(domainId);
            for (const category of Object.keys(nodes)) {
                for (const item of nodes[category]) {
                    // eslint-disable-next-line no-await-in-loop
                    const curr = await DiscussionModel.getNode(domainId, item.name);
                    // eslint-disable-next-line no-await-in-loop
                    if (!curr) await DiscussionModel.addNode(domainId, item.name, category, item.pic ? { pic: item.pic } : undefined);
                }
            }
            this.back();
        }
    }

    ctx.withHandlerClass('DomainDashboardHandler', (DomainDashboardHandler) => {
        DomainDashboardHandler.prototype.postInitDiscussionNode = postInitDiscussionNode;
    });

}
