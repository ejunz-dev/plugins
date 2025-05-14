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
    });


    ctx.i18n.load('zh', {
        'b001home_main': 'Jacka 的雅思频道',
        'b001home': 'Jacka 的雅思频道',

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
    ctx.once('handler/after', async (that) => {
        if (that.domain._id === 'B001') 
            if (that.domain.maps_announce) {
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'maps_announce', '', 'markdown', 'Maps Announce'),
            );
            if (that.domain.team_announce) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'team_announce', '', 'markdown', 'Team Announce'),
                );
            }
            if (that.domain.training_announce) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'training_announce', '', 'markdown', 'Training Announce'),
                );
            }
        }
    });


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

