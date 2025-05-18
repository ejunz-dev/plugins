import { Context } from 'ejun';
import { SettingModel } from 'ejun';
import { load } from 'js-yaml';
import { SystemModel } from 'ejun';
import { DiscussionModel } from 'ejun';
import { DomainModel } from 'ejun';



export async function apply(ctx: Context) {
    ctx.i18n.load('en', {
        'ejunzhome': 'Home',
        'ejunzdev': 'Dev Channel',
        'ejunzservice': 'Service Center',
        'ejunzcommunity': 'Community Hall',
        'ejunzhome_main': 'Home',
        'ejunzdev_main': 'Dev Channel',
        'ejunzservice_main': 'Service Center',
        'ejunzcommunity_main': 'Community Hall',
        'ejunzdomain': 'Domain Cluster',
        'ejunzdomain_main': 'Domain Cluster',
    });


    ctx.i18n.load('zh', {
        'ejunzhome': '首页',
        'ejunzdev': '开发频道',
        'ejunzservice': '服务中心',
        'ejunzcommunity': '社区大厅',
        'ejunzhome_main': '首页',
        'ejunzdev_main': '开发频道',
        'ejunzservice_main': '服务中心',
        'ejunzcommunity_main': '社区大厅',
        'ejunzdomain': '域集群',
        'ejunzdomain_main': '域集群',
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
    // TODO: domains' setting devide
    // ctx.once('handler/before/DomainEdit#get', async (that) => {
    //     if (that.domain._id === 'system') 
    //         console.log('home_announce', that.domain.home_announce)
    //         if (that.domain.community_announce) {
    //         SettingModel.DomainSetting(
    //             SettingModel.Setting('setting_domain', 'community_announce', '', 'markdown', 'Community Announce'),
    //         );
    //         if (that.domain.dev_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'dev_announce', '', 'markdown', 'Dev Announce'),
    //             );
    //         }
    //         if (that.domain.service_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'service_announce', '', 'markdown', 'Service Announce'),
    //             );
    //         }
    //         if (that.domain.domain_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'domain_announce', '', 'markdown', 'Domain Announce'),
    //             );
    //         }
    //         if (that.domain.home_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'home_announce', '', 'markdown', 'Home Announce'),
    //             );
    //         }
    //         if (that.domain.home_announce1) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'home_announce1', '', 'markdown', 'Home Announce1'),
    //             );
    //         }
    //         if (!that.domain.home_announce2) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'home_announce2', '', 'markdown', 'Home Announce2'),
    //             );
    //         }
    //     }
    // });



    async function postInitDiscussionNode({ domainId }) {
        if (domainId == 'system') {
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

    // async get() {
    //     this.response.template = 'domain_edit.html';
    //     this.response.body = { current: this.domain, settings: DOMAIN_SETTINGS };
    // }


    // ctx.withHandlerClass('DomainEditHandler', (DomainEditHandler) => {
    //     DomainEditHandler.prototype.get = get;
    //     DomainEditHandler.prototype.post = post;
    // });

}



// class DomainEditHandler extends ManageHandler {
//     async get() {
//         this.response.template = 'domain_edit.html';
//         this.response.body = { current: this.domain, settings: DOMAIN_SETTINGS };
//     }

//     async post(args) {
//         if (args.operation) return;
//         const $set = {};
//         for (const key in args) {
//             if (DOMAIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
//         }
//         await domain.edit(args.domainId, $set);
//         this.response.redirect = this.url('domain_dashboard');
//     }
// }
