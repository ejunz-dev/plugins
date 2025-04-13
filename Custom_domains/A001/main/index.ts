import { Context } from 'ejun';
import { SettingModel } from 'ejun';
import { load } from 'js-yaml';
import { SystemModel } from 'ejun';
import { DiscussionModel } from 'ejun';
import { DomainModel } from 'ejun';

const DEFAULT_NODES = {
    开黑: [
        { pic: '预约', name: '预约' },
        { pic: 'yy', name: '语音' },
    ],
    地图: [
        { pic: 'dust2', name: '沙2' },
    ],
    比赛: [
        { name: '比赛' },
    ],
};


export async function apply(ctx: Context) {
    ctx.i18n.load('en', {
        'a001home_main': 'Jacka\'s Team Space',
        'a001home': 'Jacka\'s Team Space',
        'a001team_main': 'Tactics Channel',
        'a001team': 'Tactics Channel',
        'a001training_main': 'Training Channel',
        'a001training': 'Training Channel',
        'a001maps_main': 'Map Channel',
        'a001maps': 'Map Channel',
        'csnews': 'CSNEWS',
        'csnews_domain': 'CSNEWS',
    });


    ctx.i18n.load('zh', {
        "HLTV": "赛程",
        'a001home_main': 'Jacka小队总频道',
        'a001home': 'Jacka小队总频道',
        'a001team_main': '战术频道',
        'a001team': '战术频道',
        'a001training_main': '训练频道',
        'a001training': '训练频道',
        'a001maps_main': '道具频道',
        'a001maps': '道具频道',
        'csnews': 'CS新闻',
        'csnews_domain': 'CS新闻',
    });


    ctx.once('handler/after', async (that) => {
        if (that.domain._id === 'A001') 
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'nodes', DEFAULT_NODES, 'yaml', 'discussion.nodes', 'Discussion Nodes'),
            );
    }
);

    ctx.once('handler/after', async (that) => {
        if (that.domain._id === 'A001') 
            if (that.domain.csnews) {
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'csnews', '', 'markdown', 'CSNEWS'),
            );
        }
    });

    async function postInitDiscussionNode({ domainId }) {
        if (domainId == 'A001') {
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

