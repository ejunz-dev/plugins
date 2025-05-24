import { Context } from 'ejun';
import { SettingModel } from 'ejun';
import { load } from 'js-yaml';
import { SystemModel } from 'ejun';
import { DiscussionModel } from 'ejun';
import { DomainModel } from 'ejun';



export async function apply(ctx: Context) {
    ctx.i18n.load('en', {
        'a004home_main': 'EVE频道',
        'a004home': 'EVE频道',
    });


    ctx.i18n.load('zh', {
        'a004home_main': 'EVE频道',
        'a004home': 'EVE频道',
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
    //     if (that.domain._id === 'A001') 
    //         if (that.domain.maps_announce) {
    //         SettingModel.DomainSetting(
    //             SettingModel.Setting('setting_domain', 'maps_announce', '', 'markdown', 'Maps Announce'),
    //         );
    //         if (that.domain.team_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'team_announce', '', 'markdown', 'Team Announce'),
    //             );
    //         }
    //         if (that.domain.training_announce) {
    //             SettingModel.DomainSetting(
    //                 SettingModel.Setting('setting_domain', 'training_announce', '', 'markdown', 'Training Announce'),
    //             );
    //         }
    //     }
    // });

    ctx.once('handler/before/DomainEdit#get', async (that) => {
        if (that.domain._id === 'A004') 
            if (!that.domain.a004_announce1) {
            SettingModel.DomainSetting(
                SettingModel.Setting('setting_domain', 'a004_announce1', '', 'markdown', 'A004 Announce1'),
            );
            if (!that.domain.a004_announce2) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'a004_announce2', '', 'markdown', 'A004 Announce2'),
                );
            }
            if (!that.domain.a004_announce3) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'a004_announce3', '', 'markdown', 'A004 Announce3'),
                );
            }
            if (!that.domain.a004_announce4) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'a004_announce4', '', 'markdown', 'A004 Announce4'),
                );
            }
            if (!that.domain.a004_announce5) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'a004_announce5', '', 'markdown', 'A004 Announce5'),
                );
            }
            if (!that.domain.a004_announce6) {
                SettingModel.DomainSetting(
                    SettingModel.Setting('setting_domain', 'a004_announce6', '', 'markdown', 'A004 Announce6'),
                );
            }       
         }
    });


    async function postInitDiscussionNode({ domainId }) {
        if (domainId == 'A004') {
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
